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

const STEPS = ['Address', 'Shipping', 'Payment', 'Review'] as const;

function Stepper({ step, onStep }: { step: number; onStep: (s: number) => void }) {
  return (
    <ol className="mb-10 flex items-center gap-2 rounded-full bg-slate-50 p-1.5" aria-label="Checkout steps" data-testid="checkout-steps">
      {STEPS.map((label, i) => {
        const done = i < step;
        return (
          <li key={label} className="flex flex-1 items-center gap-2">
            <button
              type="button"
              disabled={i > step}
              onClick={() => onStep(i)}
              aria-current={i === step ? 'step' : undefined}
              className={cn('flex items-center gap-2 rounded-full py-1 pl-1 pr-3 text-sm font-medium transition', i === step ? 'bg-white text-slate-950 shadow-card' : done ? 'text-slate-700 hover:bg-white/60' : 'text-slate-400')}
              data-testid={`checkout-step-${i + 1}`}
            >
              <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold', i === step ? 'bg-slate-950 text-white' : done ? 'bg-accent-400 text-slate-950' : 'bg-slate-200 text-slate-500')}>
                {done ? <Check className="h-4 w-4" /> : i + 1}
              </span>
              <span className="hidden sm:inline">{label}</span>
            </button>
            {i < STEPS.length - 1 && <span className={cn('h-px flex-1', done ? 'bg-slate-950' : 'bg-slate-200')} aria-hidden="true" />}
          </li>
        );
      })}
    </ol>
  );
}

export function CheckoutPage() {
  useDocumentTitle('Checkout');
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
    enabled: !!addressId && step >= 1 && (cart.data?.items.length ?? 0) > 0 && (!selectedMethod?.requiresPickupPoint || !!pickupPointId),
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
      navigate(`/checkout/result/${res.order.id}`, { replace: true });
    },
    onError: (e) => {
      if (!(e instanceof ApiError)) return setSubmitError(errorMessage(e));
      const details = e.details as { orderId?: number } | undefined;
      if ((e.status === 502 || e.status === 504) && details?.orderId) {
        void qc.invalidateQueries({ queryKey: ['cart'] });
        toast.error(e.message);
        return navigate(`/checkout/result/${details.orderId}`, { replace: true, state: { gatewayError: e.message } });
      }
      if (e.code === 'PRICE_CHANGED') {
        void quote.refetch();
        return setSubmitError('The order total has changed. Review the updated summary and confirm again.');
      }
      if (['CART_HAS_ISSUES', 'CART_EMPTY', 'INSUFFICIENT_STOCK'].includes(e.code)) {
        toast.error(e.message);
        void qc.invalidateQueries({ queryKey: ['cart'] });
        return navigate('/cart');
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
      <div className="container-page py-10">
        <Skeleton className="h-96 rounded-4xl" />
      </div>
    );
  }
  if (!cart.data || cart.data.items.length === 0) {
    return (
      <div className="container-page py-8">
        <EmptyState title="Nothing to pay for" description="Your cart is empty." action={<ButtonLink to="/">Go to the store</ButtonLink>} testId="checkout-empty" />
      </div>
    );
  }
  if (cart.data.hasIssues) {
    return (
      <div className="container-page py-8">
        <Alert tone="warning" title="Your cart needs changes" testId="checkout-cart-issues">
          Some products are unavailable or do not have enough stock. <ButtonLink to="/cart" variant="outline" size="sm" className="ml-2">Review cart</ButtonLink>
        </Alert>
      </div>
    );
  }

  const next = () => {
    setSubmitError(undefined);
    if (step === 0 && !addressId) return toast.error('Select or add a shipping address');
    if (step === 1 && selectedMethod?.requiresPickupPoint && !pickupPointId) return toast.error('Select a pickup point');
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
    <div className="container-page max-w-6xl py-8 sm:py-10">
      <div className="mb-8 space-y-1.5">
        <p className="eyebrow">Simulated secure payment</p>
        <h1 className="heading-xl">Checkout</h1>
      </div>
      <Stepper step={step} onStep={(s) => s <= step && setStep(s)} />
      <div className="grid gap-8 lg:grid-cols-[1fr_22rem] xl:gap-12">
        <section aria-labelledby="step-title">
          <h2 id="step-title" className="mb-6 text-2xl font-semibold tracking-tight">
            {step + 1}. {STEPS[step] === 'Address' ? 'Shipping address' : STEPS[step] === 'Shipping' ? 'Shipping method' : STEPS[step] === 'Payment' ? 'Payment method' : 'Review and confirm your order'}
          </h2>

          {step === 0 && (
            <div className="space-y-4">
              {addresses.data && addresses.data.length > 0 && !addingAddress && (
                <fieldset className="grid gap-3 sm:grid-cols-2" data-testid="address-options">
                  <legend className="sr-only">Select an address</legend>
                  {addresses.data.map((a) => (
                    <label key={a.id} className="choice" data-testid="address-option">
                      <input type="radio" name="address" className="mt-1 h-4 w-4 accent-slate-950" checked={addressId === a.id} onChange={() => setAddressId(a.id)} />
                      <span className="text-sm">
                        <span className="block font-semibold">
                          {a.label ?? 'Address'} {a.isDefault && <span className="ml-1 rounded-full bg-accent-300 px-2 py-0.5 text-[11px] font-semibold text-slate-950">default</span>}
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
                  Add a new address
                </Button>
              )}
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <fieldset className="space-y-3" data-testid="shipping-options">
                <legend className="sr-only">Select a shipping method</legend>
                {methods.data?.map((m) => {
                  const subtotalAfterDiscount = cart.data!.totals.subtotalCents - cart.data!.totals.discountCents;
                  const free = m.freeOverCents !== null && subtotalAfterDiscount >= m.freeOverCents;
                  return (
                    <label key={m.code} className="choice items-center">
                      <input type="radio" name="shipping" className="h-4 w-4 accent-slate-950" checked={shippingCode === m.code} onChange={() => setShippingCode(m.code)} data-testid={`shipping-${m.code}`} />
                      <span className="flex-1">
                        <span className="block font-semibold">{m.name}</span>
                        <span className="block text-sm text-slate-500">
                          {m.description} · {m.minDays === m.maxDays ? `${m.minDays} day` : `${m.minDays}-${m.maxDays} days`}
                        </span>
                        {m.freeOverCents !== null && <span className="block text-xs text-slate-500">Free over {formatPrice(m.freeOverCents)}</span>}
                      </span>
                      <span className="font-semibold">{free || m.priceCents === 0 ? 'Free' : formatPrice(m.priceCents)}</span>
                    </label>
                  );
                })}
              </fieldset>
              {selectedMethod?.requiresPickupPoint && (
                <div className="space-y-2">
                  <label htmlFor="pickup-point" className="text-sm font-medium text-slate-700">
                    Pickup point <span className="text-rose-600">*</span>
                  </label>
                  <select id="pickup-point" value={pickupPointId ?? ''} onChange={(e) => setPickupPointId(e.target.value ? Number(e.target.value) : undefined)} className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm focus:border-slate-950 focus:outline-none focus:ring-4 focus:ring-brand-100" data-testid="pickup-point-select">
                    <option value="">Select a point…</option>
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
              <ul className="divide-y divide-slate-200/80 rounded-3xl border border-slate-200/80">
                {cart.data.items.map((i) => (
                  <li key={i.id} className="flex items-center gap-4 p-4 text-sm" data-testid="review-item">
                    <span className="tile shrink-0 rounded-2xl p-1.5">
                      <ProductImage src={i.product.imageUrl} alt="" className="h-12 w-12" />
                    </span>
                    <span className="flex-1">
                      {i.quantity} × {i.product.name}
                    </span>
                    <span className="font-semibold">{formatPrice(i.lineTotalCents)}</span>
                  </li>
                ))}
              </ul>
              <div className="grid gap-4 text-sm sm:grid-cols-2">
                <div className="rounded-3xl bg-slate-50 p-5">
                  <p className="mb-1 flex items-center gap-1.5 font-semibold"><MapPin className="h-4 w-4" /> Shipping</p>
                  {address && (
                    <p className="text-slate-600">
                      {address.fullName}, {address.line1}, {address.postalCode} {address.city}
                    </p>
                  )}
                  <p className="text-slate-600">{selectedMethod?.name}{selectedMethod?.requiresPickupPoint && pickupPoints.data ? ` · ${pickupPoints.data.find((p) => p.id === pickupPointId)?.name ?? ''}` : ''}</p>
                </div>
                <div className="rounded-3xl bg-slate-50 p-5">
                  <p className="mb-1 font-semibold">Payment</p>
                  <p className="text-slate-600">{paymentMethod === 'CARD' ? `Card ending in ${card.number.replace(/\D/g, '').slice(-4)}` : 'Bank transfer'}</p>
                </div>
              </div>
              <Textarea label="Order notes (optional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
              {submitError && (
                <Alert tone="error" title="The order could not be completed" testId="checkout-error">
                  {submitError}
                </Alert>
              )}
            </div>
          )}

          <div className="mt-8 flex justify-between gap-3 border-t border-slate-200/80 pt-6">
            {step > 0 ? (
              <Button variant="ghost" onClick={() => setStep((s) => s - 1)} disabled={placeOrder.isPending}>
                ← Back
              </Button>
            ) : (
              <ButtonLink to="/cart" variant="ghost">
                ← Cart
              </ButtonLink>
            )}
            {step < 3 ? (
              <Button size="lg" onClick={next} data-testid="checkout-next">
                Continue
              </Button>
            ) : (
              <Button size="lg" onClick={() => placeOrder.mutate()} loading={placeOrder.isPending} disabled={!q || quote.isFetching} data-testid="place-order">
                {placeOrder.isPending ? 'Processing…' : `Confirm and pay ${q ? formatPrice(q.totalCents) : ''}`}
              </Button>
            )}
          </div>
        </section>

        <aside className="panel h-fit space-y-4 text-sm lg:sticky lg:top-40" data-testid="checkout-summary">
          <h2 className="text-xl font-semibold tracking-tight">Order summary</h2>
          <ul className="space-y-3 border-b border-slate-200 pb-4" aria-label="Products">
            {cart.data.items.map((i) => (
              <li key={i.id} className="flex items-center gap-3">
                <span className="relative shrink-0 rounded-2xl bg-white p-1 ring-1 ring-slate-900/5">
                  <ProductImage src={i.product.imageUrl} alt="" className="h-10 w-10" />
                  <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-slate-950 px-1 text-[10px] font-semibold text-white">{i.quantity}</span>
                </span>
                <span className="line-clamp-2 flex-1 text-xs text-slate-700">{i.product.name}</span>
                <span className="text-xs font-medium">{formatPrice(i.lineTotalCents)}</span>
              </li>
            ))}
          </ul>
          {step >= 1 && quote.isLoading && <Skeleton className="h-24" />}
          {quote.isError && <Alert tone="error">{errorMessage(quote.error)}</Alert>}
          {(() => {
            const t = q ?? { subtotalCents: cart.data.totals.subtotalCents, discountCents: cart.data.totals.discountCents, shippingCents: undefined, totalCents: cart.data.totals.totalCents, taxCents: cart.data.totals.taxCents };
            return (
              <dl className="space-y-2.5">
                <div className="flex justify-between"><dt className="text-slate-600">Subtotal</dt><dd data-testid="checkout-subtotal">{formatPrice(t.subtotalCents)}</dd></div>
                {t.discountCents > 0 && <div className="flex justify-between text-emerald-700"><dt>Discount</dt><dd data-testid="checkout-discount">−{formatPrice(t.discountCents)}</dd></div>}
                <div className="flex justify-between"><dt className="text-slate-600">Shipping</dt><dd data-testid="checkout-shipping">{t.shippingCents === undefined ? 'Calculated in step 2' : t.shippingCents === 0 ? 'Free' : formatPrice(t.shippingCents)}</dd></div>
                <div className="flex items-baseline justify-between border-t border-slate-200 pt-3 text-base font-semibold"><dt>Total</dt><dd className="text-2xl tracking-tight" data-testid="checkout-total">{formatPrice(t.totalCents)}</dd></div>
                <p className="text-xs text-slate-500">VAT included ({formatPrice(t.taxCents)})</p>
              </dl>
            );
          })()}
          {q?.couponError && <Alert tone="warning">{q.couponError.message}</Alert>}
        </aside>
      </div>
    </div>
  );
}
