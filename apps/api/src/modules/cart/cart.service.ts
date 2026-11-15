import { Injectable } from '@nestjs/common';
import { Brand, Cart, CartItem, Category, Coupon, Prisma, Product, ProductImage } from '@prisma/client';
import { AppException, ErrorCode, conflict, notFound, unprocessable } from '../../common/errors';
import { PrismaService, Tx } from '../../prisma/prisma.service';
import { availabilityOf, fallbackImage, MAX_QUANTITY_PER_PRODUCT } from '../catalog/catalog.mapper';
import { CouponsService } from './coupons.service';
import { CartDto, CartIssueDto, CartItemDto } from './dto/cart.dto';
import { computePricing, PricingCoupon, PricingLine } from './pricing';
import { ShippingService } from './shipping.service';

export const MAX_CART_LINES = 50;

/** Who owns the cart: an authenticated user or a guest identified by its cart token. */
export interface CartOwner {
  userId?: number;
  guestToken?: string;
}

const cartInclude = {
  coupon: true,
  items: {
    orderBy: { id: 'asc' },
    include: {
      product: { include: { brand: true, category: true, images: { orderBy: { position: 'asc' }, take: 1 } } },
    },
  },
} satisfies Prisma.CartInclude;

type CartItemWithProduct = CartItem & {
  product: Product & { brand: Brand; category: Category; images: ProductImage[] };
};
export type CartWithItems = Cart & { coupon: Coupon | null; items: CartItemWithProduct[] };

export function itemIssues(item: { quantity: number; product: Pick<Product, 'isActive' | 'stock'> }): CartIssueDto[] {
  if (!item.product.isActive) {
    return [{ code: 'UNAVAILABLE', message: 'This product is no longer available' }];
  }
  if (item.product.stock <= 0) {
    return [{ code: 'OUT_OF_STOCK', message: 'Out of stock', availableStock: 0 }];
  }
  if (item.quantity > item.product.stock) {
    return [
      {
        code: 'INSUFFICIENT_STOCK',
        message: `Only ${item.product.stock} ${item.product.stock === 1 ? 'unit' : 'units'} left`,
        availableStock: item.product.stock,
      },
    ];
  }
  return [];
}

@Injectable()
export class CartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly coupons: CouponsService,
    private readonly shipping: ShippingService,
  ) {}

  // ─── Loading ───────────────────────────────────────────────────────────

  private async findCart(owner: CartOwner, db: Tx | PrismaService = this.prisma): Promise<CartWithItems | null> {
    if (owner.userId) return db.cart.findUnique({ where: { userId: owner.userId }, include: cartInclude });
    if (owner.guestToken && isUuid(owner.guestToken)) {
      const cart = await db.cart.findUnique({ where: { token: owner.guestToken }, include: cartInclude });
      // A guest token never gives access to a user's cart.
      return cart && cart.userId === null ? cart : null;
    }
    return null;
  }

  private async findOrCreateCart(owner: CartOwner, db: Tx | PrismaService = this.prisma): Promise<CartWithItems> {
    const existing = await this.findCart(owner, db);
    if (existing) return existing;
    if (owner.userId) {
      return db.cart.upsert({
        where: { userId: owner.userId },
        create: { userId: owner.userId },
        update: {},
        include: cartInclude,
      });
    }
    return db.cart.create({ data: {}, include: cartInclude });
  }

  async getCart(owner: CartOwner): Promise<CartDto> {
    const cart = await this.findCart(owner);
    return this.toDto(cart, owner.userId);
  }

  // ─── Mutations ─────────────────────────────────────────────────────────

  async addItem(owner: CartOwner, productId: number, quantity: number): Promise<CartDto> {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw notFound(ErrorCode.PRODUCT_NOT_FOUND, 'Product not found');
    if (!product.isActive) throw unprocessable(ErrorCode.PRODUCT_UNAVAILABLE, 'This product is no longer available');
    if (product.stock <= 0) throw conflict(ErrorCode.OUT_OF_STOCK, 'The product is out of stock', { availableStock: 0 });

    const cart = await this.findOrCreateCart(owner);
    const existing = cart.items.find((i) => i.productId === productId);
    const newQuantity = (existing?.quantity ?? 0) + quantity;
    this.assertQuantity(newQuantity, product, existing?.quantity ?? 0);
    if (!existing && cart.items.length >= MAX_CART_LINES) {
      throw unprocessable(ErrorCode.MAX_QUANTITY_EXCEEDED, `The cart can hold at most ${MAX_CART_LINES} different products`);
    }

    try {
      await this.prisma.cartItem.upsert({
        where: { cartId_productId: { cartId: cart.id, productId } },
        create: { cartId: cart.id, productId, quantity: newQuantity, unitPriceCentsSnapshot: product.priceCents },
        update: { quantity: newQuantity, unitPriceCentsSnapshot: product.priceCents },
      });
    } catch (err) {
      if ((err as { code?: string }).code !== 'P2002') throw err;
      // Concurrent insert of the same product: retry as an increment.
      await this.prisma.cartItem.update({
        where: { cartId_productId: { cartId: cart.id, productId } },
        data: { quantity: { increment: quantity }, unitPriceCentsSnapshot: product.priceCents },
      });
    }
    await this.touch(cart.id);
    return this.reload(cart.id, owner.userId);
  }

  async updateItem(owner: CartOwner, itemId: number, quantity: number): Promise<CartDto> {
    const cart = await this.findCart(owner);
    const item = cart?.items.find((i) => i.id === itemId);
    if (!cart || !item) throw notFound(ErrorCode.CART_ITEM_NOT_FOUND, 'The product is not in the cart');
    if (!item.product.isActive) {
      throw unprocessable(ErrorCode.PRODUCT_UNAVAILABLE, 'This product is no longer available. Remove it from the cart');
    }
    if (item.product.stock <= 0) {
      throw conflict(ErrorCode.OUT_OF_STOCK, 'The product is out of stock. Remove it from the cart', { availableStock: 0 });
    }
    this.assertQuantity(quantity, item.product, 0);
    await this.prisma.cartItem.update({
      where: { id: item.id },
      data: { quantity, unitPriceCentsSnapshot: item.product.priceCents },
    });
    await this.touch(cart.id);
    return this.reload(cart.id, owner.userId);
  }

  async removeItem(owner: CartOwner, itemId: number): Promise<CartDto> {
    const cart = await this.findCart(owner);
    const item = cart?.items.find((i) => i.id === itemId);
    if (!cart || !item) throw notFound(ErrorCode.CART_ITEM_NOT_FOUND, 'The product is not in the cart');
    await this.prisma.cartItem.delete({ where: { id: item.id } });
    await this.touch(cart.id);
    return this.reload(cart.id, owner.userId);
  }

  async clear(owner: CartOwner): Promise<CartDto> {
    const cart = await this.findCart(owner);
    if (!cart) return this.toDto(null, owner.userId);
    await this.prisma.$transaction([
      this.prisma.cartItem.deleteMany({ where: { cartId: cart.id } }),
      this.prisma.cart.update({ where: { id: cart.id }, data: { couponId: null } }),
    ]);
    return this.reload(cart.id, owner.userId);
  }

  async applyCoupon(owner: CartOwner, code: string): Promise<CartDto> {
    const cart = await this.findCart(owner);
    if (!cart || cart.items.length === 0) throw unprocessable(ErrorCode.CART_EMPTY, 'The cart is empty');
    const coupon = await this.coupons.findByCode(code);
    await this.coupons.validate(coupon, { userId: owner.userId, lines: this.pricingLines(cart) });
    await this.prisma.cart.update({ where: { id: cart.id }, data: { couponId: coupon!.id } });
    return this.reload(cart.id, owner.userId);
  }

  async removeCoupon(owner: CartOwner): Promise<CartDto> {
    const cart = await this.findCart(owner);
    if (!cart) return this.toDto(null, owner.userId);
    await this.prisma.cart.update({ where: { id: cart.id }, data: { couponId: null } });
    return this.reload(cart.id, owner.userId);
  }

  /**
   * Merges a guest cart into the user's cart (typically right after login).
   * Quantities are added and capped to the available stock and the per-product maximum;
   * unavailable products are dropped. The guest cart is deleted.
   */
  async merge(userId: number, guestToken: string): Promise<CartDto> {
    const guest = await this.findCart({ guestToken });
    if (!guest) throw notFound(ErrorCode.CART_NOT_FOUND, 'Guest cart not found');
    const cartId = await this.prisma.$transaction(async (tx) => {
      const userCart = await this.findOrCreateCart({ userId }, tx);
      for (const item of guest.items) {
        if (!item.product.isActive || item.product.stock <= 0) continue;
        const existing = userCart.items.find((i) => i.productId === item.productId);
        const quantity = Math.min(
          (existing?.quantity ?? 0) + item.quantity,
          item.product.stock,
          MAX_QUANTITY_PER_PRODUCT,
        );
        await tx.cartItem.upsert({
          where: { cartId_productId: { cartId: userCart.id, productId: item.productId } },
          create: { cartId: userCart.id, productId: item.productId, quantity, unitPriceCentsSnapshot: item.product.priceCents },
          update: { quantity, unitPriceCentsSnapshot: item.product.priceCents },
        });
      }
      await tx.cart.delete({ where: { id: guest.id } });
      await tx.cart.update({ where: { id: userCart.id }, data: { updatedAt: new Date() } });
      return userCart.id;
    });
    return this.reload(cartId, userId);
  }

  // ─── Helpers used by checkout ──────────────────────────────────────────

  /** Loads the user's cart inside a transaction (call lockUserCart first to serialize checkouts). */
  async loadForCheckout(userId: number, tx: Tx): Promise<CartWithItems | null> {
    return this.findCart({ userId }, tx);
  }

  /** Row-level lock on the user's cart: concurrent checkouts of the same user are serialized. */
  async lockUserCart(userId: number, tx: Tx): Promise<void> {
    await tx.$queryRaw`SELECT id FROM "Cart" WHERE "userId" = ${userId} FOR UPDATE`;
  }

  pricingLines(cart: CartWithItems, onlyPurchasable = true): PricingLine[] {
    return cart.items
      .filter((i) => !onlyPurchasable || itemIssues(i).length === 0)
      .map((i) => ({
        productId: i.productId,
        categoryId: i.product.categoryId,
        unitPriceCents: i.product.priceCents,
        quantity: i.quantity,
      }));
  }

  // ─── Internals ─────────────────────────────────────────────────────────

  private assertQuantity(quantity: number, product: Pick<Product, 'stock'>, _current: number): void {
    if (quantity > MAX_QUANTITY_PER_PRODUCT) {
      throw unprocessable(
        ErrorCode.MAX_QUANTITY_EXCEEDED,
        `You can buy at most ${MAX_QUANTITY_PER_PRODUCT} units of this product`,
        { maxQuantity: MAX_QUANTITY_PER_PRODUCT },
      );
    }
    if (quantity > product.stock) {
      throw conflict(ErrorCode.INSUFFICIENT_STOCK, `Only ${product.stock} ${product.stock === 1 ? 'unit' : 'units'} left`, {
        availableStock: product.stock,
        requested: quantity,
      });
    }
  }

  private async touch(cartId: number): Promise<void> {
    await this.prisma.cart.update({ where: { id: cartId }, data: { updatedAt: new Date() } });
  }

  private async reload(cartId: number, userId?: number): Promise<CartDto> {
    const cart = await this.prisma.cart.findUnique({ where: { id: cartId }, include: cartInclude });
    return this.toDto(cart, userId);
  }

  async toDto(cart: CartWithItems | null, userId?: number): Promise<CartDto> {
    const standard = await this.shipping.defaultMethod();
    const shipping = standard
      ? { code: standard.code, priceCents: standard.priceCents, freeOverCents: standard.freeOverCents }
      : null;
    if (!cart) {
      const empty = computePricing([], null, shipping);
      return {
        id: null,
        token: null,
        items: [],
        itemsCount: 0,
        coupon: null,
        couponError: null,
        totals: {
          subtotalCents: 0,
          discountCents: 0,
          shippingEstimateCents: 0,
          totalCents: 0,
          taxCents: 0,
          freeShippingThresholdCents: standard?.freeOverCents ?? null,
          amountToFreeShippingCents: empty.amountToFreeShippingCents,
        },
        hasIssues: false,
        updatedAt: null,
      };
    }

    const lines = this.pricingLines(cart);
    let pricingCoupon: PricingCoupon | null = null;
    let couponError: CartDto['couponError'] = null;
    if (cart.coupon) {
      try {
        pricingCoupon = (await this.coupons.validate(cart.coupon, { userId, lines })).pricing;
      } catch (err) {
        if (!(err instanceof AppException)) throw err;
        couponError = { code: err.code, message: err.message };
      }
    }
    const pricing = computePricing(lines, pricingCoupon, shipping);
    const items: CartItemDto[] = cart.items.map((i) => {
      const issues = itemIssues(i);
      return {
        id: i.id,
        productId: i.productId,
        product: {
          id: i.product.id,
          sku: i.product.sku,
          slug: i.product.slug,
          name: i.product.name,
          brandName: i.product.brand.name,
          categoryId: i.product.categoryId,
          imageUrl: i.product.images[0]?.url ?? fallbackImage(i.product.category.slug),
          priceCents: i.product.priceCents,
          compareAtPriceCents: i.product.compareAtPriceCents,
          stock: i.product.stock,
          availability: availabilityOf(i.product),
          isActive: i.product.isActive,
        },
        quantity: i.quantity,
        unitPriceCents: i.product.priceCents,
        lineTotalCents: i.product.priceCents * i.quantity,
        priceChanged: i.unitPriceCentsSnapshot !== i.product.priceCents,
        previousUnitPriceCents: i.unitPriceCentsSnapshot !== i.product.priceCents ? i.unitPriceCentsSnapshot : null,
        issues,
        addedAt: i.createdAt,
      };
    });
    return {
      id: cart.id,
      token: cart.userId ? null : cart.token,
      items,
      itemsCount: cart.items.reduce((acc, i) => acc + i.quantity, 0),
      coupon: cart.coupon
        ? { code: cart.coupon.code, description: cart.coupon.description, type: cart.coupon.type, value: cart.coupon.value }
        : null,
      couponError,
      totals: {
        subtotalCents: pricing.subtotalCents,
        discountCents: pricing.discountCents,
        shippingEstimateCents: pricing.shippingCents,
        totalCents: pricing.totalCents,
        taxCents: pricing.taxCents,
        freeShippingThresholdCents: standard?.freeOverCents ?? null,
        amountToFreeShippingCents: pricing.amountToFreeShippingCents,
      },
      hasIssues: items.some((i) => i.issues.length > 0),
      updatedAt: cart.updatedAt,
    };
  }
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
