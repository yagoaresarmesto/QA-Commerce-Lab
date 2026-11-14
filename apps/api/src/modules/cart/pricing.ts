import { CouponType } from '@prisma/client';
import { vatIncluded } from '../../common/utils/money';

/**
 * Pure pricing engine shared by the cart, checkout quote and order creation.
 * All amounts are integer cents (VAT included). The backend is the only source of truth.
 */

export interface PricingLine {
  productId: number;
  categoryId: number;
  unitPriceCents: number;
  quantity: number;
}

export interface PricingCoupon {
  code: string;
  type: CouponType;
  value: number;
  maxDiscountCents: number | null;
  /** When set, only lines in these categories are eligible. */
  eligibleCategoryIds: number[] | null;
}

export interface PricingShipping {
  code: string;
  priceCents: number;
  freeOverCents: number | null;
}

export interface PricingResult {
  subtotalCents: number;
  discountCents: number;
  shippingCents: number;
  /** Shipping before any free-shipping rule */
  shippingBaseCents: number;
  freeShippingApplied: boolean;
  totalCents: number;
  taxCents: number;
  /** Subtotal of the lines the coupon applies to */
  eligibleSubtotalCents: number;
  /** Remaining amount (after discount) to reach free shipping, null when not applicable */
  amountToFreeShippingCents: number | null;
}

export function lineTotal(l: PricingLine): number {
  return l.unitPriceCents * l.quantity;
}

export function couponDiscount(lines: PricingLine[], coupon: PricingCoupon | null): { discount: number; eligible: number } {
  const subtotal = lines.reduce((acc, l) => acc + lineTotal(l), 0);
  if (!coupon) return { discount: 0, eligible: subtotal };
  const eligibleLines = coupon.eligibleCategoryIds
    ? lines.filter((l) => coupon.eligibleCategoryIds!.includes(l.categoryId))
    : lines;
  const eligible = eligibleLines.reduce((acc, l) => acc + lineTotal(l), 0);
  let discount = 0;
  if (coupon.type === CouponType.PERCENTAGE) discount = Math.round((eligible * coupon.value) / 100);
  else if (coupon.type === CouponType.FIXED_AMOUNT) discount = coupon.value;
  if (coupon.maxDiscountCents !== null && coupon.maxDiscountCents !== undefined) {
    discount = Math.min(discount, coupon.maxDiscountCents);
  }
  return { discount: Math.max(0, Math.min(discount, eligible)), eligible };
}

export function computePricing(
  lines: PricingLine[],
  coupon: PricingCoupon | null,
  shipping: PricingShipping | null,
): PricingResult {
  const subtotalCents = lines.reduce((acc, l) => acc + lineTotal(l), 0);
  const { discount, eligible } = couponDiscount(lines, coupon);
  const afterDiscount = subtotalCents - discount;

  let shippingBaseCents = 0;
  let shippingCents = 0;
  let freeShippingApplied = false;
  let amountToFreeShippingCents: number | null = null;
  if (shipping && lines.length > 0) {
    shippingBaseCents = shipping.priceCents;
    const freeByThreshold = shipping.freeOverCents !== null && afterDiscount >= shipping.freeOverCents;
    const freeByCoupon = coupon?.type === CouponType.FREE_SHIPPING;
    freeShippingApplied = freeByThreshold || freeByCoupon || shipping.priceCents === 0;
    shippingCents = freeShippingApplied ? 0 : shipping.priceCents;
    if (shipping.freeOverCents !== null && !freeShippingApplied) {
      amountToFreeShippingCents = shipping.freeOverCents - afterDiscount;
    }
  }
  const totalCents = afterDiscount + shippingCents;
  return {
    subtotalCents,
    discountCents: discount,
    shippingCents,
    shippingBaseCents,
    freeShippingApplied,
    totalCents,
    taxCents: vatIncluded(totalCents),
    eligibleSubtotalCents: eligible,
    amountToFreeShippingCents,
  };
}
