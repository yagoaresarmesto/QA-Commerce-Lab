import { Injectable } from '@nestjs/common';
import { Coupon, OrderStatus } from '@prisma/client';
import { ErrorCode, unprocessable } from '../../common/errors';
import { formatEur } from '../../common/utils/money';
import { PrismaService, Tx } from '../../prisma/prisma.service';
import { couponDiscount, PricingCoupon, PricingLine } from './pricing';

export interface CouponValidationContext {
  userId?: number;
  lines: PricingLine[];
  now?: Date;
}

/** Order statuses whose coupon redemption still counts (cancelled orders release it). */
export const REDEMPTION_COUNTS_STATUSES: OrderStatus[] = [
  OrderStatus.PENDING,
  OrderStatus.PAID,
  OrderStatus.PREPARING,
  OrderStatus.SHIPPED,
  OrderStatus.DELIVERED,
  OrderStatus.RETURN_REQUESTED,
  OrderStatus.RETURNED,
];

@Injectable()
export class CouponsService {
  constructor(private readonly prisma: PrismaService) {}

  normalizeCode(code: string): string {
    return code.trim().toUpperCase();
  }

  async findByCode(code: string, db: Tx | PrismaService = this.prisma): Promise<Coupon | null> {
    return db.coupon.findUnique({ where: { code: this.normalizeCode(code) } });
  }

  async toPricingCoupon(coupon: Coupon, db: Tx | PrismaService = this.prisma): Promise<PricingCoupon> {
    let eligibleCategoryIds: number[] | null = null;
    if (coupon.categoryId) {
      const children = await db.category.findMany({ where: { parentId: coupon.categoryId }, select: { id: true } });
      eligibleCategoryIds = [coupon.categoryId, ...children.map((c) => c.id)];
    }
    return {
      code: coupon.code,
      type: coupon.type,
      value: coupon.value,
      maxDiscountCents: coupon.maxDiscountCents,
      eligibleCategoryIds,
    };
  }

  /**
   * Validates a coupon against the business rules, in this order:
   * exists → active → started → not expired → global usage limit → login → per-user limit →
   * minimum subtotal → applicable to at least one product.
   * Every failure is a 422 with a specific code.
   */
  async validate(
    coupon: Coupon | null,
    ctx: CouponValidationContext,
    db: Tx | PrismaService = this.prisma,
  ): Promise<{ coupon: Coupon; pricing: PricingCoupon }> {
    const now = ctx.now ?? new Date();
    if (!coupon) throw unprocessable(ErrorCode.COUPON_INVALID, 'The coupon does not exist');
    if (!coupon.isActive) throw unprocessable(ErrorCode.COUPON_INACTIVE, 'The coupon is not active');
    if (coupon.startsAt && coupon.startsAt > now) {
      throw unprocessable(ErrorCode.COUPON_NOT_STARTED, 'The coupon is not available yet', {
        startsAt: coupon.startsAt,
      });
    }
    if (coupon.expiresAt && coupon.expiresAt <= now) {
      throw unprocessable(ErrorCode.COUPON_EXPIRED, 'The coupon has expired', { expiresAt: coupon.expiresAt });
    }
    if (coupon.usageLimit !== null && coupon.timesUsed >= coupon.usageLimit) {
      throw unprocessable(ErrorCode.COUPON_USAGE_LIMIT_REACHED, 'The coupon has reached its usage limit');
    }
    if (!ctx.userId) {
      throw unprocessable(ErrorCode.COUPON_REQUIRES_LOGIN, 'Sign in to apply coupons');
    }
    const used = await db.couponRedemption.count({
      where: { couponId: coupon.id, userId: ctx.userId, order: { status: { in: REDEMPTION_COUNTS_STATUSES } } },
    });
    if (used >= coupon.perUserLimit) {
      throw unprocessable(ErrorCode.COUPON_ALREADY_USED, 'You have already used this coupon', {
        perUserLimit: coupon.perUserLimit,
      });
    }
    const subtotal = ctx.lines.reduce((acc, l) => acc + l.unitPriceCents * l.quantity, 0);
    if (coupon.minSubtotalCents !== null && subtotal < coupon.minSubtotalCents) {
      throw unprocessable(
        ErrorCode.COUPON_MIN_SUBTOTAL_NOT_REACHED,
        `The coupon requires a minimum order of ${formatEur(coupon.minSubtotalCents)}`,
        { minSubtotalCents: coupon.minSubtotalCents, missingCents: coupon.minSubtotalCents - subtotal },
      );
    }
    const pricing = await this.toPricingCoupon(coupon, db);
    if (pricing.eligibleCategoryIds && couponDiscount(ctx.lines, pricing).eligible === 0) {
      throw unprocessable(
        ErrorCode.COUPON_NOT_APPLICABLE,
        'The coupon does not apply to any product in the cart',
        { categoryId: coupon.categoryId },
      );
    }
    return { coupon, pricing };
  }
}
