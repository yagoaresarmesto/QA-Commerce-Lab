import { Injectable } from '@nestjs/common';
import {
  ActorType,
  CouponType,
  OrderPaymentStatus,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  Product,
  Role,
  UserStatus,
} from '@prisma/client';
import { AppConfig } from '../../config/app-config';
import { ErrorCode, badRequest, conflict, notFound } from '../../common/errors';
import { RequestContext } from '../../common/request-context';
import { hashPassword } from '../../common/utils/crypto';
import { vatIncluded } from '../../common/utils/money';
import { randomCode } from '../../common/utils/text';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminCatalogService } from '../admin/admin-catalog.service';
import { AdminSalesService } from '../admin/admin-sales.service';
import { AuthService } from '../auth/auth.service';
import { TokenService } from '../auth/token.service';
import { CartService } from '../cart/cart.service';
import { computePricing } from '../cart/pricing';
import { MAX_QUANTITY_PER_PRODUCT } from '../catalog/catalog.mapper';
import { OrderLifecycleService } from '../orders/order-lifecycle.service';
import { OrdersService } from '../orders/orders.service';
import { toUserDto } from '../users/dto/user.dto';
import { toAddressDto } from '../users/users.service';
import { CreateTestCouponDto, CreateTestOrderDto, CreateTestProductDto, CreateTestUserDto, PrepareCartDto, TestItemDto } from './dto/testing.dto';

export const DEFAULT_TEST_PASSWORD = 'Test1234!';

export function resolveRunId(explicit?: string): string {
  return explicit ?? RequestContext.testRunId() ?? `auto-${randomCode(8).toLowerCase()}`;
}

function emailSafe(runId: string): string {
  return runId.toLowerCase().replace(/[^a-z0-9-]/g, '-');
}

const ORDER_PATH: OrderStatus[] = [OrderStatus.PAID, OrderStatus.PREPARING, OrderStatus.SHIPPED, OrderStatus.DELIVERED];

/** Reusable data builders for the testing API and scenarios. Everything is tagged with the run id. */
@Injectable()
export class FixturesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly auth: AuthService,
    private readonly catalog: AdminCatalogService,
    private readonly sales: AdminSalesService,
    private readonly cart: CartService,
    private readonly lifecycle: OrderLifecycleService,
    private readonly orders: OrdersService,
    private readonly config: AppConfig,
  ) {}

  async findUser(ref: { email?: string; userId?: number }) {
    if (!ref.email && !ref.userId) throw badRequest(ErrorCode.VALIDATION_ERROR, 'Indica email o userId');
    const user = await this.prisma.user.findFirst({ where: ref.userId ? { id: ref.userId } : { email: ref.email!.toLowerCase() } });
    if (!user) throw notFound(ErrorCode.USER_NOT_FOUND, 'Usuario no encontrado');
    return user;
  }

  async createUser(dto: CreateTestUserDto) {
    const runId = resolveRunId(dto.runId);
    const password = dto.password ?? DEFAULT_TEST_PASSWORD;
    const email = (dto.email ?? `user.${randomCode(6).toLowerCase()}.${emailSafe(runId)}@run.qacommerce.test`).toLowerCase();
    if (await this.prisma.user.findUnique({ where: { email } })) {
      throw conflict(ErrorCode.EMAIL_ALREADY_REGISTERED, 'A user with that e-mail already exists');
    }
    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash: await hashPassword(password),
        firstName: dto.firstName ?? 'Test',
        lastName: dto.lastName ?? `User ${randomCode(4)}`,
        phone: '600123123',
        role: dto.role ?? Role.CUSTOMER,
        status: dto.status ?? UserStatus.ACTIVE,
        testRunId: runId,
      },
    });
    const address =
      dto.withAddress === false
        ? null
        : await this.prisma.address.create({
            data: {
              userId: user.id,
              label: 'Home',
              fullName: `${user.firstName} ${user.lastName}`,
              phone: '600123123',
              line1: 'Calle de Prueba 1, 2º A',
              city: 'Madrid',
              province: 'Madrid',
              postalCode: '28001',
              country: 'ES',
              isDefault: true,
            },
          });
    const tokens =
      dto.login === false || user.status === UserStatus.DISABLED
        ? null
        : await this.tokens.issueSession(user, { userAgent: 'testing-api' }, { accessTtlSeconds: dto.accessTtlSeconds });
    return {
      runId,
      user: toUserDto(user),
      credentials: { email, password },
      address: address ? toAddressDto(address) : null,
      tokens: tokens
        ? { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, tokenType: tokens.tokenType, expiresIn: tokens.expiresIn }
        : null,
    };
  }

  async issueToken(ref: { email?: string; userId?: number }, accessTtlSeconds?: number, refreshTtlSeconds?: number) {
    const user = await this.findUser(ref);
    const t = await this.tokens.issueSession(user, { userAgent: 'testing-api' }, { accessTtlSeconds, refreshTtlSeconds });
    return {
      user: toUserDto(user),
      accessToken: t.accessToken,
      refreshToken: t.refreshToken,
      tokenType: t.tokenType,
      expiresIn: t.expiresIn,
      sessionId: t.sessionId,
      refreshTokenExpiresAt: t.refreshTokenExpiresAt,
    };
  }

  async expireSessions(ref: { email?: string; userId?: number }, mode: 'expire' | 'revoke' = 'expire') {
    const user = await this.findUser(ref);
    const past = new Date(Date.now() - 1000);
    const res = await this.prisma.session.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: mode === 'revoke' ? { revokedAt: past } : { expiresAt: past },
    });
    return { userId: user.id, mode, affectedSessions: res.count };
  }

  async createProduct(dto: CreateTestProductDto) {
    const runId = resolveRunId(dto.runId);
    const category = await this.prisma.category.findUnique({ where: { slug: dto.categorySlug ?? 'accessories' } });
    if (!category) throw notFound(ErrorCode.CATEGORY_NOT_FOUND, 'Category not found');
    const brand = await this.prisma.brand.findUnique({ where: { slug: dto.brandSlug ?? 'anker' } });
    if (!brand) throw notFound(ErrorCode.BRAND_NOT_FOUND, 'Marca no encontrada');
    const code = randomCode(6);
    const product = await this.catalog.create(
      {
        sku: `TST-${code}`,
        name: dto.name ?? `Test product ${code}`,
        brandId: brand.id,
        categoryId: category.id,
        shortDescription: 'Product created by the testing API',
        description: `Test product created for run ${runId}. It is not part of the reference catalog.`,
        priceCents: dto.priceCents ?? 4999,
        compareAtPriceCents: dto.compareAtPriceCents ?? null,
        stock: dto.stock ?? 10,
        isActive: dto.isActive ?? true,
        isFeatured: dto.isFeatured ?? false,
        specs: [{ name: 'Source', value: 'Testing API' }],
        imageColor: '64748b',
      },
      { testRunId: runId },
    );
    return { runId, product };
  }

  async patchProduct(id: number, data: { stock?: number; priceCents?: number; compareAtPriceCents?: number | null; isActive?: boolean }) {
    const current = await this.prisma.product.findUnique({ where: { id } });
    if (!current) throw notFound(ErrorCode.PRODUCT_NOT_FOUND, 'Producto no encontrado');
    // Uses the admin service so derived fields (discount, search text) stay consistent.
    return this.catalog.update(id, {
      stock: data.stock,
      priceCents: data.priceCents,
      compareAtPriceCents: data.compareAtPriceCents,
      isActive: data.isActive,
    });
  }

  async createCoupon(dto: CreateTestCouponDto) {
    const runId = resolveRunId(dto.runId);
    const day = 86_400_000;
    const category = dto.categorySlug ? await this.prisma.category.findUnique({ where: { slug: dto.categorySlug } }) : null;
    if (dto.categorySlug && !category) throw notFound(ErrorCode.CATEGORY_NOT_FOUND, 'Category not found');
    const startsAt = dto.startsInDays !== undefined ? new Date(Date.now() + dto.startsInDays * day) : new Date(Date.now() - day);
    const expiresAt = dto.expiresInDays !== undefined ? new Date(Date.now() + dto.expiresInDays * day) : new Date(Date.now() + 30 * day);
    const type = dto.type ?? CouponType.PERCENTAGE;
    const coupon = await this.prisma.coupon.create({
      data: {
        code: dto.code ?? `T${emailSafe(runId).replace(/-/g, '').toUpperCase().slice(0, 20)}${randomCode(5)}`,
        description: 'Coupon created by the testing API',
        type,
        value: type === CouponType.FREE_SHIPPING ? 0 : (dto.value ?? 10),
        minSubtotalCents: dto.minSubtotalCents ?? null,
        maxDiscountCents: dto.maxDiscountCents ?? null,
        categoryId: category?.id ?? null,
        startsAt: expiresAt <= startsAt ? new Date(expiresAt.getTime() - day) : startsAt,
        expiresAt,
        usageLimit: dto.usageLimit ?? null,
        timesUsed: dto.timesUsed ?? 0,
        perUserLimit: dto.perUserLimit ?? 1,
        isActive: dto.isActive ?? true,
        testRunId: runId,
      },
      include: { category: true },
    });
    return { runId, coupon: this.sales.toCouponDto(coupon) };
  }

  private async resolveProduct(item: TestItemDto): Promise<Product> {
    const p = item.productId
      ? await this.prisma.product.findUnique({ where: { id: item.productId } })
      : item.sku
        ? await this.prisma.product.findUnique({ where: { sku: item.sku } })
        : null;
    if (!p) throw notFound(ErrorCode.PRODUCT_NOT_FOUND, `Producto no encontrado (${item.productId ?? item.sku ?? '?'})`);
    return p;
  }

  async prepareCart(dto: PrepareCartDto) {
    const user = await this.findUser(dto);
    const cart = await this.prisma.cart.upsert({ where: { userId: user.id }, create: { userId: user.id }, update: {} });
    if (dto.replace !== false) {
      await this.prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
      await this.prisma.cart.update({ where: { id: cart.id }, data: { couponId: null } });
    }
    for (const item of dto.items) {
      const product = await this.resolveProduct(item);
      if (!dto.force) {
        if (!product.isActive) throw conflict(ErrorCode.PRODUCT_UNAVAILABLE, `${product.sku} is not active (use force: true)`);
        if (item.quantity > Math.min(product.stock, MAX_QUANTITY_PER_PRODUCT)) {
          throw conflict(ErrorCode.INSUFFICIENT_STOCK, `${product.sku}: stock ${product.stock} insuficiente (usa force: true)`);
        }
      }
      await this.prisma.cartItem.upsert({
        where: { cartId_productId: { cartId: cart.id, productId: product.id } },
        create: { cartId: cart.id, productId: product.id, quantity: item.quantity, unitPriceCentsSnapshot: product.priceCents },
        update: { quantity: item.quantity, unitPriceCentsSnapshot: product.priceCents },
      });
    }
    if (dto.couponCode) {
      const coupon = await this.prisma.coupon.findUnique({ where: { code: dto.couponCode.toUpperCase() } });
      if (!coupon) throw notFound(ErrorCode.COUPON_INVALID, 'Coupon not found');
      await this.prisma.cart.update({ where: { id: cart.id }, data: { couponId: coupon.id } });
    }
    return this.cart.getCart({ userId: user.id });
  }

  /** Creates an order directly in the requested status, with a consistent history, payments and inventory. */
  async createOrder(dto: CreateTestOrderDto) {
    const user = await this.findUser(dto);
    const runId = dto.runId ?? user.testRunId ?? RequestContext.testRunId() ?? null;
    const method = await this.prisma.shippingMethod.findUniqueOrThrow({ where: { code: dto.shippingMethodCode ?? 'STANDARD' } });
    const pickup = method.requiresPickupPoint ? await this.prisma.pickupPoint.findFirstOrThrow({ orderBy: { id: 'asc' } }) : null;
    let address = await this.prisma.address.findFirst({ where: { userId: user.id }, orderBy: [{ isDefault: 'desc' }, { id: 'asc' }] });
    address ??= await this.prisma.address.create({
      data: {
        userId: user.id,
        label: 'Home',
        fullName: `${user.firstName} ${user.lastName}`,
        phone: '600123123',
        line1: 'Calle de Prueba 1, 2º A',
        city: 'Madrid',
        province: 'Madrid',
        postalCode: '28001',
        isDefault: true,
      },
    });
    const products = await Promise.all(dto.items.map((i) => this.resolveProduct(i)));
    const lines = dto.items.map((i, idx) => ({ product: products[idx], quantity: i.quantity }));
    const coupon = dto.couponCode ? await this.prisma.coupon.findUnique({ where: { code: dto.couponCode.toUpperCase() } }) : null;
    if (dto.couponCode && !coupon) throw notFound(ErrorCode.COUPON_INVALID, 'Coupon not found');
    const pricing = computePricing(
      lines.map((l) => ({ productId: l.product.id, categoryId: l.product.categoryId, unitPriceCents: l.product.priceCents, quantity: l.quantity })),
      coupon ? await this.couponPricing(coupon.id) : null,
      method,
    );
    const paymentMethod = dto.paymentMethod ?? PaymentMethod.CARD;
    const base = new Date(Date.now() - (dto.daysAgo ?? 0) * 86_400_000 - 3 * 3_600_000);
    const at = (hours: number) => new Date(base.getTime() + hours * 3_600_000);
    const decrement = dto.decrementStock !== false;

    const order = await this.prisma.$transaction(async (tx) => {
      if (decrement) {
        for (const l of lines) {
          const res = await tx.product.updateMany({ where: { id: l.product.id, stock: { gte: l.quantity } }, data: { stock: { decrement: l.quantity } } });
          if (res.count === 0) {
            throw conflict(ErrorCode.INSUFFICIENT_STOCK, `Not enough stock of ${l.product.sku} (use decrementStock: false)`, {
              productId: l.product.id,
              availableStock: l.product.stock,
            });
          }
        }
      }
      const brands = await tx.brand.findMany({ where: { id: { in: products.map((p) => p.brandId) } } });
      const images = await tx.productImage.findMany({ where: { productId: { in: products.map((p) => p.id) }, position: 0 } });
      const o = await tx.order.create({
        data: {
          orderNumber: `QCL-TST-${randomCode(8)}`,
          userId: user.id,
          status: OrderStatus.PENDING,
          paymentStatus: dto.failedPayment ? OrderPaymentStatus.FAILED : OrderPaymentStatus.AWAITING_PAYMENT,
          paymentMethod,
          shippingMethodId: method.id,
          shippingMethodCode: method.code,
          shippingMethodName: method.name,
          pickupPointId: pickup?.id ?? null,
          shippingAddress: {
            fullName: address!.fullName,
            phone: address!.phone,
            line1: address!.line1,
            line2: address!.line2,
            city: address!.city,
            province: address!.province,
            postalCode: address!.postalCode,
            country: address!.country,
          },
          subtotalCents: pricing.subtotalCents,
          discountCents: pricing.discountCents,
          shippingCents: pricing.shippingCents,
          taxCents: vatIncluded(pricing.totalCents),
          totalCents: pricing.totalCents,
          couponId: coupon?.id ?? null,
          couponCode: coupon?.code ?? null,
          reservationExpiresAt: new Date(
            Date.now() +
              (paymentMethod === PaymentMethod.BANK_TRANSFER
                ? this.config.orders.bankTransferReservationHours * 3_600_000
                : this.config.orders.reservationMinutes * 60_000),
          ),
          testRunId: runId,
          stockReserved: decrement,
          createdAt: base,
          items: {
            create: lines.map((l) => ({
              productId: l.product.id,
              sku: l.product.sku,
              name: l.product.name,
              brandName: brands.find((b) => b.id === l.product.brandId)?.name ?? '',
              imageUrl: images.find((im) => im.productId === l.product.id)?.url ?? null,
              unitPriceCents: l.product.priceCents,
              compareAtPriceCents: l.product.compareAtPriceCents,
              quantity: l.quantity,
              lineTotalCents: l.product.priceCents * l.quantity,
            })),
          },
          history: { create: { toStatus: OrderStatus.PENDING, actorType: ActorType.CUSTOMER, actorUserId: user.id, note: 'Order created (testing API)', createdAt: base } },
        },
      });
      if (coupon) {
        await tx.couponRedemption.create({ data: { couponId: coupon.id, userId: user.id, orderId: o.id } });
        await tx.coupon.update({ where: { id: coupon.id }, data: { timesUsed: { increment: 1 } } });
      }
      const payment = (status: PaymentStatus, extra: object = {}) =>
        tx.payment.create({
          data: {
            orderId: o.id,
            method: paymentMethod,
            status,
            amountCents: pricing.totalCents,
            scenario: paymentMethod === PaymentMethod.BANK_TRANSFER ? 'BANK_TRANSFER' : status === PaymentStatus.DECLINED ? 'DECLINED' : 'APPROVED',
            cardBrand: paymentMethod === PaymentMethod.CARD ? 'VISA' : null,
            cardLast4: paymentMethod === PaymentMethod.CARD ? (status === PaymentStatus.DECLINED ? '0002' : '4242') : null,
            providerReference: `${paymentMethod === PaymentMethod.CARD ? 'PAY' : 'TRF'}-TST-${randomCode(10)}`,
            createdAt: at(0.05),
            ...extra,
          },
        });
      if (dto.status === OrderStatus.PENDING) {
        if (dto.failedPayment) {
          await payment(PaymentStatus.DECLINED, { failureCode: 'card_declined', failureMessage: 'The card issuer declined the payment', resolvedAt: at(0.06) });
        } else if (paymentMethod === PaymentMethod.BANK_TRANSFER) {
          await payment(PaymentStatus.PENDING);
        }
      } else if (dto.status !== OrderStatus.CANCELLED) {
        await payment(PaymentStatus.APPROVED, { resolvedAt: at(0.1) });
      }
      return o;
    });

    // Walk the lifecycle to the requested status (side effects: sales counters, refunds, restock...)
    const system = { type: ActorType.SYSTEM };
    const target = dto.status;
    const walk = async (to: OrderStatus, hours: number, extra: object = {}) =>
      this.lifecycle.transition(order.id, to, system, { force: true, at: at(hours), ...extra });
    if (target === OrderStatus.CANCELLED) {
      await walk(OrderStatus.CANCELLED, 1, { reason: 'Cancelled (testing API)' });
    } else if (target !== OrderStatus.PENDING) {
      const finalIndex =
        target === OrderStatus.RETURN_REQUESTED || target === OrderStatus.RETURNED ? ORDER_PATH.length - 1 : ORDER_PATH.indexOf(target);
      for (let i = 0; i <= finalIndex; i++) await walk(ORDER_PATH[i], [0.1, 4, 20, 44][i]);
      if (target === OrderStatus.RETURN_REQUESTED || target === OrderStatus.RETURNED) {
        await walk(OrderStatus.RETURN_REQUESTED, 60, { reason: 'Test return' });
      }
      if (target === OrderStatus.RETURNED) await walk(OrderStatus.RETURNED, 90);
    }
    return { runId, order: await this.orders.getById(order.id) };
  }

  private async couponPricing(couponId: number) {
    const coupon = await this.prisma.coupon.findUniqueOrThrow({ where: { id: couponId } });
    const children = coupon.categoryId ? await this.prisma.category.findMany({ where: { parentId: coupon.categoryId } }) : [];
    return {
      code: coupon.code,
      type: coupon.type,
      value: coupon.value,
      maxDiscountCents: coupon.maxDiscountCents,
      eligibleCategoryIds: coupon.categoryId ? [coupon.categoryId, ...children.map((c) => c.id)] : null,
    };
  }

  async passwordResetToken(email: string) {
    const user = await this.findUser({ email });
    const { token, expiresAt } = await this.auth.createResetToken(user);
    return { email: user.email, token, expiresAt, link: `${this.config.publicWebUrl}/reset-password?token=${encodeURIComponent(token)}` };
  }
}
