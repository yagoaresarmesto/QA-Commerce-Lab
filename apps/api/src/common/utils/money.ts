export const VAT_RATE = 0.21;

/** VAT contained in a gross (VAT inclusive) amount. */
export function vatIncluded(grossCents: number): number {
  return grossCents - Math.round(grossCents / (1 + VAT_RATE));
}

export function discountPercent(priceCents: number, compareAtPriceCents: number | null | undefined): number {
  if (!compareAtPriceCents || compareAtPriceCents <= priceCents) return 0;
  return Math.round((1 - priceCents / compareAtPriceCents) * 100);
}

export function formatEur(cents: number): string {
  return new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' }).format(cents / 100);
}
