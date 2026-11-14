import { Injectable } from '@nestjs/common';
import { ActorType, Coupon, CouponType, OrderStatus, PaymentMethod, PaymentStatus, Prisma, Role, UserStatus } from '@prisma/client';
import { AppConfig } from '../../config/app-config';
import { pageMeta } from '../../common/dto/pagination.dto';
import { ErrorCode, badRequest, conflict, notFound, unprocessable } from '../../common/errors';
import { RequestContext } from '../../common/request-context';
import { PrismaService } from '../../prisma/prisma.service';
import { TokenService } from '../auth/token.service';
import { LOW_STOCK_THRESHOLD } from '../catalog/catalog.mapper';
import { orderDetailInclude, toOrderDto, toOrderSummary } from '../orders/order.mapper';
import { OrderLifecycleService } from '../orders/order-lifecycle.service';
import { allowedTransitions, SALES_COUNTED_STATUSES } from '../orders/order-state-machine';
import { PaymentsService } from '../orders/payments.service';
import { toUserDto } from '../users/dto/user.dto';
import {
  AdminCouponDto,
  AdminCouponQueryDto,
  AdminOrderDto,
  AdminOrderListDto,
  AdminOrderQueryDto,
  AdminUpdateUserDto,
  AdminUserDto,
  AdminUserListDto,
  AdminUserQueryDto,
  CreateCouponDto,
  DashboardDto,
  UpdateCouponDto,
  UpdateOrderStatusDto,
} from './dto/admin.dto';

export function couponState(c: Coupon, now = new Date()): string {
  if (!c.isActive) return 'INACTIVE';
  if (c.startsAt && c.startsAt > now) return 'SCHEDULED';
  if (c.expiresAt && c.expiresAt <= now) return 'EXPIRED';
  if (c.usageLimit !== null && c.timesUsed >= c.usageLimit) return 'EXHAUSTED';
  return 'ACTIVE';
}

@Injectable()
export class AdminSalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lifecycle: OrderLifecycleService,
    private readonly payments: PaymentsService,
    private readonly tokens: TokenService,
    private readonly config: AppConfig,
  ) {}

  // ─── Dashboard ─────────────────────────────────────────────────────────

  async dashboard(): Promise<DashboardDto> {
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    since.setDate(since.getDate() - 13);
    const [users, customers, products, activeProducts, orders, revenue, outOfStock, lowStockCount, byStatus, recent, lowStock, top, recentPaid] =
      await Promise.all([
        this.prisma.user.count(),
        this.prisma.user.count({ where: { role: Role.CUSTOMER } }),
        this.prisma.product.count(),
        this.prisma.product.count({ where: { isActive: true } }),
        this.prisma.order.count(),
        this.prisma.order.aggregate({ where: { status: { in: SALES_COUNTED_STATUSES } }, _sum: { totalCents: true }, _count: { _all: true } }),
        this.prisma.product.count({ where: { isActive: true, stock: 0 } }),
        this.prisma.product.count({ where: { isActive: true, stock: { gt: 0, lte: LOW_STOCK_THRESHOLD } } }),
        this.prisma.order.groupBy({ by: ['status'], _count: { _all: true } }),
        this.prisma.order.findMany({
          include: { items: { select: { quantity: true, imageUrl: true } }, user: true },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 8,
        }),
        this.prisma.product.findMany({
          where: { isActive: true, stock: { lte: LOW_STOCK_THRESHOLD } },
          orderBy: [{ stock: 'asc' }, { id: 'asc' }],
          take: 8,
        }),
        this.prisma.product.findMany({ orderBy: [{ salesCount: 'desc' }, { id: 'asc' }], take: 5 }),
        this.prisma.order.findMany({
          where: { status: { in: SALES_COUNTED_STATUSES }, paidAt: { gte: since } },
          select: { paidAt: true, totalCents: true },
        }),
      ]);
    const count = (s: OrderStatus) => byStatus.find((b) => b.status === s)?._count._all ?? 0;
    const days = Array.from({ length: 14 }, (_, i) => {
      const d = new Date(since);
      d.setDate(since.getDate() + i);
      return d.toISOString().slice(0, 10);
    });
    const revenueCents = revenue._sum.totalCents ?? 0;
    return {
      totals: {
        users,
        customers,
        products,
        activeProducts,
        orders,
        revenueCents,
        averageOrderCents: revenue._count._all ? Math.round(revenueCents / revenue._count._all) : 0,
        outOfStockProducts: outOfStock,
        lowStockProducts: lowStockCount,
        pendingOrders: count(OrderStatus.PENDING),
        ordersToShip: count(OrderStatus.PAID) + count(OrderStatus.PREPARING),
        returnRequests: count(OrderStatus.RETURN_REQUESTED),
      },
      ordersByStatus: Object.values(OrderStatus).map((status) => ({ status, count: count(status) })),
      salesLast14Days: days.map((date) => {
        const sameDay = recentPaid.filter((o) => o.paidAt!.toISOString().slice(0, 10) === date);
        return { date, orders: sameDay.length, revenueCents: sameDay.reduce((acc, o) => acc + o.totalCents, 0) };
      }),
      recentOrders: recent.map((o) => ({
        ...toOrderSummary(o),
        customer: { id: o.user.id, email: o.user.email, firstName: o.user.firstName, lastName: o.user.lastName },
      })),
      lowStock: lowStock.map((p) => ({ id: p.id, sku: p.sku, name: p.name, stock: p.stock })),
      topProducts: top.map((p) => ({ id: p.id, sku: p.sku, name: p.name, salesCount: p.salesCount })),
    };
  }

  // ─── Orders ────────────────────────────────────────────────────────────

  async listOrders(q: AdminOrderQueryDto): Promise<AdminOrderListDto> {
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 20;
    const where: Prisma.OrderWhereInput = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.paymentStatus ? { paymentStatus: q.paymentStatus } : {}),
      ...(q.q
        ? {
            OR: [
              { orderNumber: { contains: q.q.trim(), mode: 'insensitive' } },
              { user: { email: { contains: q.q.trim(), mode: 'insensitive' } } },
            ],
          }
        : {}),
      ...(q.from || q.to ? { createdAt: { gte: q.from, lte: q.to } } : {}),
    };
    const orderBy: Prisma.OrderOrderByWithRelationInput[] =
      q.sort === 'oldest'
        ? [{ createdAt: 'asc' }, { id: 'asc' }]
        : q.sort === 'total_desc'
          ? [{ totalCents: 'desc' }, { id: 'desc' }]
          : q.sort === 'total_asc'
            ? [{ totalCents: 'asc' }, { id: 'asc' }]
            : [{ createdAt: 'desc' }, { id: 'desc' }];
    const [total, rows] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        include: { items: { select: { quantity: true, imageUrl: true } }, user: true },
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return {
      data: rows.map((o) => ({
        ...toOrderSummary(o),
        customer: { id: o.user.id, email: o.user.email, firstName: o.user.firstName, lastName: o.user.lastName },
      })),
      meta: pageMeta(page, pageSize, total),
    };
  }

  async getOrder(id: number): Promise<AdminOrderDto> {
    const order = await this.prisma.order.findUnique({ where: { id }, include: { ...orderDetailInclude, user: true } });
    if (!order) throw notFound(ErrorCode.ORDER_NOT_FOUND, 'Pedido no encontrado');
    const dto = toOrderDto(order, this.config.orders.returnWindowDays);
    const canConfirmPayment =
      order.status === OrderStatus.PENDING &&
      order.payments.some((p) => p.method === PaymentMethod.BANK_TRANSFER && p.status === PaymentStatus.PENDING);
    return {
      ...dto,
      customer: { id: order.user.id, email: order.user.email, firstName: order.user.firstName, lastName: order.user.lastName },
      // PAID is reached through payments (or confirm-payment), never through the generic status endpoint.
      allowedTransitions: allowedTransitions(order.status, ActorType.ADMIN).filter((s) => s !== OrderStatus.PAID),
      canConfirmPayment,
      testRunId: order.testRunId,
    };
  }

  async updateOrderStatus(id: number, adminId: number, dto: UpdateOrderStatusDto): Promise<AdminOrderDto> {
    if (dto.status === OrderStatus.PAID) {
      throw conflict(
        ErrorCode.INVALID_STATUS_TRANSITION,
        'Un pedido solo pasa a PAID mediante un pago aprobado o confirmando la transferencia (POST /admin/orders/:id/confirm-payment)',
      );
    }
    await this.lifecycle.transition(id, dto.status, { type: ActorType.ADMIN, userId: adminId }, {
      note: dto.note,
      reason: dto.status === OrderStatus.CANCELLED ? dto.note || 'Cancelado por la tienda' : undefined,
      trackingNumber: dto.trackingNumber,
    });
    return this.getOrder(id);
  }

  async confirmPayment(id: number, adminId: number): Promise<AdminOrderDto> {
    await this.payments.confirmBankTransfer(id, adminId);
    return this.getOrder(id);
  }

  // ─── Users ─────────────────────────────────────────────────────────────

  async listUsers(q: AdminUserQueryDto): Promise<AdminUserListDto> {
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 20;
    const term = q.q?.trim();
    const where: Prisma.UserWhereInput = {
      ...(q.role ? { role: q.role } : {}),
      ...(q.status ? { status: q.status } : {}),
      ...(term
        ? {
            OR: [
              { email: { contains: term, mode: 'insensitive' } },
              { firstName: { contains: term, mode: 'insensitive' } },
              { lastName: { contains: term, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * pageSize, take: pageSize }),
    ]);
    const stats = await this.userStats(rows.map((u) => u.id));
    return {
      data: rows.map((u) => ({
        ...toUserDto(u),
        ...(stats.get(u.id) ?? { ordersCount: 0, totalSpentCents: 0, addressesCount: 0 }),
        isReference: u.isReference,
        testRunId: u.testRunId,
        updatedAt: u.updatedAt,
      })),
      meta: pageMeta(page, pageSize, total),
    };
  }

  private async userStats(ids: number[]) {
    const [orders, spent, addresses] = await Promise.all([
      this.prisma.order.groupBy({ by: ['userId'], where: { userId: { in: ids } }, _count: { _all: true } }),
      this.prisma.order.groupBy({
        by: ['userId'],
        where: { userId: { in: ids }, status: { in: SALES_COUNTED_STATUSES } },
        _sum: { totalCents: true },
      }),
      this.prisma.address.groupBy({ by: ['userId'], where: { userId: { in: ids } }, _count: { _all: true } }),
    ]);
    const map = new Map<number, { ordersCount: number; totalSpentCents: number; addressesCount: number }>();
    for (const id of ids) {
      map.set(id, {
        ordersCount: orders.find((o) => o.userId === id)?._count._all ?? 0,
        totalSpentCents: spent.find((o) => o.userId === id)?._sum.totalCents ?? 0,
        addressesCount: addresses.find((a) => a.userId === id)?._count._all ?? 0,
      });
    }
    return map;
  }

  async getUser(id: number): Promise<AdminUserDto> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw notFound(ErrorCode.USER_NOT_FOUND, 'Usuario no encontrado');
    const stats = (await this.userStats([id])).get(id)!;
    return { ...toUserDto(user), ...stats, isReference: user.isReference, testRunId: user.testRunId, updatedAt: user.updatedAt };
  }

  async updateUser(id: number, adminId: number, dto: AdminUpdateUserDto): Promise<AdminUserDto> {
    if (id === adminId && (dto.status !== undefined || dto.role !== undefined)) {
      throw unprocessable(ErrorCode.CANNOT_MODIFY_OWN_ACCOUNT, 'No puedes cambiar tu propio rol ni estado');
    }
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw notFound(ErrorCode.USER_NOT_FOUND, 'Usuario no encontrado');
    await this.prisma.user.update({ where: { id }, data: { status: dto.status, role: dto.role } });
    if (dto.status === UserStatus.DISABLED) await this.tokens.revokeAllForUser(id);
    return this.getUser(id);
  }

  // ─── Coupons ───────────────────────────────────────────────────────────

  async listCoupons(q: AdminCouponQueryDto): Promise<AdminCouponDto[]> {
    const rows = await this.prisma.coupon.findMany({
      where: {
        ...(q.q ? { code: { contains: q.q.trim().toUpperCase() } } : {}),
        ...(q.active !== undefined ? { isActive: q.active } : {}),
      },
      include: { category: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return rows.map((c) => this.toCouponDto(c));
  }

  async getCoupon(id: number): Promise<AdminCouponDto> {
    const c = await this.prisma.coupon.findUnique({ where: { id }, include: { category: true } });
    if (!c) throw notFound(ErrorCode.NOT_FOUND, 'Cupón no encontrado');
    return this.toCouponDto(c);
  }

  private validateCouponRules(type: CouponType, value: number, startsAt?: Date | null, expiresAt?: Date | null): void {
    if (type === CouponType.PERCENTAGE && (value < 1 || value > 100)) {
      throw badRequest(ErrorCode.VALIDATION_ERROR, 'Un cupón porcentual debe tener un valor entre 1 y 100', [
        { field: 'value', message: 'Debe estar entre 1 y 100' },
      ]);
    }
    if (type === CouponType.FIXED_AMOUNT && value < 1) {
      throw badRequest(ErrorCode.VALIDATION_ERROR, 'Un cupón de importe fijo debe tener un valor mayor que 0', [
        { field: 'value', message: 'Debe ser mayor que 0 (céntimos)' },
      ]);
    }
    if (startsAt && expiresAt && expiresAt <= startsAt) {
      throw badRequest(ErrorCode.VALIDATION_ERROR, 'La fecha de caducidad debe ser posterior a la de inicio', [
        { field: 'expiresAt', message: 'Debe ser posterior a startsAt' },
      ]);
    }
  }

  async createCoupon(dto: CreateCouponDto, opts: { testRunId?: string | null; isReference?: boolean } = {}): Promise<AdminCouponDto> {
    this.validateCouponRules(dto.type, dto.value, dto.startsAt, dto.expiresAt);
    if (dto.categoryId && !(await this.prisma.category.findUnique({ where: { id: dto.categoryId } }))) {
      throw notFound(ErrorCode.CATEGORY_NOT_FOUND, 'Categoría no encontrada');
    }
    if (await this.prisma.coupon.findUnique({ where: { code: dto.code } })) {
      throw conflict(ErrorCode.COUPON_CODE_EXISTS, `Ya existe un cupón con el código ${dto.code}`);
    }
    const c = await this.prisma.coupon.create({
      data: {
        code: dto.code,
        description: dto.description,
        type: dto.type,
        value: dto.type === CouponType.FREE_SHIPPING ? 0 : dto.value,
        minSubtotalCents: dto.minSubtotalCents ?? null,
        maxDiscountCents: dto.maxDiscountCents ?? null,
        categoryId: dto.categoryId ?? null,
        startsAt: dto.startsAt ?? null,
        expiresAt: dto.expiresAt ?? null,
        usageLimit: dto.usageLimit ?? null,
        perUserLimit: dto.perUserLimit ?? 1,
        isActive: dto.isActive ?? true,
        isReference: opts.isReference ?? false,
        testRunId: opts.testRunId ?? RequestContext.testRunId() ?? null,
      },
      include: { category: true },
    });
    return this.toCouponDto(c);
  }

  async updateCoupon(id: number, dto: UpdateCouponDto): Promise<AdminCouponDto> {
    const current = await this.prisma.coupon.findUnique({ where: { id } });
    if (!current) throw notFound(ErrorCode.NOT_FOUND, 'Cupón no encontrado');
    const type = dto.type ?? current.type;
    const value = dto.value ?? current.value;
    const startsAt = dto.startsAt !== undefined ? dto.startsAt : current.startsAt;
    const expiresAt = dto.expiresAt !== undefined ? dto.expiresAt : current.expiresAt;
    this.validateCouponRules(type, value, startsAt, expiresAt);
    const c = await this.prisma.coupon.update({
      where: { id },
      data: {
        description: dto.description,
        type: dto.type,
        value: type === CouponType.FREE_SHIPPING ? 0 : dto.value,
        minSubtotalCents: dto.minSubtotalCents,
        maxDiscountCents: dto.maxDiscountCents,
        categoryId: dto.categoryId,
        startsAt: dto.startsAt,
        expiresAt: dto.expiresAt,
        usageLimit: dto.usageLimit,
        perUserLimit: dto.perUserLimit,
        isActive: dto.isActive,
      },
      include: { category: true },
    });
    return this.toCouponDto(c);
  }

  toCouponDto(c: Coupon & { category: { name: string } | null }): AdminCouponDto {
    return {
      id: c.id,
      code: c.code,
      description: c.description,
      type: c.type,
      value: c.value,
      minSubtotalCents: c.minSubtotalCents,
      maxDiscountCents: c.maxDiscountCents,
      categoryId: c.categoryId,
      categoryName: c.category?.name ?? null,
      startsAt: c.startsAt,
      expiresAt: c.expiresAt,
      usageLimit: c.usageLimit,
      perUserLimit: c.perUserLimit,
      timesUsed: c.timesUsed,
      isActive: c.isActive,
      state: couponState(c),
      isReference: c.isReference,
      testRunId: c.testRunId,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    };
  }
}

