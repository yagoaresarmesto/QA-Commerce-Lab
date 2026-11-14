import { AlertTriangle, ShoppingBag, Tag, Trash2, Truck, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { useAuth } from '../auth/AuthProvider';
import { ProductImage } from '../components/product/ProductCard';
import { Button, ButtonLink } from '../components/ui/Button';
import { QuantityStepper } from '../components/ui/Commerce';
import { Alert, EmptyState, ErrorState, Skeleton } from '../components/ui/Feedback';
import { ConfirmDialog } from '../components/ui/Modal';
import { errorMessage } from '../lib/api';
import { formatPrice } from '../lib/format';
import { useCart, useCartMutations } from '../lib/queries';
import type { Cart } from '../lib/types';
import { useDocumentTitle } from './useDocumentTitle';

export function CartSummary({ cart, children }: { cart: Cart; children?: React.ReactNode }) {
  const t = cart.totals;
  const progress = t.freeShippingThresholdCents ? Math.min(100, Math.round(((t.subtotalCents - t.discountCents) / t.freeShippingThresholdCents) * 100)) : 100;
  return (
    <div className="card space-y-4 p-5" data-testid="cart-summary">
      <h2 className="text-lg font-bold">Resumen</h2>
      <dl className="space-y-2 text-sm">
        <div className="flex justify-between">
          <dt className="text-slate-600">Subtotal ({cart.itemsCount} {cart.itemsCount === 1 ? 'artículo' : 'artículos'})</dt>
          <dd className="font-semibold" data-testid="summary-subtotal">{formatPrice(t.subtotalCents)}</dd>
        </div>
        {t.discountCents > 0 && (
          <div className="flex justify-between text-emerald-700">
            <dt>Descuento {cart.coupon && `(${cart.coupon.code})`}</dt>
            <dd className="font-semibold" data-testid="summary-discount">−{formatPrice(t.discountCents)}</dd>
          </div>
        )}
        <div className="flex justify-between">
          <dt className="text-slate-600">Envío estándar estimado</dt>
          <dd className="font-semibold" data-testid="summary-shipping">{t.shippingEstimateCents === 0 ? 'Gratis' : formatPrice(t.shippingEstimateCents)}</dd>
        </div>
        <div className="flex items-baseline justify-between border-t border-slate-200 pt-3 text-base">
          <dt className="font-bold">Total</dt>
          <dd className="text-xl font-extrabold" data-testid="summary-total">{formatPrice(t.totalCents)}</dd>
        </div>
        <p className="text-xs text-slate-500">IVA incluido ({formatPrice(t.taxCents)}). El coste final del envío depende del método elegido.</p>
      </dl>
      {t.amountToFreeShippingCents !== null && t.amountToFreeShippingCents > 0 && (
        <div className="space-y-1.5 rounded-xl bg-brand-50 p-3 text-xs text-brand-900" data-testid="free-shipping-progress">
          <p className="flex items-center gap-1.5 font-medium">
            <Truck className="h-4 w-4" /> Te faltan {formatPrice(t.amountToFreeShippingCents)} para el envío gratis
          </p>
          <div className="h-1.5 overflow-hidden rounded-full bg-white">
            <div className="h-full rounded-full bg-brand-600" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}
      {children}
    </div>
  );
}

function CouponBox({ cart }: { cart: Cart }) {
  const { status } = useAuth();
  const { applyCoupon, removeCoupon } = useCartMutations();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string>();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return setError('Introduce un código');
    applyCoupon.mutate(code.trim(), {
      onSuccess: () => {
        toast.success('Cupón aplicado');
        setCode('');
        setError(undefined);
      },
      onError: (err) => setError(errorMessage(err)),
    });
  };
  if (cart.coupon) {
    return (
      <div className="space-y-2" data-testid="applied-coupon">
        <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm">
          <span className="flex items-center gap-2 font-semibold text-emerald-800">
            <Tag className="h-4 w-4" /> {cart.coupon.code}
          </span>
          <button className="rounded p-1 text-emerald-800 hover:bg-emerald-100" onClick={() => removeCoupon.mutate()} aria-label="Quitar cupón" data-testid="remove-coupon">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-xs text-slate-500">{cart.coupon.description}</p>
        {cart.couponError && (
          <Alert tone="warning" testId="coupon-error">
            {cart.couponError.message}. El descuento no se está aplicando.
          </Alert>
        )}
      </div>
    );
  }
  return (
    <form onSubmit={submit} className="space-y-2" aria-label="Aplicar cupón" noValidate>
      <label htmlFor="coupon-code" className="text-sm font-medium text-slate-700">
        ¿Tienes un cupón?
      </label>
      <div className="flex gap-2">
        <input
          id="coupon-code"
          value={code}
          onChange={(e) => {
            setCode(e.target.value.toUpperCase());
            setError(undefined);
          }}
          placeholder="CÓDIGO"
          maxLength={40}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'coupon-code-error' : undefined}
          className="h-10 min-w-0 flex-1 rounded-xl border border-slate-300 px-3 text-sm uppercase"
          data-testid="coupon-input"
          disabled={status !== 'authenticated'}
        />
        <Button type="submit" variant="outline" loading={applyCoupon.isPending} disabled={status !== 'authenticated'} data-testid="apply-coupon">
          Aplicar
        </Button>
      </div>
      {status !== 'authenticated' && (
        <p className="text-xs text-slate-500">
          <Link to="/login?redirect=/carrito" className="font-semibold text-brand-700">
            Inicia sesión
          </Link>{' '}
          para usar cupones.
        </p>
      )}
      {error && (
        <p id="coupon-code-error" className="text-xs font-medium text-rose-600" role="alert" data-testid="coupon-error">
          {error}
        </p>
      )}
    </form>
  );
}

export function CartPage() {
  useDocumentTitle('Carrito');
  const navigate = useNavigate();
  const { status } = useAuth();
  const { data: cart, isLoading, isError, refetch } = useCart();
  const { update, remove, clear } = useCartMutations();
  const [confirmClear, setConfirmClear] = useState(false);

  if (isError) return <div className="container-page py-10"><ErrorState onRetry={() => refetch()} /></div>;
  if (isLoading || !cart) {
    return (
      <div className="container-page grid gap-6 py-8 lg:grid-cols-[1fr_22rem]">
        <Skeleton className="h-72" />
        <Skeleton className="h-72" />
      </div>
    );
  }

  return (
    <div className="container-page py-8">
      <h1 className="mb-6 text-2xl font-extrabold tracking-tight sm:text-3xl">Tu carrito</h1>
      {cart.items.length === 0 ? (
        <EmptyState
          icon={<ShoppingBag className="h-8 w-8" />}
          title="Tu carrito está vacío"
          description="Explora el catálogo y añade los productos que te interesen."
          action={<ButtonLink to="/">Seguir comprando</ButtonLink>}
          testId="cart-empty"
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
          <section aria-label="Productos del carrito" className="space-y-4">
            {cart.hasIssues && (
              <Alert tone="warning" title="Revisa tu carrito" testId="cart-issues-alert">
                Algunos productos no están disponibles en la cantidad solicitada. Ajústalos para poder finalizar la compra.
              </Alert>
            )}
            <ul className="card divide-y divide-slate-100" data-testid="cart-items">
              {cart.items.map((item) => {
                const blocked = item.issues.some((i) => i.code === 'UNAVAILABLE' || i.code === 'OUT_OF_STOCK');
                return (
                  <li key={item.id} className="flex gap-4 p-4" data-testid="cart-item" data-product-id={item.productId} data-sku={item.product.sku}>
                    <Link to={`/producto/${item.product.slug}`} className="shrink-0 rounded-xl bg-slate-50 p-2">
                      <ProductImage src={item.product.imageUrl} alt={item.product.name} className="h-20 w-20" />
                    </Link>
                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                      <div className="flex justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold uppercase text-brand-700">{item.product.brandName}</p>
                          <Link to={`/producto/${item.product.slug}`} className="line-clamp-2 font-semibold hover:text-brand-700" data-testid="cart-item-name">
                            {item.product.name}
                          </Link>
                          <p className="text-sm text-slate-500">
                            {formatPrice(item.unitPriceCents)} / unidad
                          </p>
                        </div>
                        <p className="shrink-0 font-bold" data-testid="cart-item-total">
                          {formatPrice(item.lineTotalCents)}
                        </p>
                      </div>
                      {item.priceChanged && item.previousUnitPriceCents !== null && (
                        <p className="text-xs font-medium text-amber-700" data-testid="price-changed">
                          El precio ha cambiado desde que lo añadiste (antes {formatPrice(item.previousUnitPriceCents)}).
                        </p>
                      )}
                      {item.issues.map((issue) => (
                        <p key={issue.code} className="flex items-center gap-1.5 text-xs font-semibold text-rose-700" data-testid="cart-item-issue" data-issue={issue.code}>
                          <AlertTriangle className="h-3.5 w-3.5" /> {issue.message}
                        </p>
                      ))}
                      <div className="mt-auto flex items-center justify-between gap-3">
                        {blocked ? (
                          <span className="text-sm text-slate-500">Cantidad: {item.quantity}</span>
                        ) : (
                          <QuantityStepper
                            value={item.quantity}
                            max={Math.min(10, Math.max(item.product.stock, 1))}
                            disabled={update.isPending}
                            onChange={(quantity) => update.mutate({ itemId: item.id, quantity })}
                            label={`Cantidad de ${item.product.name}`}
                            testId="cart-item-quantity"
                          />
                        )}
                        <button
                          className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-slate-600 hover:bg-rose-50 hover:text-rose-700"
                          onClick={() => remove.mutate(item.id, { onSuccess: () => toast.success('Producto eliminado del carrito') })}
                          aria-label={`Eliminar ${item.product.name} del carrito`}
                          data-testid="cart-item-remove"
                        >
                          <Trash2 className="h-4 w-4" /> Eliminar
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="flex justify-between">
              <ButtonLink to="/" variant="ghost">
                ← Seguir comprando
              </ButtonLink>
              <Button variant="ghost" className="text-rose-600" onClick={() => setConfirmClear(true)} data-testid="clear-cart">
                Vaciar carrito
              </Button>
            </div>
          </section>
          <aside className="space-y-4 lg:sticky lg:top-40 lg:h-fit">
            <CartSummary cart={cart}>
              <CouponBox cart={cart} />
              <Button
                size="lg"
                className="w-full"
                disabled={cart.hasIssues}
                onClick={() => navigate(status === 'authenticated' ? '/checkout' : '/login?redirect=/checkout')}
                data-testid="checkout-button"
              >
                Tramitar pedido
              </Button>
              {status !== 'authenticated' && <p className="text-center text-xs text-slate-500">Necesitarás iniciar sesión o crear una cuenta.</p>}
            </CartSummary>
          </aside>
        </div>
      )}
      <ConfirmDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title="¿Vaciar el carrito?"
        description="Se eliminarán todos los productos y el cupón aplicado."
        confirmLabel="Vaciar carrito"
        loading={clear.isPending}
        onConfirm={() => clear.mutate(undefined, { onSuccess: () => setConfirmClear(false), onError: (e) => toast.error(errorMessage(e)) })}
      />
    </div>
  );
}
