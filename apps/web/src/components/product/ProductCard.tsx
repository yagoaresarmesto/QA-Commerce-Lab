import { ArrowRight, ChevronLeft, ChevronRight, Heart, Plus } from 'lucide-react';
import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { useAuth } from '../../auth/AuthProvider';
import { errorMessage } from '../../lib/api';
import { cn } from '../../lib/cn';
import { useCartMutations, useFavorites, useFavoriteToggle } from '../../lib/queries';
import type { ProductSummary } from '../../lib/types';
import { AvailabilityLabel, Price, Rating } from '../ui/Commerce';
import { Badge, Skeleton } from '../ui/Feedback';
import { Spinner } from '../ui/Spinner';

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
        'flex items-center justify-center rounded-full bg-white/90 shadow-card ring-1 ring-slate-900/5 backdrop-blur transition hover:scale-105',
        isFavorite ? 'text-rose-600' : 'text-slate-500 hover:text-rose-600',
        size === 'sm' ? 'h-9 w-9' : 'h-12 w-12',
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
      <Heart className={cn('h-[18px] w-[18px]', isFavorite && 'fill-current')} />
    </button>
  );
}

export function ProductCard({ product }: { product: ProductSummary }) {
  const { add } = useCartMutations();
  const purchasable = product.availability === 'IN_STOCK' || product.availability === 'LOW_STOCK';
  return (
    <article
      className="group relative flex h-full flex-col"
      data-testid="product-card"
      data-product-id={product.id}
      data-sku={product.sku}
      aria-labelledby={`product-${product.id}-name`}
    >
      <div className="tile relative aspect-square overflow-hidden rounded-3xl">
        <div className="absolute left-3 top-3 z-10 flex flex-col items-start gap-1.5">
          {product.discountPercent > 0 && (
            <Badge tone="dark" testId="discount-badge">
              -{product.discountPercent}%
            </Badge>
          )}
          {product.isNew && <Badge tone="lime">Novedad</Badge>}
        </div>
        <FavoriteButton productId={product.id} size="sm" className="absolute right-3 top-3 z-10" />
        <Link to={`/producto/${product.slug}`} className="block h-full p-6" tabIndex={-1} aria-hidden="true">
          <ProductImage src={product.imageUrl} alt="" className="h-full w-full transition duration-500 ease-out group-hover:scale-[1.06]" />
        </Link>
        <button
          type="button"
          className="absolute bottom-3 right-3 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-slate-950 text-white shadow-soft transition hover:scale-105 hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none"
          disabled={!purchasable || add.isPending}
          aria-label={`Añadir ${product.name} al carrito`}
          title={purchasable ? 'Añadir al carrito' : 'No disponible'}
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
          {add.isPending ? <Spinner className="h-4 w-4" /> : <Plus className="h-5 w-5" />}
        </button>
      </div>
      <div className="flex flex-1 flex-col gap-1.5 px-1 pt-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium text-slate-500">{product.brand.name}</p>
          <Rating value={product.ratingAvg} count={product.ratingCount} />
        </div>
        <h3 id={`product-${product.id}-name`} className="line-clamp-2 min-h-10 text-[15px] font-medium leading-5 tracking-tight text-slate-950">
          <Link to={`/producto/${product.slug}`} className="after:absolute after:inset-0 after:z-0" data-testid="product-card-link">
            {product.name}
          </Link>
        </h3>
        <div className="mt-auto flex items-end justify-between gap-2 pt-1">
          <Price cents={product.priceCents} compareAt={product.compareAtPriceCents} />
          <AvailabilityLabel availability={product.availability} stock={product.stock} className="pb-1 text-xs" compact />
        </div>
      </div>
    </article>
  );
}

export function ProductCardSkeleton() {
  return (
    <div data-testid="product-card-skeleton">
      <Skeleton className="aspect-square w-full rounded-3xl" />
      <Skeleton className="mt-4 h-3 w-16" />
      <Skeleton className="mt-2 h-4 w-full" />
      <Skeleton className="mt-1 h-4 w-2/3" />
      <Skeleton className="mt-4 h-6 w-24" />
    </div>
  );
}

export function ProductGrid({ products, loading, skeletons = 8 }: { products?: ProductSummary[]; loading?: boolean; skeletons?: number }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-10 sm:gap-x-6 md:grid-cols-3 xl:grid-cols-4" data-testid="product-grid">
      {loading
        ? Array.from({ length: skeletons }, (_, i) => <ProductCardSkeleton key={i} />)
        : products?.map((p) => <ProductCard key={p.id} product={p} />)}
    </div>
  );
}

export function ProductRail({
  title,
  eyebrow,
  products,
  loading,
  href,
  testId,
}: {
  title: string;
  eyebrow?: string;
  products?: ProductSummary[];
  loading?: boolean;
  href?: string;
  testId: string;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const scroll = (dir: 1 | -1) => scroller.current?.scrollBy({ left: dir * scroller.current.clientWidth * 0.9, behavior: 'smooth' });
  return (
    <section aria-labelledby={`${testId}-title`} className="space-y-6" data-testid={testId}>
      <div className="flex items-end justify-between gap-4">
        <div className="space-y-1.5">
          {eyebrow && <p className="eyebrow">{eyebrow}</p>}
          <h2 id={`${testId}-title`} className="heading-lg">
            {title}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          {href && (
            <Link to={href} className="group mr-2 hidden items-center gap-1 text-sm font-semibold text-slate-950 sm:flex">
              Ver todo <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
            </Link>
          )}
          <button type="button" onClick={() => scroll(-1)} className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-700 transition hover:bg-slate-950 hover:text-white" aria-label={`Desplazar ${title} a la izquierda`}>
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button type="button" onClick={() => scroll(1)} className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-700 transition hover:bg-slate-950 hover:text-white" aria-label={`Desplazar ${title} a la derecha`}>
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>
      <div ref={scroller} className="scrollbar-none -mx-4 flex snap-x scroll-px-4 gap-4 overflow-x-auto px-4 pb-2 sm:gap-6">
        {(loading ? Array.from({ length: 5 }) : (products ?? [])).map((p, i) => (
          <div key={loading ? i : (p as ProductSummary).id} className="w-[46%] shrink-0 snap-start sm:w-[31%] lg:w-[23%] xl:w-[18.5%]">
            {loading ? <ProductCardSkeleton /> : <ProductCard product={p as ProductSummary} />}
          </div>
        ))}
      </div>
    </section>
  );
}
