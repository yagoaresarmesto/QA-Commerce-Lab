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
  useDocumentTitle('Mis pedidos');
  const [params, setParams] = useSearchParams();
  const status = (params.get('estado') ?? undefined) as OrderStatus | undefined;
  const page = Number(params.get('page') ?? 1) || 1;
  const { data, isLoading, isError, refetch } = useOrders({ status, page, pageSize: 10 });
  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-extrabold tracking-tight">Mis pedidos</h1>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-slate-600">Estado</span>
          <select value={status ?? ''} onChange={(e) => setParams(e.target.value ? { estado: e.target.value } : {})} className="h-10 rounded-xl border border-slate-300 px-3" data-testid="orders-status-filter">
            <option value="">Todos</option>
            {(Object.keys(ORDER_STATUS_LABEL) as OrderStatus[]).map((s) => (
              <option key={s} value={s}>{ORDER_STATUS_LABEL[s]}</option>
            ))}
          </select>
        </label>
      </div>
      {isError && <ErrorState onRetry={() => refetch()} />}
      {isLoading && <Skeleton className="h-64" />}
      {data?.data.length === 0 && (
        <EmptyState icon={<Package className="h-8 w-8" />} title={status ? 'No hay pedidos con este estado' : 'Todavía no has hecho ningún pedido'} action={<ButtonLink to="/">Empezar a comprar</ButtonLink>} testId="orders-empty" />
      )}
      <ul className="space-y-3" data-testid="order-list">
        {data?.data.map((o) => (
          <li key={o.id} className="card p-4 sm:p-5" data-testid="order-row" data-order-id={o.id} data-order-number={o.orderNumber}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <Link to={`/cuenta/pedidos/${o.id}`} className="font-mono font-bold text-brand-700 hover:text-brand-800" data-testid="order-link">{o.orderNumber}</Link>
                <p className="text-xs text-slate-500">{formatDateTime(o.createdAt)} · {o.itemsCount} {o.itemsCount === 1 ? 'artículo' : 'artículos'}</p>
              </div>
              <div className="flex items-center gap-2">
                <OrderStatusBadge status={o.status} />
                <PaymentStatusBadge status={o.paymentStatus} />
              </div>
              <span className="text-lg font-extrabold">{formatPrice(o.totalCents)}</span>
            </div>
            <div className="mt-3 flex gap-2">
              {o.previewImages.map((src, i) => <ProductImage key={i} src={src} alt="" className="h-12 w-12 rounded-lg bg-slate-50" />)}
            </div>
          </li>
        ))}
      </ul>
      {data && (
        <div className="mt-6">
          <Pagination page={data.meta.page} totalPages={data.meta.totalPages} onPage={(p) => setParams({ ...(status ? { estado: status } : {}), page: String(p) })} />
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
      toast.success(v.kind === 'cancel' ? 'Pedido cancelado' : 'Devolución solicitada');
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
      {order.actions.canCancel && <Button variant="danger" onClick={() => setDialog('cancel')} data-testid="cancel-order">Cancelar pedido</Button>}
      {order.actions.canRequestReturn && (
        <Button variant="outline" onClick={() => setDialog('return')} data-testid="request-return">
          Solicitar devolución (hasta {formatDate(order.actions.returnDeadline)})
        </Button>
      )}
      <ConfirmDialog
        open={dialog === 'cancel'}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Cancelar pedido"
        description={order.paymentStatus === 'PAID' ? 'Te reembolsaremos el importe completo.' : 'Liberaremos los productos reservados.'}
        confirmLabel="Cancelar pedido"
        loading={action.isPending}
        withReason={{ label: 'Motivo (opcional)' }}
        onConfirm={(reason) => action.mutate({ kind: 'cancel', reason })}
      />
      <ConfirmDialog
        open={dialog === 'return'}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Solicitar devolución"
        description="Revisaremos tu solicitud y te informaremos por email."
        confirmLabel="Solicitar devolución"
        tone="primary"
        loading={action.isPending}
        withReason={{ label: 'Motivo de la devolución', required: true, minLength: 5 }}
        onConfirm={(reason) => action.mutate({ kind: 'return', reason })}
      />
    </div>
  );
}

export function OrderDetailPage() {
  const { id } = useParams();
  const { data: order, isLoading, error, refetch } = useOrder(id, (q) => (q.state.data?.paymentStatus === 'PROCESSING' ? 3000 : false));
  useDocumentTitle(order ? `Pedido ${order.orderNumber}` : 'Pedido');
  if (error instanceof ApiError && error.status === 404) return <NotFoundPage />;
  if (error) return <ErrorState message={errorMessage(error)} onRetry={() => refetch()} />;
  if (isLoading || !order) return <Skeleton className="h-96" />;
  return (
    <div className="space-y-5" data-testid="order-detail" data-order-status={order.status}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link to="/cuenta/pedidos" className="text-sm text-slate-500 hover:text-brand-700">← Mis pedidos</Link>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight">Pedido <span className="font-mono" data-testid="order-number">{order.orderNumber}</span></h1>
          <p className="text-sm text-slate-500">Realizado el {formatDateTime(order.createdAt)}</p>
        </div>
        <div className="flex gap-2">
          <OrderStatusBadge status={order.status} />
          <PaymentStatusBadge status={order.paymentStatus} />
        </div>
      </div>
      {order.status === 'CANCELLED' && order.cancelReason && <Alert tone="info" title="Pedido cancelado">{order.cancelReason}</Alert>}
      {order.status === 'RETURN_REQUESTED' && <Alert tone="info" title="Devolución en revisión">{order.returnReason}</Alert>}
      {order.status === 'PENDING' && order.reservationExpiresAt && (
        <Alert tone="warning" title="Pendiente de pago">
          Si no se completa el pago antes del {formatDateTime(order.reservationExpiresAt)}, el pedido se cancelará automáticamente.
        </Alert>
      )}
      <OrderActions order={order} />
      <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-5">
          <section className="card p-5"><h2 className="mb-2 font-bold">Productos</h2><OrderItems order={order} /></section>
          <section className="card p-5"><h2 className="mb-3 font-bold">Entrega</h2><OrderInfo order={order} /></section>
          <section className="card p-5"><h2 className="mb-3 font-bold">Pagos</h2><OrderPayments order={order} /></section>
          {order.actions.canPay && (
            <section className="card p-5" aria-label="Pagar pedido"><h2 className="mb-3 font-bold">Completar el pago</h2><RetryPayment order={order} /></section>
          )}
        </div>
        <div className="space-y-5">
          <section className="card p-5"><h2 className="mb-3 font-bold">Importe</h2><OrderTotals order={order} /></section>
          <section className="card p-5"><h2 className="mb-3 font-bold">Seguimiento</h2><OrderTimeline order={order} /></section>
        </div>
      </div>
    </div>
  );
}
