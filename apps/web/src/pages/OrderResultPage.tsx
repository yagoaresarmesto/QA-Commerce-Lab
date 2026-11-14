import { CheckCircle2, Clock, Landmark, XCircle } from 'lucide-react';
import { useLocation, useParams } from 'react-router';
import { OrderItems, OrderTotals } from '../components/checkout/OrderView';
import { RetryPayment } from '../components/checkout/RetryPayment';
import { ButtonLink } from '../components/ui/Button';
import { Alert, ErrorState, Skeleton } from '../components/ui/Feedback';
import { Spinner } from '../components/ui/Spinner';
import { errorMessage } from '../lib/api';
import { formatDateTime, formatPrice } from '../lib/format';
import { useOrder } from '../lib/queries';
import { useDocumentTitle } from './useDocumentTitle';

export function OrderResultPage() {
  const { id } = useParams();
  const location = useLocation();
  const gatewayError = (location.state as { gatewayError?: string } | null)?.gatewayError;
  // Poll while the simulated gateway resolves an asynchronous payment.
  const { data: order, isLoading, error, refetch } = useOrder(id, (q) => (q.state.data?.paymentStatus === 'PROCESSING' ? 3000 : false));
  useDocumentTitle('Resultado del pedido');

  if (isLoading) return <div className="container-page py-10"><Skeleton className="h-80 rounded-4xl" /></div>;
  if (error || !order) return <div className="container-page py-10"><ErrorState message={errorMessage(error)} onRetry={() => refetch()} /></div>;

  const pendingTransfer = order.paymentStatus === 'AWAITING_PAYMENT' && order.paymentMethod === 'BANK_TRANSFER' && order.status === 'PENDING';
  const transfer = order.payments.filter((p) => p.method === 'BANK_TRANSFER' && p.status === 'PENDING').at(-1);
  const lastPayment = order.payments.at(-1);
  const success = !['PENDING', 'CANCELLED'].includes(order.status);

  return (
    <div className="container-page max-w-3xl py-10" data-testid="order-result" data-order-status={order.status} data-payment-status={order.paymentStatus}>
      <div className="panel relative overflow-hidden px-6 py-12 text-center sm:px-12 sm:py-16">
        {success && (
          <>
            <span className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-accent-400 text-slate-950 shadow-[0_0_0_10px_rgb(200_245_66/0.25)]">
              <CheckCircle2 className="h-10 w-10" />
            </span>
            <h1 className="mt-6 text-3xl font-semibold tracking-[-0.03em] sm:text-4xl" data-testid="order-result-title">¡Gracias por tu compra!</h1>
            <p className="mx-auto mt-3 max-w-lg text-slate-600">Hemos recibido el pago de tu pedido. Te enviaremos un email con los detalles.</p>
          </>
        )}
        {order.status === 'PENDING' && order.paymentStatus === 'PROCESSING' && (
          <>
            <Spinner className="mx-auto h-14 w-14 text-slate-950" label="Procesando el pago" />
            <h1 className="mt-6 text-3xl font-semibold tracking-[-0.03em] sm:text-4xl" data-testid="order-result-title">Estamos procesando tu pago</h1>
            <p className="mx-auto mt-3 max-w-lg text-slate-600">La entidad está verificando la operación. Esta página se actualizará automáticamente.</p>
          </>
        )}
        {pendingTransfer && (
          <>
            <span className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-white text-slate-950 shadow-soft">
              <Landmark className="h-9 w-9" />
            </span>
            <h1 className="mt-6 text-3xl font-semibold tracking-[-0.03em] sm:text-4xl" data-testid="order-result-title">Pedido reservado: pendiente de transferencia</h1>
            <div className="mx-auto mt-6 max-w-md space-y-1 rounded-3xl bg-white p-5 text-left text-sm ring-1 ring-slate-900/5" data-testid="transfer-instructions">
              <p><span className="text-slate-500">Importe:</span> <strong>{formatPrice(order.totalCents)}</strong></p>
              <p><span className="text-slate-500">IBAN (ficticio):</span> <span className="font-mono">ES00 0000 0000 0000 0000 0000</span></p>
              <p><span className="text-slate-500">Referencia:</span> <span className="font-mono" data-testid="transfer-reference">{transfer?.providerReference}</span></p>
              <p><span className="text-slate-500">Reserva válida hasta:</span> {formatDateTime(order.reservationExpiresAt)}</p>
            </div>
          </>
        )}
        {order.status === 'PENDING' && order.paymentStatus === 'FAILED' && (
          <>
            <span className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-rose-100 text-rose-600">
              <XCircle className="h-10 w-10" />
            </span>
            <h1 className="mt-6 text-3xl font-semibold tracking-[-0.03em] sm:text-4xl" data-testid="order-result-title">El pago no se ha completado</h1>
            <p className="mx-auto mt-3 max-w-lg text-slate-600">
              {lastPayment?.failureMessage ?? 'La operación ha sido rechazada.'} Tu pedido está reservado
              {order.reservationExpiresAt ? ` hasta las ${formatDateTime(order.reservationExpiresAt)}` : ''}: puedes intentarlo de nuevo.
            </p>
          </>
        )}
        {order.status === 'CANCELLED' && (
          <>
            <span className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-white text-slate-400 shadow-soft">
              <Clock className="h-10 w-10" />
            </span>
            <h1 className="mt-6 text-3xl font-semibold tracking-[-0.03em] sm:text-4xl" data-testid="order-result-title">Pedido cancelado</h1>
            <p className="mx-auto mt-3 max-w-lg text-slate-600">{order.cancelReason}</p>
          </>
        )}
        <p className="mt-6 inline-flex flex-wrap items-center justify-center gap-2 rounded-full bg-white px-4 py-2 text-sm text-slate-500 ring-1 ring-slate-900/5">
          Número de pedido: <strong className="font-mono text-slate-900" data-testid="order-number">{order.orderNumber}</strong>
        </p>
        {gatewayError && order.paymentStatus === 'FAILED' && (
          <Alert tone="warning" className="mt-4 text-left">
            {gatewayError}
          </Alert>
        )}
      </div>

      {order.actions.canPay && order.paymentStatus === 'FAILED' && (
        <section className="mt-6 rounded-4xl border border-slate-200/80 p-6 sm:p-8" aria-label="Reintentar pago">
          <h2 className="mb-5 text-xl font-semibold tracking-tight">Reintentar el pago</h2>
          <RetryPayment order={order} />
        </section>
      )}

      <section className="mt-6 rounded-4xl border border-slate-200/80 p-6 sm:p-8" aria-label="Resumen del pedido">
        <OrderItems order={order} />
        <div className="mt-4 border-t border-slate-200/80 pt-5">
          <OrderTotals order={order} />
        </div>
      </section>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <ButtonLink to={`/cuenta/pedidos/${order.id}`} variant="outline" data-testid="view-order">
          Ver detalle del pedido
        </ButtonLink>
        <ButtonLink to="/">Seguir comprando</ButtonLink>
      </div>
    </div>
  );
}
