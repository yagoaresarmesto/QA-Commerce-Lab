import { Heart, ShoppingCart } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { useAuth } from '../../auth/AuthProvider';
import { errorMessage } from '../../lib/api';
import { cn } from '../../lib/cn';
import { useCartMutations, useFavorites, useFavoriteToggle } from '../../lib/queries';
import type { ProductSummary } from '../../lib/types';
import { AvailabilityLabel, Price, Rating } from '../ui/Commerce';
import { Badge, Skeleton } from '../ui/Feedback';

export function ProductImage({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  return failed ? (
    <div className={cn('flex items-center justify-center bg-slate-100 text-xs text-slate-400', className)}>Sin imagen</div>
  ) : (
    <img src={src} alt={alt} loading="lazy" decoding="async" onError={() => setFailed(true)} className={cn('object-contain', className)} />
  );
}

export function FavoriteButton({ productId, className, size = 'md' }: { productId: number; className?: string; size?: 'sm' | 'md' }) {
  const { status } = useAuth();
  const navigate = useNavigate();
  const favorites = useFavorites();
  const toggle = useFavoriteToggle();
  const isFavorite = !!favorites.data?.some((f) => f.productId === productId);
  return (
    <button
      type="button"
      className={cn(
        'flex items-center justify-center rounded-full border bg-white/90 backdrop-blur transition hover:scale-105',
        isFavorite ? 'border-rose-200 text-rose-600' : 'border-slate-200 text-slate-500 hover:text-rose-600',
        size === 'sm' ? 'h-9 w-9' : 'h-11 w-11',
        className,
      )}
      aria-pressed={isFavorite}
      aria-label={isFavorite ? 'Quitar de favoritos' : 'Añadir a favoritos'}
      data-testid="favorite-toggle"
      disabled={toggle.isPending}
      onClick={(e) => {
        e.preventDefault();
        if (status !== 'authenticated') {
          toast.info('Inicia sesión para guardar favoritos');
          navigate(`/login?redirect=${encodeURIComponent(window.location.pathname)}`);
          return;
        }
        toggle.mutate({ productId, isFavorite });
      }}
    >
      <Heart className={cn('h-5 w-5', isFavorite && 'fill-current')} />
    </button>
  );
}

export function ProductCard({ product }: { product: ProductSummary }) {
  const { add } = useCartMutations();
  const purchasable = product.availability === 'IN_STOCK' || product.availability === 'LOW_STOCK';
  return (
    <article
      className="group card relative flex h-full flex-col overflow-hidden transition hover:-translate-y-0.5 hover:shadow-pop"
      data-testid="product-card"
      data-product-id={product.id}
      data-sku={product.sku}
      aria-labelledby={`product-${product.id}-name`}
    >
      <div className="absolute left-3 top-3 z-10 flex flex-col gap-1.5">
        {product.discountPercent > 0 && (
          <Badge tone="red" testId="discount-badge">
            -{product.discountPercent}%
          </Badge>
        )}
        {product.isNew && <Badge tone="sky">Novedad</Badge>}
      </div>
      <FavoriteButton productId={product.id} size="sm" className="absolute right-3 top-3 z-10" />
      <Link to={`/producto/${product.slug}`} className="block bg-gradient-to-b from-slate-50 to-white p-4" tabIndex={-1} aria-hidden="true">
        <ProductImage src={product.imageUrl} alt="" className="mx-auto aspect-square w-full max-w-56 transition group-hover:scale-[1.03]" />
      </Link>
      <div className="flex flex-1 flex-col gap-2 p-4 pt-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">{product.brand.name}</p>
        <h3 id={`product-${product.id}-name`} className="line-clamp-2 min-h-10 text-sm font-semibold leading-5 text-slate-900">
          <Link to={`/producto/${product.slug}`} className="after:absolute after:inset-0 after:z-0 hover:text-brand-700" data-testid="product-card-link">
            {product.name}
          </Link>
        </h3>
        <Rating value={product.ratingAvg} count={product.ratingCount} />
        <div className="mt-auto space-y-2 pt-1">
          <Price cents={product.priceCents} compareAt={product.compareAtPriceCents} />
          <div className="flex items-center justify-between gap-2">
            <AvailabilityLabel availability={product.availability} stock={product.stock} className="text-xs" />
            <button
              type="button"
              className="relative z-10 inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-600 px-3 text-xs font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              disabled={!purchasable || add.isPending}
              aria-label={`Añadir ${product.name} al carrito`}
              data-testid="add-to-cart"
              onClick={() =>
                add.mutate(
                  { productId: product.id, quantity: 1 },
                  {
                    onSuccess: () => toast.success('Producto añadido al carrito', { description: product.name }),
                    onError: (e) => toast.error(errorMessage(e)),
                  },
                )
              }
            >
              <ShoppingCart className="h-4 w-4" />
              Añadir
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

export function ProductCardSkeleton() {
  return (
    <div className="card overflow-hidden p-4" data-testid="product-card-skeleton">
      <Skeleton className="mx-auto aspect-square w-full" />
      <Skeleton className="mt-4 h-3 w-16" />
      <Skeleton className="mt-2 h-4 w-full" />
      <Skeleton className="mt-1 h-4 w-2/3" />
      <Skeleton className="mt-4 h-6 w-24" />
    </div>
  );
}

export function ProductGrid({ products, loading, skeletons = 8 }: { products?: ProductSummary[]; loading?: boolean; skeletons?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4" data-testid="product-grid">
      {loading
        ? Array.from({ length: skeletons }, (_, i) => <ProductCardSkeleton key={i} />)
        : products?.map((p) => <ProductCard key={p.id} product={p} />)}
    </div>
  );
}

export function ProductRail({ title, products, loading, href, testId }: { title: string; products?: ProductSummary[]; loading?: boolean; href?: string; testId: string }) {
  return (
    <section aria-labelledby={`${testId}-title`} className="space-y-4" data-testid={testId}>
      <div className="flex items-end justify-between gap-4">
        <h2 id={`${testId}-title`} className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
          {title}
        </h2>
        {href && (
          <Link to={href} className="text-sm font-semibold text-brand-700 hover:text-brand-800">
            Ver todo
          </Link>
        )}
      </div>
      <div className="scrollbar-none -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 sm:gap-4">
        {(loading ? Array.from({ length: 5 }) : (products ?? [])).map((p, i) => (
          <div key={loading ? i : (p as ProductSummary).id} className="w-[46%] shrink-0 snap-start sm:w-[31%] lg:w-[23.5%]">
            {loading ? <ProductCardSkeleton /> : <ProductCard product={p as ProductSummary} />}
          </div>
        ))}
      </div>
    </section>
  );
}
