import type { OrderPaymentStatus, OrderStatus, PaymentStatus } from './types';

const eur = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' });
const date = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
const dateTime = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export const formatPrice = (cents: number) => eur.format(cents / 100);
export const formatDate = (iso: string | null | undefined) => (iso ? date.format(new Date(iso)) : '—');
export const formatDateTime = (iso: string | null | undefined) => (iso ? dateTime.format(new Date(iso)) : '—');

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING: 'Pending',
  PAID: 'Paid',
  PREPARING: 'Preparing',
  SHIPPED: 'Shipped',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  RETURN_REQUESTED: 'Return requested',
  RETURNED: 'Returned',
};

export const PAYMENT_STATUS_LABEL: Record<OrderPaymentStatus, string> = {
  AWAITING_PAYMENT: 'Awaiting payment',
  PROCESSING: 'Processing payment',
  PAID: 'Paid',
  FAILED: 'Payment failed',
  REFUNDED: 'Refunded',
};

export const PAYMENT_ATTEMPT_LABEL: Record<PaymentStatus, string> = {
  PENDING: 'Pending',
  APPROVED: 'Approved',
  DECLINED: 'Declined',
  FAILED: 'Failed',
  REFUNDED: 'Refunded',
};

/** Parses a euro amount typed by the user ("12,50" / "12.5") into cents. */
export function eurosToCents(value: string): number | undefined {
  const normalized = value.replace(/\s/g, '').replace(',', '.');
  if (!normalized) return undefined;
  const n = Number(normalized);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : undefined;
}

export const centsToEuros = (cents: number | null | undefined) => (cents === null || cents === undefined ? '' : (cents / 100).toFixed(2));

export function pluralize(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

/** Random key for Idempotency-Key headers (crypto.randomUUID needs a secure context, so fall back). */
export function newIdempotencyKey(): string {
  const uuid =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  return `web-${uuid}`;
}
