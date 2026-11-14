import { CouponType } from '@prisma/client';
import { computePricing, couponDiscount, PricingCoupon, PricingLine } from './pricing';

const lines: PricingLine[] = [
  { productId: 1, categoryId: 10, unitPriceCents: 5000, quantity: 2 }, // 100.00
  { productId: 2, categoryId: 20, unitPriceCents: 2499, quantity: 1 }, // 24.99
];
const standard = { code: 'STANDARD', priceCents: 499, freeOverCents: 9900 };

const coupon = (over: Partial<PricingCoupon>): PricingCoupon => ({
  code: 'X',
  type: CouponType.PERCENTAGE,
  value: 10,
  maxDiscountCents: null,
  eligibleCategoryIds: null,
  ...over,
});

describe('pricing engine', () => {
  it('computes subtotal, free shipping over threshold and VAT', () => {
    const r = computePricing(lines, null, standard);
    expect(r.subtotalCents).toBe(12499);
    expect(r.shippingCents).toBe(0);
    expect(r.freeShippingApplied).toBe(true);
    expect(r.totalCents).toBe(12499);
    expect(r.taxCents).toBe(12499 - Math.round(12499 / 1.21));
  });

  it('charges shipping below the threshold and reports the missing amount', () => {
    const r = computePricing([{ productId: 1, categoryId: 1, unitPriceCents: 9899, quantity: 1 }], null, standard);
    expect(r.shippingCents).toBe(499);
    expect(r.totalCents).toBe(10398);
    expect(r.amountToFreeShippingCents).toBe(1);
  });

  it('applies the threshold to the subtotal after discount', () => {
    const r = computePricing(
      [{ productId: 1, categoryId: 1, unitPriceCents: 10000, quantity: 1 }],
      coupon({ type: CouponType.FIXED_AMOUNT, value: 2000 }),
      standard,
    );
    expect(r.discountCents).toBe(2000);
    expect(r.shippingCents).toBe(499);
    expect(r.totalCents).toBe(8499);
  });

  it('percentage coupons respect the cap', () => {
    expect(couponDiscount(lines, coupon({ value: 50, maxDiscountCents: 1000 })).discount).toBe(1000);
  });

  it('category restricted coupons only discount eligible lines', () => {
    const r = couponDiscount(lines, coupon({ value: 20, eligibleCategoryIds: [20] }));
    expect(r.eligible).toBe(2499);
    expect(r.discount).toBe(500);
  });

  it('fixed discounts never exceed the eligible subtotal', () => {
    expect(couponDiscount(lines, coupon({ type: CouponType.FIXED_AMOUNT, value: 999999 })).discount).toBe(12499);
  });

  it('free shipping coupons remove shipping costs', () => {
    const r = computePricing(
      [{ productId: 1, categoryId: 1, unitPriceCents: 1000, quantity: 1 }],
      coupon({ type: CouponType.FREE_SHIPPING, value: 0 }),
      { code: 'EXPRESS', priceCents: 1299, freeOverCents: null },
    );
    expect(r.discountCents).toBe(0);
    expect(r.shippingCents).toBe(0);
    expect(r.shippingBaseCents).toBe(1299);
    expect(r.totalCents).toBe(1000);
  });

  it('an empty cart costs nothing', () => {
    expect(computePricing([], null, standard).totalCents).toBe(0);
  });
});
