import { Injectable } from '@nestjs/common';
import { ActorType, Order, OrderPaymentStatus, OrderStatus, PaymentMethod, Prisma } from '@prisma/client';
import { AppConfig } from '../../config/app-config';
import { pageMeta } from '../../common/dto/pagination.dto';
import { AppException, ErrorCode, conflict, notFound, unprocessable } from '../../common/errors';
import { RequestContext } from '../../common/request-context';
import { sha256 } from '../../common/utils/crypto';
import { randomCode } from '../../common/utils/text';
import { PrismaService, Tx } from '../../prisma/prisma.service';
import { CartService, itemIssues } from '../cart/cart.service';
import { CouponsService } from '../cart/coupons.service';
import { computePricing, PricingCoupon } from '../cart/pricing';
import { ShippingService } from '../cart/shipping.service';
import {
  CheckoutQuoteDto,
  CheckoutQuoteResponseDto,
  CreateOrderDto,
  OrderDto,
  OrderListQueryDto,
  OrderListResponseDto,
  OrderPaymentResultDto,
  PaymentInputDto,
} from './dto/order.dto';
import { OrderLifecycleService } from './order-lifecycle.service';
import { orderDetailInclude, toOrderDto, toOrderSummary, toPaymentDto } from './order.mapper';
import { validateCard, ValidatedCard } from './payment-simulator';
import { PaymentsService } from './payments.service';

export interface CreateOrderResult extends OrderPaymentResultDto {
  replayed: boolean;
}

export const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_.:-]{8,100}$/;

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cart: CartService,
    private readonly coupons: CouponsService,
    private readonly shipping: ShippingService,
    private readonly payments: PaymentsService,
    private readonly lifecycle: OrderLifecycleService,
    private readonly config: AppConfig,
  ) {}

  // ─── Queries ───────────────────────────────────────────────────────────

  async list(userId: number, query: OrderListQueryDto): Promise<OrderListResponseDto> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const where: Prisma.OrderWhereInput = { userId, ...(query.status ? { status: query.status } : {}) };
    const [total, rows] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        include: { items: { select: { quantity: true, imageUrl: true } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return { data: rows.map(toOrderSummary), meta: pageMeta(page, pageSize, total) };
  }

  /** Loads an order of the user by numeric id or order number. Other users' orders → 404. */
  async getForUser(userId: number, idOrNumber: string): Promise<OrderDto> {
    return toOrderDto(await this.loadForUser(userId, idOrNumber), this.config.orders.returnWindowDays);
  }

  private async loadForUser(userId: number, idOrNumber: string) {
    const where: Prisma.OrderWhereInput = /^\d+$/.test(idOrNumber)
      ? { id: Number(idOrNumber), userId }
      : { orderNumber: idOrNumber.toUpperCase(), userId };
    const order = await this.prisma.order.findFirst({ where, include: orderDetailInclude });
    if (!order) throw notFound(ErrorCode.ORDER_NOT_FOUND, 'Pedido no encontrado');
    return order;
  }

  async getById(id: number): Promise<OrderDto> {
    const order = await this.prisma.order.findUnique({ where: { id }, include: orderDetailInclude });
    if (!order) throw notFound(ErrorCode.ORDER_NOT_FOUND, 'Pedido no encontrado');
    return toOrderDto(order, this.config.orders.returnWindowDays);
  }

  // ─── Checkout ──────────────────────────────────────────────────────────

  async quote(userId: number, dto: CheckoutQuoteDto): Promise<CheckoutQuoteResponseDto> {
    const cart = await this.prisma.$transaction((tx) => this.cart.loadForCheckout(userId, tx));
    if (!cart || cart.items.length === 0) throw unprocessable(ErrorCode.CART_EMPTY, 'El carrito está vacío');
    if (dto.addressId) await this.assertAddress(userId, dto.addressId);
    const method = await this.shipping.getMethod(dto.shippingMethodCode);
    await this.shipping.resolvePickupPoint(method, dto.pickupPointId);
    const lines = this.cart.pricingLines(cart);
    let pricingCoupon: PricingCoupon | null = null;
    let couponError: CheckoutQuoteResponseDto['couponError'] = null;
    if (cart.coupon) {
      try {
        pricingCoupon = (await this.coupons.validate(cart.coupon, { userId, lines })).pricing;
      } catch (err) {
        if (!(err instanceof AppException)) throw err;
        couponError = { code: err.code, message: err.message };
      }
    }
    const pricing = computePricing(lines, pricingCoupon, method);
    return {
      lines: cart.items
        .filter((i) => itemIssues(i).length === 0)
        .map((i) => ({
          productId: i.productId,
          name: i.product.name,
          quantity: i.quantity,
          unitPriceCents: i.product.priceCents,
          lineTotalCents: i.product.priceCents * i.quantity,
        })),
      subtotalCents: pricing.subtotalCents,
      discountCents: pricing.discountCents,
      shippingCents: pricing.shippingCents,
      shippingBaseCents: pricing.shippingBaseCents,
      freeShippingApplied: pricing.freeShippingApplied,
      taxCents: pricing.taxCents,
      totalCents: pricing.totalCents,
      couponCode: cart.coupon?.code ?? null,
      couponError,
      shippingMethod: { code: method.code, name: method.name },
      hasIssues: cart.items.some((i) => itemIssues(i).length > 0),
    };
  }

  /**
   * Creates an order from the user's cart and runs the first payment attempt.
   * Everything up to the order creation happens in one transaction:
   * cart lock → validations → price computation → atomic stock decrement → order → coupon → empty cart.
   */
  async create(userId: number, dto: CreateOrderDto, idempotencyKey?: string): Promise<CreateOrderResult> {
    const requestHash = sha256(JSON.stringify(dto));
    if (idempotencyKey) {
      const replay = await this.findReplay(userId, idempotencyKey, requestHash);
      if (replay) return replay;
    }
    const card = this.validatePaymentInput(dto);

    let order: Order;
    try {
      order = await this.prisma.$transaction((tx) => this.createOrderTx(tx, userId, dto, idempotencyKey, requestHash), {
        timeout: 20_000,
        maxWait: 10_000,
      });
    } catch (err) {
      // Two concurrent requests with the same Idempotency-Key: the loser returns the winner's order.
      if (idempotencyKey && (err as { code?: string }).code === 'P2002') {
        const replay = await this.findReplay(userId, idempotencyKey, requestHash);
        if (replay) return replay;
      }
      throw err;
    }

    const payment = await this.payments.pay(order, {
      method: dto.paymentMethod,
      card: card ?? undefined,
    });
    return { order: await this.getById(order.id), payment: toPaymentDto(payment), replayed: false };
  }

  private async findReplay(userId: number, key: string, hash: string): Promise<CreateOrderResult | null> {
    const existing = await this.prisma.order.findUnique({
      where: { userId_idempotencyKey: { userId, idempotencyKey: key } },
      include: orderDetailInclude,
    });
    if (!existing) return null;
    if (existing.idempotencyHash && existing.idempotencyHash !== hash) {
      throw unprocessable(
        ErrorCode.IDEMPOTENCY_KEY_REUSED,
        'La Idempotency-Key ya se usó con una petición distinta',
        { orderId: existing.id },
      );
    }
    const dto = toOrderDto(existing, this.config.orders.returnWindowDays);
    return { order: dto, payment: dto.payments[0] ?? null, replayed: true };
  }

  private validatePaymentInput(dto: PaymentInputDto): ValidatedCard | null {
    if (dto.paymentMethod !== PaymentMethod.CARD) return null;
    if (!dto.card) throw unprocessable(ErrorCode.CARD_DETAILS_REQUIRED, 'Introduce los datos de la tarjeta');
    return validateCard(dto.card);
  }

  private async assertAddress(userId: number, addressId: number, db: Tx | PrismaService = this.prisma) {
    const address = await db.address.findFirst({ where: { id: addressId, userId } });
    if (!address) throw notFound(ErrorCode.ADDRESS_NOT_FOUND, 'Dirección de envío no encontrada');
    return address;
  }

  private async createOrderTx(
    tx: Tx,
    userId: number,
    dto: CreateOrderDto,
    idempotencyKey: string | undefined,
    requestHash: string,
  ): Promise<Order> {
    // 1. Serialize concurrent checkouts of the same user (double click, several tabs...)
    await this.cart.lockUserCart(userId, tx);
    const cart = await this.cart.loadForCheckout(userId, tx);
    if (!cart || cart.items.length === 0) throw unprocessable(ErrorCode.CART_EMPTY, 'El carrito está vacío');

    // 2. Every line must be purchasable as it is
    const problems = cart.items
      .map((i) => ({ itemId: i.id, productId: i.productId, sku: i.product.sku, issues: itemIssues(i) }))
      .filter((p) => p.issues.length > 0);
    if (problems.length) {
      throw unprocessable(ErrorCode.CART_HAS_ISSUES, 'Revisa el carrito: hay productos no disponibles o sin stock suficiente', problems);
    }

    // 3. Address, shipping and coupon
    const address = await this.assertAddress(userId, dto.addressId, tx);
    const method = await this.shipping.getMethod(dto.shippingMethodCode, tx);
    const pickupPoint = await this.shipping.resolvePickupPoint(method, dto.pickupPointId, tx);
    const lines = this.cart.pricingLines(cart);
    const couponResult = cart.coupon ? await this.coupons.validate(cart.coupon, { userId, lines }, tx) : null;

    // 4. Prices are always computed on the server
    const pricing = computePricing(lines, couponResult?.pricing ?? null, method);
    if (dto.expectedTotalCents !== undefined && dto.expectedTotalCents !== pricing.totalCents) {
      throw conflict(ErrorCode.PRICE_CHANGED, 'El importe del pedido ha cambiado. Revisa el resumen antes de confirmar', {
        expectedTotalCents: dto.expectedTotalCents,
        actualTotalCents: pricing.totalCents,
      });
    }

    // 5. Atomic, conditional stock decrement: never sells more than the available inventory
    for (const item of cart.items) {
      const res = await tx.product.updateMany({
        where: { id: item.productId, isActive: true, stock: { gte: item.quantity } },
        data: { stock: { decrement: item.quantity } },
      });
      if (res.count === 0) {
        const fresh = await tx.product.findUnique({ where: { id: item.productId }, select: { stock: true } });
        throw conflict(ErrorCode.INSUFFICIENT_STOCK, `No hay stock suficiente de "${item.product.name}"`, {
          productId: item.productId,
          sku: item.product.sku,
          requested: item.quantity,
          availableStock: fresh?.stock ?? 0,
        });
      }
    }

    // 6. Order with price snapshots
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    const order = await tx.order.create({
      data: {
        orderNumber: await this.newOrderNumber(tx),
        userId,
        status: OrderStatus.PENDING,
        paymentStatus: OrderPaymentStatus.AWAITING_PAYMENT,
        paymentMethod: dto.paymentMethod,
        shippingMethodId: method.id,
        shippingMethodCode: method.code,
        shippingMethodName: method.name,
        pickupPointId: pickupPoint?.id ?? null,
        shippingAddress: {
          fullName: address.fullName,
          phone: address.phone,
          line1: address.line1,
          line2: address.line2,
          city: address.city,
          province: address.province,
          postalCode: address.postalCode,
          country: address.country,
        },
        subtotalCents: pricing.subtotalCents,
        discountCents: pricing.discountCents,
        shippingCents: pricing.shippingCents,
        taxCents: pricing.taxCents,
        totalCents: pricing.totalCents,
        couponId: couponResult?.coupon.id ?? null,
        couponCode: couponResult?.coupon.code ?? null,
        idempotencyKey: idempotencyKey ?? null,
        idempotencyHash: idempotencyKey ? requestHash : null,
        customerNote: dto.customerNote || null,
        reservationExpiresAt: new Date(Date.now() + this.config.orders.reservationMinutes * 60_000),
        testRunId: user.testRunId ?? RequestContext.testRunId() ?? null,
        items: {
          create: cart.items.map((i) => ({
            productId: i.productId,
            sku: i.product.sku,
            name: i.product.name,
            brandName: i.product.brand.name,
            imageUrl: i.product.images[0]?.url ?? null,
            unitPriceCents: i.product.priceCents,
            compareAtPriceCents: i.product.compareAtPriceCents,
            quantity: i.quantity,
            lineTotalCents: i.product.priceCents * i.quantity,
          })),
        },
        history: {
          create: { fromStatus: null, toStatus: OrderStatus.PENDING, actorType: ActorType.CUSTOMER, actorUserId: userId, note: 'Pedido creado' },
        },
      },
    });

    // 7. Coupon redemption (global usage limit enforced with a conditional update)
    if (couponResult) {
      const { coupon } = couponResult;
      const res = await tx.coupon.updateMany({
        where: { id: coupon.id, ...(coupon.usageLimit !== null ? { timesUsed: { lt: coupon.usageLimit } } : {}) },
        data: { timesUsed: { increment: 1 } },
      });
      if (res.count === 0) throw unprocessable(ErrorCode.COUPON_USAGE_LIMIT_REACHED, 'El cupón ha alcanzado su límite de usos');
      await tx.couponRedemption.create({ data: { couponId: coupon.id, userId, orderId: order.id } });
    }

    // 8. Empty the cart
    await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
    await tx.cart.update({ where: { id: cart.id }, data: { couponId: null } });
    return order;
  }

  private async newOrderNumber(tx: Tx): Promise<string> {
    const d = new Date();
    const date = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = `QCL-${date}-${randomCode(6)}`;
      if (!(await tx.order.findUnique({ where: { orderNumber: candidate }, select: { id: true } }))) return candidate;
    }
    throw new Error('Could not generate a unique order number');
  }

  // ─── Customer actions ──────────────────────────────────────────────────

  async pay(userId: number, idOrNumber: string, dto: PaymentInputDto, idempotencyKey?: string): Promise<CreateOrderResult> {
    const order = await this.loadForUser(userId, idOrNumber);
    const hash = sha256(JSON.stringify(dto));
    if (idempotencyKey) {
      const existing = order.payments.find((p) => p.idempotencyKey === idempotencyKey);
      if (existing) {
        if (existing.idempotencyHash && existing.idempotencyHash !== hash) {
          throw unprocessable(ErrorCode.IDEMPOTENCY_KEY_REUSED, 'La Idempotency-Key ya se usó con una petición distinta');
        }
        return { order: toOrderDto(order, this.config.orders.returnWindowDays), payment: toPaymentDto(existing), replayed: true };
      }
    }
    if (order.status === OrderStatus.PENDING && order.reservationExpiresAt && order.reservationExpiresAt <= new Date()) {
      throw conflict(ErrorCode.ORDER_NOT_PAYABLE, 'La reserva del pedido ha caducado. El pedido se cancelará automáticamente');
    }
    const card = this.validatePaymentInput(dto);
    const payment = await this.payments.pay(order, { method: dto.paymentMethod, card: card ?? undefined, idempotencyKey, idempotencyHash: hash });
    return { order: await this.getById(order.id), payment: toPaymentDto(payment), replayed: false };
  }

  async cancel(userId: number, idOrNumber: string, reason?: string): Promise<OrderDto> {
    const order = await this.loadForUser(userId, idOrNumber);
    await this.lifecycle.transition(order.id, OrderStatus.CANCELLED, { type: ActorType.CUSTOMER, userId }, {
      reason: reason || 'Cancelado por el cliente',
    });
    return this.getById(order.id);
  }

  async requestReturn(userId: number, idOrNumber: string, reason: string): Promise<OrderDto> {
    const order = await this.loadForUser(userId, idOrNumber);
    await this.lifecycle.transition(order.id, OrderStatus.RETURN_REQUESTED, { type: ActorType.CUSTOMER, userId }, { reason });
    return this.getById(order.id);
  }

  // ─── Jobs ──────────────────────────────────────────────────────────────

  /** Cancels PENDING orders whose stock reservation expired without a successful payment. */
  async expireReservations(): Promise<number> {
    const due = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.PENDING,
        paymentStatus: { in: [OrderPaymentStatus.AWAITING_PAYMENT, OrderPaymentStatus.FAILED] },
        reservationExpiresAt: { lte: new Date() },
      },
      select: { id: true },
      take: 100,
    });
    let count = 0;
    for (const o of due) {
      try {
        await this.lifecycle.transition(o.id, OrderStatus.CANCELLED, { type: ActorType.SYSTEM }, {
          reason: 'Reserva caducada: el pago no se completó a tiempo',
        });
        count++;
      } catch {
        // status changed concurrently (e.g. paid at the last second): ignore
      }
    }
    return count;
  }
}
