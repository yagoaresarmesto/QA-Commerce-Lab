import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Package } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { OrderInfo, OrderItems, OrderPayments, OrderStatusBadge, OrderTimeline, OrderTotals, PaymentStatusBadge } from '../../components/checkout/OrderView';
import { RetryPayment } from '../../components/checkout/RetryPayment';
import { ProductImage } from '../../components/product/ProductCard';
import { Button, ButtonLink } from '../../components/ui/Button';
import { Pagination } from '../../components/ui/Commerce';
import { Alert, EmptyState, ErrorState, Skeleton } from '../../components/ui/Feedback';
import { ConfirmDialog } from '../../components/ui/Modal';
import { ApiError, errorMessage, http } from '../../lib/api';
import { formatDate, formatDateTime, formatPrice, ORDER_STATUS_LABEL } from '../../lib/format';
import { useOrder, useOrders } from '../../lib/queries';
import type { Order, OrderStatus } from '../../lib/types';
import { NotFoundPage } from '../NotFoundPage';
import { useDocumentTitle } from '../useDocumentTitle';

export function OrdersPage() {
  useDocumentTitle('My orders');
  const [params, setParams] = useSearchParams();
  const status = (params.get('status') ?? undefined) as OrderStatus | undefined;
  const page = Number(params.get('page') ?? 1) || 1;
  const { data, isLoading, isError, refetch } = useOrders({ status, page, pageSize: 10 });
  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <h1 className="heading-xl">My orders</h1>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-slate-600">Status</span>
          <select value={status ?? ''} onChange={(e) => setParams(e.target.value ? { status: e.target.value } : {})} className="h-10 rounded-full border border-slate-200 pl-4 pr-8" data-testid="orders-status-filter">
            <option value="">All</option>
            {(Object.keys(ORDER_STATUS_LABEL) as OrderStatus[]).map((s) => (
              <option key={s} value={s}>{ORDER_STATUS_LABEL[s]}</option>
            ))}
          </select>
        </label>
      </div>
      {isError && <ErrorState onRetry={() => refetch()} />}
      {isLoading && <Skeleton className="h-64" />}
      {data?.data.length === 0 && (
        <EmptyState icon={<Package className="h-8 w-8" />} title={status ? 'No orders with this status' : 'You have not placed any orders yet'} action={<ButtonLink to="/">Start shopping</ButtonLink>} testId="orders-empty" />
      )}
      <ul className="space-y-3" data-testid="order-list">
        {data?.data.map((o) => (
          <li key={o.id} className="rounded-3xl border border-slate-200/80 p-5 transition hover:border-slate-300 sm:p-6" data-testid="order-row" data-order-id={o.id} data-order-number={o.orderNumber}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <Link to={`/account/orders/${o.id}`} className="font-mono font-semibold text-slate-950 underline-offset-2 hover:underline" data-testid="order-link">{o.orderNumber}</Link>
                <p className="text-xs text-slate-500">{formatDateTime(o.createdAt)} · {o.itemsCount} {o.itemsCount === 1 ? 'item' : 'items'}</p>
              </div>
              <div className="flex items-center gap-2">
                <OrderStatusBadge status={o.status} />
                <PaymentStatusBadge status={o.paymentStatus} />
              </div>
              <span className="text-xl font-semibold tracking-tight">{formatPrice(o.totalCents)}</span>
            </div>
            <div className="mt-3 flex gap-2">
              {o.previewImages.map((src, i) => <ProductImage key={i} src={src} alt="" className="tile h-12 w-12 rounded-xl p-1" />)}
            </div>
          </li>
        ))}
      </ul>
      {data && (
        <div className="mt-6">
          <Pagination page={data.meta.page} totalPages={data.meta.totalPages} onPage={(p) => setParams({ ...(status ? { status } : {}), page: String(p) })} />
        </div>
      )}
    </div>
  );
}

function OrderActions({ order }: { order: Order }) {
  const qc = useQueryClient();
  const [dialog, setDialog] = useState<'cancel' | 'return' | null>(null);
  const action = useMutation({
    mutationFn: ({ kind, reason }: { kind: 'cancel' | 'return'; reason?: string }) => http.post<Order>(`/orders/${order.id}/${kind}`, kind === 'cancel' ? { reason } : { reason }),
    onSuccess: (o, v) => {
      qc.setQueryData(['order', String(order.id)], o);
      void qc.invalidateQueries({ queryKey: ['orders'] });
      toast.success(v.kind === 'cancel' ? 'Order cancelled' : 'Return requested');
      setDialog(null);
    },
    onError: (e) => {
      toast.error(errorMessage(e));
      if (e instanceof ApiError && e.status === 409) void qc.invalidateQueries({ queryKey: ['order', String(order.id)] });
    },
  });
  if (!order.actions.canCancel && !order.actions.canRequestReturn) return null;
  return (
    <div className="flex flex-wrap gap-3">
      {order.actions.canCancel && <Button variant="danger" onClick={() => setDialog('cancel')} data-testid="cancel-order">Cancel order</Button>}
      {order.actions.canRequestReturn && (
        <Button variant="outline" onClick={() => setDialog('return')} data-testid="request-return">
          Request a return (until {formatDate(order.actions.returnDeadline)})
        </Button>
      )}
      <ConfirmDialog
        open={dialog === 'cancel'}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Cancel order"
        description={order.paymentStatus === 'PAID' ? 'We will refund the full amount.' : 'We will release the reserved products.'}
        confirmLabel="Cancel order"
        loading={action.isPending}
        withReason={{ label: 'Reason (optional)' }}
        onConfirm={(reason) => action.mutate({ kind: 'cancel', reason })}
      />
      <ConfirmDialog
        open={dialog === 'return'}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Request a return"
        description="We will review your request and let you know by e-mail."
        confirmLabel="Request return"
        tone="primary"
        loading={action.isPending}
        withReason={{ label: 'Return reason', required: true, minLength: 5 }}
        onConfirm={(reason) => action.mutate({ kind: 'return', reason })}
      />
    </div>
  );
}

export function OrderDetailPage() {
  const { id } = useParams();
  const { data: order, isLoading, error, refetch } = useOrder(id, (q) => (q.state.data?.paymentStatus === 'PROCESSING' ? 3000 : false));
  useDocumentTitle(order ? `Order ${order.orderNumber}` : 'Order');
  if (error instanceof ApiError && error.status === 404) return <NotFoundPage />;
  if (error) return <ErrorState message={errorMessage(error)} onRetry={() => refetch()} />;
  if (isLoading || !order) return <Skeleton className="h-96 rounded-4xl" />;
  return (
    <div className="space-y-5" data-testid="order-detail" data-order-status={order.status}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link to="/account/orders" className="text-sm text-slate-500 hover:text-slate-950">← My orders</Link>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.03em]">Order <span className="font-mono" data-testid="order-number">{order.orderNumber}</span></h1>
          <p className="text-sm text-slate-500">Placed on {formatDateTime(order.createdAt)}</p>
        </div>
        <div className="flex gap-2">
          <OrderStatusBadge status={order.status} />
          <PaymentStatusBadge status={order.paymentStatus} />
        </div>
      </div>
      {order.status === 'CANCELLED' && order.cancelReason && <Alert tone="info" title="Order cancelled">{order.cancelReason}</Alert>}
      {order.status === 'RETURN_REQUESTED' && <Alert tone="info" title="Return under review">{order.returnReason}</Alert>}
      {order.status === 'PENDING' && order.reservationExpiresAt && (
        <Alert tone="warning" title="Awaiting payment">
          If the payment is not completed before {formatDateTime(order.reservationExpiresAt)}, the order will be cancelled automatically.
        </Alert>
      )}
      <OrderActions order={order} />
      <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-5">
          <section className="card p-6"><h2 className="mb-2 text-lg font-semibold tracking-tight">Products</h2><OrderItems order={order} /></section>
          <section className="card p-6"><h2 className="mb-3 text-lg font-semibold tracking-tight">Delivery</h2><OrderInfo order={order} /></section>
          <section className="card p-6"><h2 className="mb-3 text-lg font-semibold tracking-tight">Payments</h2><OrderPayments order={order} /></section>
          {order.actions.canPay && (
            <section className="card p-6" aria-label="Pay order"><h2 className="mb-3 text-lg font-semibold tracking-tight">Complete the payment</h2><RetryPayment order={order} /></section>
          )}
        </div>
        <div className="space-y-5">
          <section className="card p-6"><h2 className="mb-3 text-lg font-semibold tracking-tight">Amount</h2><OrderTotals order={order} /></section>
          <section className="card p-6"><h2 className="mb-3 text-lg font-semibold tracking-tight">Tracking</h2><OrderTimeline order={order} /></section>
        </div>
      </div>
    </div>
  );
}
