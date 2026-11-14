import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, MapPin, Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { AddressForm } from '../components/checkout/AddressForm';
import { emptyCard, PaymentFields, toCardPayload, validateCard, type CardValues } from '../components/checkout/PaymentFields';
import { ProductImage } from '../components/product/ProductCard';
import { Button, ButtonLink } from '../components/ui/Button';
import { Alert, EmptyState, Skeleton } from '../components/ui/Feedback';
import { Textarea } from '../components/ui/Field';
import { ApiError, errorMessage, http } from '../lib/api';
import { cn } from '../lib/cn';
import { formatPrice, newIdempotencyKey } from '../lib/format';
import { useAddresses, useCart, useShippingMethods } from '../lib/queries';
import type { OrderPaymentResult, PaymentMethod, PickupPoint, Quote } from '../lib/types';
import { useDocumentTitle } from './useDocumentTitle';

const STEPS = ['Dirección', 'Envío', 'Pago', 'Revisión'] as const;

function Stepper({ step, onStep }: { step: number; onStep: (s: number) => void }) {
  return (
    <ol className="mb-8 flex items-center gap-2" aria-label="Pasos del checkout" data-testid="checkout-steps">
      {STEPS.map((label, i) => {
        const done = i < step;
        return (
          <li key={label} className="flex flex-1 items-center gap-2">
            <button
              type="button"
              disabled={i > step}
              onClick={() => onStep(i)}
              aria-current={i === step ? 'step' : undefined}
              className={cn('flex items-center gap-2 text-sm font-semibold', i === step ? 'text-brand-700' : done ? 'text-slate-700' : 'text-slate-400')}
              data-testid={`checkout-step-${i + 1}`}
            >
              <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-xs', i === step ? 'border-brand-600 bg-brand-600 text-white' : done ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300')}>
                {done ? <Check className="h-4 w-4" /> : i + 1}
              </span>
              <span className="hidden sm:inline">{label}</span>
            </button>
            {i < STEPS.length - 1 && <span className={cn('h-0.5 flex-1 rounded', done ? 'bg-emerald-500' : 'bg-slate-200')} aria-hidden="true" />}
          </li>
        );
      })}
    </ol>
  );
}

export function CheckoutPage() {
  useDocumentTitle('Finalizar compra');
  const navigate = useNavigate();
  const qc = useQueryClient();
  const cart = useCart();
  const addresses = useAddresses();
  const methods = useShippingMethods();
  const [step, setStep] = useState(0);
  const [addressId, setAddressId] = useState<number>();
  const [addingAddress, setAddingAddress] = useState(false);
  const [shippingCode, setShippingCode] = useState<string>('STANDARD');
  const [pickupPointId, setPickupPointId] = useState<number>();
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CARD');
  const [card, setCard] = useState<CardValues>(emptyCard);
  const [cardErrors, setCardErrors] = useState<Partial<Record<keyof CardValues, string>>>({});
  const [note, setNote] = useState('');
  const [submitError, setSubmitError] = useState<string>();

  useEffect(() => {
    if (!addressId && addresses.data?.length) setAddressId((addresses.data.find((a) => a.isDefault) ?? addresses.data[0]).id);
  }, [addresses.data, addressId]);

  const selectedMethod = methods.data?.find((m) => m.code === shippingCode);
  const pickupPoints = useQuery({
    queryKey: ['catalog', 'pickup-points'],
    queryFn: () => http.get<PickupPoint[]>('/shipping/pickup-points'),
    enabled: !!selectedMethod?.requiresPickupPoint,
  });
  const quote = useQuery({
    queryKey: ['quote', addressId, shippingCode, pickupPointId, cart.data?.updatedAt],
    queryFn: () => http.post<Quote>('/checkout/quote', { addressId, shippingMethodCode: shippingCode, pickupPointId }),
    enabled: !!addressId && step >= 1 && (!selectedMethod?.requiresPickupPoint || !!pickupPointId),
  });

  const payload = useMemo(
    () => ({
      addressId,
      shippingMethodCode: shippingCode,
      pickupPointId: selectedMethod?.requiresPickupPoint ? pickupPointId : undefined,
      paymentMethod,
      card: paymentMethod === 'CARD' && Object.keys(validateCard(card)).length === 0 ? toCardPayload(card) : undefined,
      expectedTotalCents: quote.data?.totalCents,
      customerNote: note.trim() || undefined,
    }),
    [addressId, shippingCode, pickupPointId, selectedMethod, paymentMethod, card, quote.data?.totalCents, note],
  );
  // One idempotency key per distinct purchase attempt: a double click or a retry after a network error reuses it.
  const idempotencyKey = useMemo(() => newIdempotencyKey(), [JSON.stringify(payload)]); // eslint-disable-line react-hooks/exhaustive-deps

  const placeOrder = useMutation({
    mutationFn: () => http.post<OrderPaymentResult>('/orders', payload, { headers: { 'Idempotency-Key': idempotencyKey } }),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ['cart'] });
      void qc.invalidateQueries({ queryKey: ['orders'] });
      void qc.invalidateQueries({ queryKey: ['catalog'] });
      navigate(`/checkout/resultado/${res.order.id}`, { replace: true });
    },
    onError: (e) => {
      if (!(e instanceof ApiError)) return setSubmitError(errorMessage(e));
      const details = e.details as { orderId?: number } | undefined;
      if ((e.status === 502 || e.status === 504) && details?.orderId) {
        void qc.invalidateQueries({ queryKey: ['cart'] });
        toast.error(e.message);
        return navigate(`/checkout/resultado/${details.orderId}`, { replace: true, state: { gatewayError: e.message } });
      }
      if (e.code === 'PRICE_CHANGED') {
        void quote.refetch();
        return setSubmitError('El importe del pedido ha cambiado. Revisa el resumen actualizado y vuelve a confirmar.');
      }
      if (['CART_HAS_ISSUES', 'CART_EMPTY', 'INSUFFICIENT_STOCK'].includes(e.code)) {
        toast.error(e.message);
        void qc.invalidateQueries({ queryKey: ['cart'] });
        return navigate('/carrito');
      }
      if (e.code.startsWith('CARD_')) {
        setStep(2);
        setCardErrors({ number: e.message });
      }
      setSubmitError(e.message);
    },
  });

  if (cart.isLoading || addresses.isLoading || methods.isLoading) {
    return (
      <div className="container-page py-8">
        <Skeleton className="h-96" />
      </div>
    );
  }
  if (!cart.data || cart.data.items.length === 0) {
    return (
      <div className="container-page py-8">
        <EmptyState title="No hay nada que pagar" description="Tu carrito está vacío." action={<ButtonLink to="/">Ir a la tienda</ButtonLink>} testId="checkout-empty" />
      </div>
    );
  }
  if (cart.data.hasIssues) {
    return (
      <div className="container-page py-8">
        <Alert tone="warning" title="Tu carrito necesita cambios" testId="checkout-cart-issues">
          Hay productos no disponibles o sin stock suficiente. <ButtonLink to="/carrito" variant="outline" size="sm" className="ml-2">Revisar carrito</ButtonLink>
        </Alert>
      </div>
    );
  }

  const next = () => {
    setSubmitError(undefined);
    if (step === 0 && !addressId) return toast.error('Selecciona o añade una dirección de envío');
    if (step === 1 && selectedMethod?.requiresPickupPoint && !pickupPointId) return toast.error('Selecciona un punto de recogida');
    if (step === 2 && paymentMethod === 'CARD') {
      const errors = validateCard(card);
      setCardErrors(errors);
      if (Object.keys(errors).length) return;
    }
    setStep((s) => Math.min(3, s + 1));
  };

  const address = addresses.data?.find((a) => a.id === addressId);
  const q = quote.data;

  return (
    <div className="container-page max-w-5xl py-8">
      <h1 className="mb-6 text-2xl font-extrabold tracking-tight sm:text-3xl">Finalizar compra</h1>
      <Stepper step={step} onStep={(s) => s <= step && setStep(s)} />
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <section className="card p-5 sm:p-6" aria-labelledby="step-title">
          <h2 id="step-title" className="mb-5 text-lg font-bold">
            {step + 1}. {STEPS[step] === 'Dirección' ? 'Dirección de envío' : STEPS[step] === 'Envío' ? 'Método de envío' : STEPS[step] === 'Pago' ? 'Método de pago' : 'Revisa y confirma tu pedido'}
          </h2>

          {step === 0 && (
            <div className="space-y-4">
              {addresses.data && addresses.data.length > 0 && !addingAddress && (
                <fieldset className="grid gap-3 sm:grid-cols-2" data-testid="address-options">
                  <legend className="sr-only">Selecciona una dirección</legend>
                  {addresses.data.map((a) => (
                    <label key={a.id} className={cn('card flex cursor-pointer gap-3 p-4', addressId === a.id ? 'border-brand-500 ring-2 ring-brand-100' : 'hover:border-slate-300')} data-testid="address-option">
                      <input type="radio" name="address" className="mt-1 h-4 w-4 accent-brand-600" checked={addressId === a.id} onChange={() => setAddressId(a.id)} />
                      <span className="text-sm">
                        <span className="block font-semibold">
                          {a.label ?? 'Dirección'} {a.isDefault && <span className="ml-1 text-xs font-medium text-brand-700">(predeterminada)</span>}
                        </span>
                        <span className="block text-slate-600">{a.fullName}</span>
                        <span className="block text-slate-600">
                          {a.line1}
                          {a.line2 ? `, ${a.line2}` : ''}
                        </span>
                        <span className="block text-slate-600">
                          {a.postalCode} {a.city} ({a.province})
                        </span>
                      </span>
                    </label>
                  ))}
                </fieldset>
              )}
              {addingAddress || addresses.data?.length === 0 ? (
                <AddressForm
                  onSaved={(a) => {
                    setAddressId(a.id);
                    setAddingAddress(false);
                  }}
                  onCancel={addresses.data?.length ? () => setAddingAddress(false) : undefined}
                />
              ) : (
                <Button variant="outline" icon={<Plus className="h-4 w-4" />} onClick={() => setAddingAddress(true)} data-testid="add-address">
                  Añadir nueva dirección
                </Button>
              )}
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <fieldset className="space-y-3" data-testid="shipping-options">
                <legend className="sr-only">Selecciona un método de envío</legend>
                {methods.data?.map((m) => {
                  const subtotalAfterDiscount = cart.data!.totals.subtotalCents - cart.data!.totals.discountCents;
                  const free = m.freeOverCents !== null && subtotalAfterDiscount >= m.freeOverCents;
                  return (
                    <label key={m.code} className={cn('card flex cursor-pointer items-center gap-3 p-4', shippingCode === m.code ? 'border-brand-500 ring-2 ring-brand-100' : 'hover:border-slate-300')}>
                      <input type="radio" name="shipping" className="h-4 w-4 accent-brand-600" checked={shippingCode === m.code} onChange={() => setShippingCode(m.code)} data-testid={`shipping-${m.code}`} />
                      <span className="flex-1">
                        <span className="block font-semibold">{m.name}</span>
                        <span className="block text-sm text-slate-500">
                          {m.description} · {m.minDays === m.maxDays ? `${m.minDays} día` : `${m.minDays}-${m.maxDays} días`}
                        </span>
                        {m.freeOverCents !== null && <span className="block text-xs text-slate-500">Gratis desde {formatPrice(m.freeOverCents)}</span>}
                      </span>
                      <span className="font-bold">{free || m.priceCents === 0 ? 'Gratis' : formatPrice(m.priceCents)}</span>
                    </label>
                  );
                })}
              </fieldset>
              {selectedMethod?.requiresPickupPoint && (
                <div className="space-y-2">
                  <label htmlFor="pickup-point" className="text-sm font-medium text-slate-700">
                    Punto de recogida <span className="text-rose-600">*</span>
                  </label>
                  <select id="pickup-point" value={pickupPointId ?? ''} onChange={(e) => setPickupPointId(e.target.value ? Number(e.target.value) : undefined)} className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm" data-testid="pickup-point-select">
                    <option value="">Selecciona un punto…</option>
                    {pickupPoints.data?.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.city} · {p.name} — {p.address}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          {step === 2 && <PaymentFields method={paymentMethod} onMethod={setPaymentMethod} card={card} onCard={setCard} errors={cardErrors} />}

          {step === 3 && (
            <div className="space-y-5" data-testid="checkout-review">
              <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                {cart.data.items.map((i) => (
                  <li key={i.id} className="flex items-center gap-3 p-3 text-sm" data-testid="review-item">
                    <ProductImage src={i.product.imageUrl} alt="" className="h-12 w-12 rounded-lg bg-slate-50" />
                    <span className="flex-1">
                      {i.quantity} × {i.product.name}
                    </span>
                    <span className="font-semibold">{formatPrice(i.lineTotalCents)}</span>
                  </li>
                ))}
              </ul>
              <div className="grid gap-4 text-sm sm:grid-cols-2">
                <div className="rounded-xl bg-slate-50 p-4">
                  <p className="mb-1 flex items-center gap-1.5 font-semibold"><MapPin className="h-4 w-4" /> Envío</p>
                  {address && (
                    <p className="text-slate-600">
                      {address.fullName}, {address.line1}, {address.postalCode} {address.city}
                    </p>
                  )}
                  <p className="text-slate-600">{selectedMethod?.name}{selectedMethod?.requiresPickupPoint && pickupPoints.data ? ` · ${pickupPoints.data.find((p) => p.id === pickupPointId)?.name ?? ''}` : ''}</p>
                </div>
                <div className="rounded-xl bg-slate-50 p-4">
                  <p className="mb-1 font-semibold">Pago</p>
                  <p className="text-slate-600">{paymentMethod === 'CARD' ? `Tarjeta terminada en ${card.number.replace(/\D/g, '').slice(-4)}` : 'Transferencia bancaria'}</p>
                </div>
              </div>
              <Textarea label="Notas para el pedido (opcional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
              {submitError && (
                <Alert tone="error" title="No se ha podido completar el pedido" testId="checkout-error">
                  {submitError}
                </Alert>
              )}
            </div>
          )}

          <div className="mt-6 flex justify-between gap-3 border-t border-slate-100 pt-5">
            {step > 0 ? (
              <Button variant="ghost" onClick={() => setStep((s) => s - 1)} disabled={placeOrder.isPending}>
                ← Volver
              </Button>
            ) : (
              <ButtonLink to="/carrito" variant="ghost">
                ← Carrito
              </ButtonLink>
            )}
            {step < 3 ? (
              <Button onClick={next} data-testid="checkout-next">
                Continuar
              </Button>
            ) : (
              <Button size="lg" onClick={() => placeOrder.mutate()} loading={placeOrder.isPending} disabled={!q || quote.isFetching} data-testid="place-order">
                {placeOrder.isPending ? 'Procesando…' : `Confirmar y pagar ${q ? formatPrice(q.totalCents) : ''}`}
              </Button>
            )}
          </div>
        </section>

        <aside className="card h-fit space-y-3 p-5 text-sm lg:sticky lg:top-40" data-testid="checkout-summary">
          <h2 className="text-base font-bold">Resumen del pedido</h2>
          {step >= 1 && quote.isLoading && <Skeleton className="h-24" />}
          {quote.isError && <Alert tone="error">{errorMessage(quote.error)}</Alert>}
          {(() => {
            const t = q ?? { subtotalCents: cart.data.totals.subtotalCents, discountCents: cart.data.totals.discountCents, shippingCents: undefined, totalCents: cart.data.totals.totalCents, taxCents: cart.data.totals.taxCents };
            return (
              <dl className="space-y-2">
                <div className="flex justify-between"><dt className="text-slate-600">Subtotal</dt><dd data-testid="checkout-subtotal">{formatPrice(t.subtotalCents)}</dd></div>
                {t.discountCents > 0 && <div className="flex justify-between text-emerald-700"><dt>Descuento</dt><dd data-testid="checkout-discount">−{formatPrice(t.discountCents)}</dd></div>}
                <div className="flex justify-between"><dt className="text-slate-600">Envío</dt><dd data-testid="checkout-shipping">{t.shippingCents === undefined ? 'Se calcula en el paso 2' : t.shippingCents === 0 ? 'Gratis' : formatPrice(t.shippingCents)}</dd></div>
                <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-extrabold"><dt>Total</dt><dd data-testid="checkout-total">{formatPrice(t.totalCents)}</dd></div>
                <p className="text-xs text-slate-500">IVA incluido ({formatPrice(t.taxCents)})</p>
              </dl>
            );
          })()}
          {q?.couponError && <Alert tone="warning">{q.couponError.message}</Alert>}
        </aside>
      </div>
    </div>
  );
}
