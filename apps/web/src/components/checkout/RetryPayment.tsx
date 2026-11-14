import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ApiError, errorMessage, http } from '../../lib/api';
import { formatPrice, newIdempotencyKey } from '../../lib/format';
import type { Order, OrderPaymentResult, PaymentMethod } from '../../lib/types';
import { Button } from '../ui/Button';
import { Alert } from '../ui/Feedback';
import { emptyCard, PaymentFields, toCardPayload, validateCard, type CardValues } from './PaymentFields';

export function RetryPayment({ order }: { order: Order }) {
  const qc = useQueryClient();
  const [method, setMethod] = useState<PaymentMethod>('CARD');
  const [card, setCard] = useState<CardValues>(emptyCard);
  const [errors, setErrors] = useState<Partial<Record<keyof CardValues, string>>>({});
  const [error, setError] = useState<string>();
  const body = useMemo(() => ({ paymentMethod: method, card: method === 'CARD' && Object.keys(validateCard(card)).length === 0 ? toCardPayload(card) : undefined }), [method, card]);
  const key = useMemo(() => newIdempotencyKey(), [JSON.stringify(body)]); // eslint-disable-line react-hooks/exhaustive-deps

  const pay = useMutation({
    mutationFn: () => http.post<OrderPaymentResult>(`/orders/${order.id}/payments`, body, { headers: { 'Idempotency-Key': key } }),
    onSuccess: (res) => {
      qc.setQueryData(['order', String(order.id)], res.order);
      void qc.invalidateQueries({ queryKey: ['orders'] });
      if (res.payment?.status === 'DECLINED') setError(res.payment.failureMessage ?? 'El pago ha sido rechazado');
      else toast.success(res.order.status === 'PAID' ? 'Pago completado' : 'Pago registrado');
    },
    onError: (e) => {
      setError(errorMessage(e));
      if (e instanceof ApiError && (e.status === 502 || e.status === 504)) void qc.invalidateQueries({ queryKey: ['order', String(order.id)] });
    },
  });

  return (
    <div className="space-y-4" data-testid="retry-payment">
      <PaymentFields method={method} onMethod={setMethod} card={card} onCard={setCard} errors={errors} />
      {error && (
        <Alert tone="error" testId="retry-payment-error">
          {error}
        </Alert>
      )}
      <Button
        size="lg"
        loading={pay.isPending}
        data-testid="retry-payment-submit"
        onClick={() => {
          setError(undefined);
          if (method === 'CARD') {
            const v = validateCard(card);
            setErrors(v);
            if (Object.keys(v).length) return;
          }
          pay.mutate();
        }}
      >
        Pagar {formatPrice(order.totalCents)}
      </Button>
    </div>
  );
}
