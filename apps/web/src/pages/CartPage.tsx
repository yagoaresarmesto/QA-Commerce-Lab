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
    <div className="space-y-5 rounded-4xl bg-slate-50 p-6 sm:p-7" data-testid="cart-summary">
      <h2 className="text-xl font-semibold tracking-tight">Resumen del pedido</h2>
      <dl className="space-y-3 text-sm">
        <div className="flex justify-between">
          <dt className="text-slate-600">Subtotal ({cart.itemsCount} {cart.itemsCount === 1 ? 'artículo' : 'artículos'})</dt>
          <dd className="font-semibold" data-testid="summary-subtotal">{formatPrice(t.subtotalCents)}</dd>
        </div>
        {t.discountCents > 0 && (
          <div className="flex justify-between font-medium text-emerald-700">
            <dt>Descuento {cart.coupon && `(${cart.coupon.code})`}</dt>
            <dd className="font-semibold" data-testid="summary-discount">−{formatPrice(t.discountCents)}</dd>
          </div>
        )}
        <div className="flex justify-between">
          <dt className="text-slate-600">Envío estándar estimado</dt>
          <dd className="font-semibold" data-testid="summary-shipping">{t.shippingEstimateCents === 0 ? 'Gratis' : formatPrice(t.shippingEstimateCents)}</dd>
        </div>
        <div className="flex items-baseline justify-between border-t border-slate-200 pt-4 text-base">
          <dt className="font-semibold">Total</dt>
          <dd className="text-3xl font-semibold tracking-tight" data-testid="summary-total">{formatPrice(t.totalCents)}</dd>
        </div>
        <p className="text-xs text-slate-500">IVA incluido ({formatPrice(t.taxCents)}). El coste final del envío depende del método elegido.</p>
      </dl>
      {t.amountToFreeShippingCents !== null && t.amountToFreeShippingCents > 0 && (
        <div className="space-y-2 rounded-2xl bg-white p-4 text-xs text-slate-700 ring-1 ring-slate-900/5" data-testid="free-shipping-progress">
          <p className="flex items-center gap-1.5 font-medium">
            <Truck className="h-4 w-4" /> Te faltan {formatPrice(t.amountToFreeShippingCents)} para el envío gratis
          </p>
          <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-accent-400" style={{ width: `${progress}%` }} />
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
        <div className="flex items-center justify-between rounded-full bg-accent-300 py-1.5 pl-4 pr-1.5 text-sm">
          <span className="flex items-center gap-2 font-semibold text-slate-950">
            <Tag className="h-4 w-4" /> {cart.coupon.code}
          </span>
          <button className="rounded-full p-1.5 text-slate-950 hover:bg-white/60" onClick={() => removeCoupon.mutate()} aria-label="Quitar cupón" data-testid="remove-coupon">
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
          className="h-11 min-w-0 flex-1 rounded-full border border-slate-200 bg-white px-4 text-sm uppercase tracking-wide placeholder:text-slate-400 focus:border-slate-950 focus:outline-none focus:ring-4 focus:ring-brand-100 disabled:bg-slate-100"
          data-testid="coupon-input"
          disabled={status !== 'authenticated'}
        />
        <Button type="submit" variant="outline" loading={applyCoupon.isPending} disabled={status !== 'authenticated'} data-testid="apply-coupon">
          Aplicar
        </Button>
      </div>
      {status !== 'authenticated' && (
        <p className="text-xs text-slate-500">
          <Link to="/login?redirect=/carrito" className="font-semibold text-slate-950 underline underline-offset-2">
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
      <div className="container-page grid gap-8 py-10 lg:grid-cols-[1fr_24rem]">
        <Skeleton className="h-72 rounded-4xl" />
        <Skeleton className="h-72 rounded-4xl" />
      </div>
    );
  }

  return (
    <div className="container-page py-8 sm:py-10">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1.5">
          <p className="eyebrow">Cesta de la compra</p>
          <h1 className="heading-xl">Tu carrito</h1>
        </div>
        {cart.items.length > 0 && (
          <p className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-600">
            {cart.itemsCount} {cart.itemsCount === 1 ? 'artículo' : 'artículos'}
          </p>
        )}
      </div>
      {cart.items.length === 0 ? (
        <EmptyState
          icon={<ShoppingBag className="h-8 w-8" />}
          title="Tu carrito está vacío"
          description="Explora el catálogo y añade los productos que te interesen."
          action={<ButtonLink to="/">Seguir comprando</ButtonLink>}
          testId="cart-empty"
        />
      ) : (
        <div className="grid gap-8 lg:grid-cols-[1fr_24rem] xl:gap-12">
          <section aria-label="Productos del carrito" className="space-y-5">
            {cart.hasIssues && (
              <Alert tone="warning" title="Revisa tu carrito" testId="cart-issues-alert">
                Algunos productos no están disponibles en la cantidad solicitada. Ajústalos para poder finalizar la compra.
              </Alert>
            )}
            <ul className="divide-y divide-slate-200/80 border-y border-slate-200/80" data-testid="cart-items">
              {cart.items.map((item) => {
                const blocked = item.issues.some((i) => i.code === 'UNAVAILABLE' || i.code === 'OUT_OF_STOCK');
                return (
                  <li key={item.id} className="flex gap-4 py-6 sm:gap-6" data-testid="cart-item" data-product-id={item.productId} data-sku={item.product.sku}>
                    <Link to={`/producto/${item.product.slug}`} className="tile shrink-0 rounded-3xl p-3">
                      <ProductImage src={item.product.imageUrl} alt={item.product.name} className="h-20 w-20 sm:h-28 sm:w-28" />
                    </Link>
                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                      <div className="flex justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-slate-500">{item.product.brandName}</p>
                          <Link to={`/producto/${item.product.slug}`} className="line-clamp-2 font-medium tracking-tight text-slate-950 hover:underline sm:text-lg" data-testid="cart-item-name">
                            {item.product.name}
                          </Link>
                          <p className="text-sm text-slate-500">
                            {formatPrice(item.unitPriceCents)} / unidad
                          </p>
                        </div>
                        <p className="shrink-0 text-lg font-semibold tracking-tight" data-testid="cart-item-total">
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
                          className="flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium text-slate-500 transition hover:bg-rose-50 hover:text-rose-700"
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
