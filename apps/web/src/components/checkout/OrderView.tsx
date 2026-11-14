import { Clock, MapPin, Truck } from 'lucide-react';
import { Link } from 'react-router';
import { cn } from '../../lib/cn';
import { formatDateTime, formatPrice, ORDER_STATUS_LABEL, PAYMENT_ATTEMPT_LABEL, PAYMENT_STATUS_LABEL } from '../../lib/format';
import type { Order, OrderPaymentStatus, OrderStatus } from '../../lib/types';
import { Badge, type BadgeTone } from '../ui/Feedback';
import { ProductImage } from '../product/ProductCard';

const STATUS_TONE: Record<OrderStatus, BadgeTone> = {
  PENDING: 'amber',
  PAID: 'sky',
  PREPARING: 'violet',
  SHIPPED: 'brand',
  DELIVERED: 'green',
  CANCELLED: 'slate',
  RETURN_REQUESTED: 'amber',
  RETURNED: 'slate',
};
const PAYMENT_TONE: Record<OrderPaymentStatus, BadgeTone> = {
  AWAITING_PAYMENT: 'amber',
  PROCESSING: 'sky',
  PAID: 'green',
  FAILED: 'red',
  REFUNDED: 'slate',
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <Badge tone={STATUS_TONE[status]} testId="order-status">
      <span data-status={status}>{ORDER_STATUS_LABEL[status]}</span>
    </Badge>
  );
}

export function PaymentStatusBadge({ status }: { status: OrderPaymentStatus }) {
  return (
    <Badge tone={PAYMENT_TONE[status]} testId="payment-status">
      <span data-status={status}>{PAYMENT_STATUS_LABEL[status]}</span>
    </Badge>
  );
}

export function OrderTotals({ order }: { order: Order }) {
  return (
    <dl className="space-y-2 text-sm" data-testid="order-totals">
      <div className="flex justify-between"><dt className="text-slate-600">Subtotal</dt><dd>{formatPrice(order.subtotalCents)}</dd></div>
      {order.discountCents > 0 && (
        <div className="flex justify-between text-emerald-700"><dt>Discount {order.couponCode && `(${order.couponCode})`}</dt><dd>−{formatPrice(order.discountCents)}</dd></div>
      )}
      <div className="flex justify-between"><dt className="text-slate-600">Shipping ({order.shippingMethod.name})</dt><dd>{order.shippingCents === 0 ? 'Free' : formatPrice(order.shippingCents)}</dd></div>
      <div className="flex items-baseline justify-between border-t border-slate-200 pt-3 text-base font-semibold"><dt>Total</dt><dd className="text-2xl tracking-tight" data-testid="order-total">{formatPrice(order.totalCents)}</dd></div>
      <p className="text-xs text-slate-500">VAT included: {formatPrice(order.taxCents)}</p>
    </dl>
  );
}

export function OrderItems({ order }: { order: Order }) {
  return (
    <ul className="divide-y divide-slate-200/80" data-testid="order-items">
      {order.items.map((i) => (
        <li key={i.id} className="flex items-center gap-4 py-4" data-testid="order-item" data-sku={i.sku}>
          {i.imageUrl && (
            <span className="tile shrink-0 rounded-2xl p-1.5">
              <ProductImage src={i.imageUrl} alt="" className="h-14 w-14" />
            </span>
          )}
          <div className="min-w-0 flex-1 text-sm">
            {i.productSlug ? (
              <Link to={`/product/${i.productSlug}`} className="font-medium text-slate-950 hover:underline">
                {i.name}
              </Link>
            ) : (
              <span className="font-medium text-slate-950">{i.name}</span>
            )}
            <p className="text-slate-500">
              {i.quantity} × {formatPrice(i.unitPriceCents)} · SKU {i.sku}
            </p>
          </div>
          <span className="text-sm font-semibold">{formatPrice(i.lineTotalCents)}</span>
        </li>
      ))}
    </ul>
  );
}

export function OrderInfo({ order }: { order: Order }) {
  const a = order.shippingAddress;
  return (
    <div className="grid gap-4 text-sm sm:grid-cols-2">
      <div className="rounded-3xl bg-slate-50 p-5">
        <p className="mb-1 flex items-center gap-1.5 font-semibold"><MapPin className="h-4 w-4" /> Shipping address</p>
        <p className="text-slate-600">{a.fullName} · {a.phone}</p>
        <p className="text-slate-600">{a.line1}{a.line2 ? `, ${a.line2}` : ''}</p>
        <p className="text-slate-600">{a.postalCode} {a.city} ({a.province})</p>
      </div>
      <div className="rounded-3xl bg-slate-50 p-5">
        <p className="mb-1 flex items-center gap-1.5 font-semibold"><Truck className="h-4 w-4" /> Shipping</p>
        <p className="text-slate-600">{order.shippingMethod.name}</p>
        {order.pickupPoint && <p className="text-slate-600">Pickup: {order.pickupPoint.name}, {order.pickupPoint.address} ({order.pickupPoint.city})</p>}
        {order.trackingNumber && <p className="text-slate-600">Tracking: <span className="font-mono" data-testid="tracking-number">{order.trackingNumber}</span></p>}
      </div>
    </div>
  );
}

export function OrderTimeline({ order }: { order: Order }) {
  return (
    <ol className="space-y-3" data-testid="order-timeline">
      {order.history.map((h, i) => (
        <li key={i} className="flex gap-3 text-sm">
          <span className={cn('mt-1 h-2.5 w-2.5 shrink-0 rounded-full', i === order.history.length - 1 ? 'bg-accent-400 ring-4 ring-accent-200' : 'bg-slate-300')} />
          <div>
            <p className="font-semibold">{ORDER_STATUS_LABEL[h.toStatus]}</p>
            <p className="text-xs text-slate-500">
              <Clock className="mr-1 inline h-3 w-3" />
              {formatDateTime(h.createdAt)}
              {h.note ? ` · ${h.note}` : ''}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function OrderPayments({ order }: { order: Order }) {
  if (!order.payments.length) return <p className="text-sm text-slate-500">No payment attempts.</p>;
  return (
    <ul className="space-y-2 text-sm" data-testid="order-payments">
      {order.payments.map((p) => (
        <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200/80 p-4" data-testid="payment-attempt" data-status={p.status}>
          <span>
            {p.method === 'CARD' ? `Card ${p.cardBrand ?? ''} ****${p.cardLast4 ?? ''}` : `Bank transfer · ref. ${p.providerReference}`}
            <span className="block text-xs text-slate-500">{formatDateTime(p.createdAt)}{p.failureMessage ? ` · ${p.failureMessage}` : ''}</span>
          </span>
          <Badge tone={p.status === 'APPROVED' ? 'green' : p.status === 'PENDING' ? 'amber' : p.status === 'REFUNDED' ? 'slate' : 'red'}>{PAYMENT_ATTEMPT_LABEL[p.status]}</Badge>
        </li>
      ))}
    </ul>
  );
}
