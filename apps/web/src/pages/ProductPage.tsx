import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BadgeCheck, RotateCcw, ShieldCheck, ShoppingCart, Star, Truck } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { z } from 'zod';
import { useAuth } from '../auth/AuthProvider';
import { FavoriteButton, ProductImage, ProductRail } from '../components/product/ProductCard';
import { Button, ButtonLink } from '../components/ui/Button';
import { AvailabilityLabel, Breadcrumbs, Pagination, Price, QuantityStepper, Rating } from '../components/ui/Commerce';
import { Alert, Badge, ErrorState, Skeleton } from '../components/ui/Feedback';
import { Input, Textarea } from '../components/ui/Field';
import { ConfirmDialog } from '../components/ui/Modal';
import { ApiError, errorMessage, http } from '../lib/api';
import { cn } from '../lib/cn';
import { formatDate, formatPrice } from '../lib/format';
import { useCartMutations, useProduct, useRelated, useReviews } from '../lib/queries';
import type { ProductDetail, Review } from '../lib/types';
import { NotFoundPage } from './NotFoundPage';
import { useDocumentTitle } from './useDocumentTitle';

const reviewSchema = z.object({
  rating: z.number({ message: 'Selecciona una valoración' }).int().min(1, 'Selecciona una valoración').max(5),
  title: z.string().trim().min(3, 'El título debe tener al menos 3 caracteres').max(120, 'Máximo 120 caracteres'),
  comment: z.string().trim().min(10, 'El comentario debe tener al menos 10 caracteres').max(2000, 'Máximo 2000 caracteres'),
});
type ReviewForm = z.infer<typeof reviewSchema>;

function StarInput({ value, onChange, error }: { value: number; onChange: (v: number) => void; error?: string }) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-medium text-slate-700">Tu valoración</legend>
      <div className="flex gap-1" role="radiogroup" aria-label="Valoración">
        {[1, 2, 3, 4, 5].map((i) => (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={value === i}
            aria-label={`${i} ${i === 1 ? 'estrella' : 'estrellas'}`}
            onClick={() => onChange(i)}
            className="rounded p-0.5"
            data-testid={`rating-star-${i}`}
          >
            <Star className={cn('h-7 w-7', i <= value ? 'fill-amber-400 text-amber-400' : 'text-slate-300')} />
          </button>
        ))}
      </div>
      {error && (
        <p className="mt-1 text-xs font-medium text-rose-600" role="alert">
          {error}
        </p>
      )}
    </fieldset>
  );
}

function ReviewFormCard({ productId, existing, onDone }: { productId: number; existing?: Review; onDone: () => void }) {
  const qc = useQueryClient();
  const { register, handleSubmit, setValue, watch, setError, formState } = useForm<ReviewForm>({
    resolver: zodResolver(reviewSchema),
    defaultValues: existing ? { rating: existing.rating, title: existing.title, comment: existing.comment } : { rating: 0, title: '', comment: '' },
  });
  const save = useMutation({
    mutationFn: (v: ReviewForm) => (existing ? http.patch(`/reviews/${existing.id}`, v) : http.post(`/products/${productId}/reviews`, v)),
    onSuccess: () => {
      toast.success(existing ? 'Reseña actualizada' : '¡Gracias por tu reseña!');
      void qc.invalidateQueries({ queryKey: ['catalog'] });
      onDone();
    },
    onError: (e) => {
      if (e instanceof ApiError) Object.entries(e.fieldErrors).forEach(([f, m]) => setError(f as keyof ReviewForm, { message: m }));
      toast.error(errorMessage(e));
    },
  });
  return (
    <form onSubmit={handleSubmit((v) => save.mutate(v))} className="space-y-4 rounded-4xl border border-slate-200/80 p-6" noValidate aria-label="Escribir reseña" data-testid="review-form">
      <StarInput value={watch('rating')} onChange={(v) => setValue('rating', v, { shouldValidate: true })} error={formState.errors.rating?.message} />
      <Input label="Título" required {...register('title')} error={formState.errors.title?.message} maxLength={120} />
      <Textarea label="Comentario" required {...register('comment')} error={formState.errors.comment?.message} maxLength={2000} />
      <div className="flex gap-3">
        <Button type="submit" loading={save.isPending} data-testid="review-submit">
          {existing ? 'Guardar cambios' : 'Publicar reseña'}
        </Button>
        <Button variant="ghost" onClick={onDone}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

function Reviews({ product }: { product: ProductDetail }) {
  const { user, status } = useAuth();
  const qc = useQueryClient();
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);
  const [writing, setWriting] = useState(false);
  const [editing, setEditing] = useState<Review | null>(null);
  const [deleting, setDeleting] = useState<Review | null>(null);
  const reviews = useReviews(product.id, { sort, page, pageSize: 5 });
  const mine = reviews.data?.data.find((r) => r.author.id === user?.id);
  const remove = useMutation({
    mutationFn: (id: number) => http.delete(`/reviews/${id}`),
    onSuccess: () => {
      toast.success('Reseña eliminada');
      setDeleting(null);
      void qc.invalidateQueries({ queryKey: ['catalog'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const summary = reviews.data?.summary;

  return (
    <section aria-labelledby="reviews-title" className="space-y-6" id="resenas" data-testid="reviews">
      <div className="space-y-1.5">
        <p className="eyebrow">Valoraciones</p>
        <h2 id="reviews-title" className="heading-lg">
          Opiniones de clientes
        </h2>
      </div>
      <div className="grid gap-6 md:grid-cols-[18rem_1fr]">
        <div className="h-fit space-y-4 rounded-4xl bg-slate-50 p-6" data-testid="rating-summary">
          <div className="flex items-end gap-2">
            <span className="text-5xl font-semibold tracking-tight">{summary ? summary.average.toFixed(1) : '–'}</span>
            <span className="pb-1 text-sm text-slate-500">de 5</span>
          </div>
          <Rating value={summary?.average ?? 0} count={summary?.count} />
          <ul className="space-y-1.5">
            {[5, 4, 3, 2, 1].map((s) => {
              const n = summary?.distribution[String(s)] ?? 0;
              const pct = summary?.count ? Math.round((n / summary.count) * 100) : 0;
              return (
                <li key={s} className="flex items-center gap-2 text-xs text-slate-600">
                  <span className="w-3">{s}</span>
                  <Star className="h-3 w-3 fill-amber-400 text-amber-400" aria-hidden="true" />
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200">
                    <span className="block h-full rounded-full bg-slate-950" style={{ width: `${pct}%` }} />
                  </span>
                  <span className="w-6 text-right">{n}</span>
                </li>
              );
            })}
          </ul>
          {status === 'authenticated' ? (
            !mine && !writing && (
              <Button variant="outline" className="w-full" onClick={() => setWriting(true)} data-testid="write-review">
                Escribir una reseña
              </Button>
            )
          ) : (
            <p className="text-sm text-slate-600">
              <Link to={`/login?redirect=/producto/${product.slug}`} className="font-semibold text-brand-700">
                Inicia sesión
              </Link>{' '}
              para escribir una reseña.
            </p>
          )}
        </div>
        <div className="space-y-4">
          {(writing || editing) && (
            <ReviewFormCard
              productId={product.id}
              existing={editing ?? undefined}
              onDone={() => {
                setWriting(false);
                setEditing(null);
              }}
            />
          )}
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">{summary?.count ?? 0} reseñas</p>
            <label className="flex items-center gap-2 text-sm">
              <span className="text-slate-600">Ordenar</span>
              <select
                value={sort}
                onChange={(e) => {
                  setSort(e.target.value);
                  setPage(1);
                }}
                className="h-10 rounded-full border border-slate-200 pl-3.5 pr-8 text-sm"
                data-testid="reviews-sort"
              >
                <option value="newest">Más recientes</option>
                <option value="oldest">Más antiguas</option>
                <option value="rating_desc">Mejor valoradas</option>
                <option value="rating_asc">Peor valoradas</option>
              </select>
            </label>
          </div>
          {reviews.isLoading && <Skeleton className="h-32" />}
          {reviews.data?.data.length === 0 && <p className="rounded-3xl bg-slate-50 p-6 text-sm text-slate-500">Todavía no hay reseñas. ¡Sé el primero en opinar!</p>}
          <ul className="space-y-3">
            {reviews.data?.data.map((r) => (
              <li key={r.id} className="rounded-3xl border border-slate-200/80 p-6" data-testid="review-item" data-review-id={r.id}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <Rating value={r.rating} />
                    <h3 className="font-semibold">{r.title}</h3>
                  </div>
                  {r.isVerifiedPurchase && (
                    <Badge tone="green">
                      <BadgeCheck className="h-3.5 w-3.5" /> Compra verificada
                    </Badge>
                  )}
                </div>
                <p className="mt-2 text-sm text-slate-700">{r.comment}</p>
                <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                  <span>
                    {r.author.displayName} · {formatDate(r.createdAt)}
                  </span>
                  {r.author.id === user?.id && (
                    <span className="flex gap-3">
                      <button className="font-semibold text-brand-700" onClick={() => setEditing(r)} data-testid="edit-review">
                        Editar
                      </button>
                      <button className="font-semibold text-rose-600" onClick={() => setDeleting(r)} data-testid="delete-review">
                        Eliminar
                      </button>
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {reviews.data && <Pagination page={page} totalPages={reviews.data.meta.totalPages} onPage={setPage} />}
        </div>
      </div>
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Eliminar reseña"
        description="Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
      />
    </section>
  );
}

export function ProductPage() {
  const { slug } = useParams();
  const { data: product, isLoading, error, refetch } = useProduct(slug);
  const related = useRelated(product?.id);
  const { add } = useCartMutations();
  const navigate = useNavigate();
  const [quantity, setQuantity] = useState(1);
  const [activeImage, setActiveImage] = useState(0);
  useDocumentTitle(product?.name);

  if (error instanceof ApiError && error.status === 404) return <NotFoundPage />;
  if (error) {
    return (
      <div className="container-page py-10">
        <ErrorState message={errorMessage(error)} onRetry={() => refetch()} />
      </div>
    );
  }
  if (isLoading || !product) {
    return (
      <div className="container-page grid gap-8 py-8 lg:grid-cols-2">
        <Skeleton className="aspect-square w-full rounded-3xl" />
        <div className="space-y-4">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-40 w-full" />
        </div>
      </div>
    );
  }

  const purchasable = product.availability === 'IN_STOCK' || product.availability === 'LOW_STOCK';
  const maxQty = Math.max(1, Math.min(product.stock, product.maxQuantityPerOrder));
  const image = product.images[activeImage] ?? product.images[0];
  const keySpecs = product.specs.slice(0, 4);
  const saving = product.compareAtPriceCents && product.compareAtPriceCents > product.priceCents ? product.compareAtPriceCents - product.priceCents : 0;

  return (
    <div className="container-page py-6">
      <Breadcrumbs items={[...product.categoryPath.map((c) => ({ label: c.name, to: `/categoria/${c.slug}` })), { label: product.name }]} />
      <div className="grid gap-10 lg:grid-cols-[1.15fr_1fr] xl:gap-16" data-testid="product-detail" data-product-id={product.id} data-sku={product.sku}>
        <div className="space-y-4 lg:sticky lg:top-40 lg:self-start">
          <div className="tile relative overflow-hidden rounded-4xl p-8 sm:p-14">
            <div className="absolute left-5 top-5 z-10 flex gap-2">
              {product.discountPercent > 0 && <Badge tone="dark" className="px-3 py-1.5 text-xs">-{product.discountPercent}%</Badge>}
              {product.isNew && <Badge tone="lime" className="px-3 py-1.5 text-xs">Novedad</Badge>}
            </div>
            <ProductImage src={image.url} alt={image.alt} className="mx-auto aspect-square w-full max-w-xl" />
          </div>
          {product.images.length > 1 && (
            <div className="flex gap-3" role="tablist" aria-label="Imágenes del producto">
              {product.images.map((img, i) => (
                <button
                  key={img.url}
                  role="tab"
                  aria-selected={i === activeImage}
                  aria-label={`Ver imagen ${i + 1}`}
                  onClick={() => setActiveImage(i)}
                  className={cn('tile h-20 w-20 overflow-hidden rounded-2xl p-2 transition sm:h-24 sm:w-24', i === activeImage ? 'ring-2 ring-slate-950' : 'opacity-70 hover:opacity-100')}
                  data-testid="product-thumbnail"
                >
                  <ProductImage src={img.url} alt="" className="h-full w-full" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-7">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <Link to={`/buscar?brand=${product.brand.slug}`} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-950 hover:text-white">
                {product.brand.name}
              </Link>
              <a href="#resenas" className="text-sm text-slate-500 hover:text-slate-950">
                <Rating value={product.ratingAvg} count={product.ratingCount} showValue />
              </a>
            </div>
            <h1 className="text-3xl font-semibold leading-[1.1] tracking-[-0.035em] text-slate-950 sm:text-[2.6rem]" data-testid="product-name">
              {product.name}
            </h1>
            <p className="text-lg text-slate-600">{product.shortDescription}</p>
            <p className="text-xs text-slate-400">
              SKU: <span data-testid="product-sku">{product.sku}</span>
            </p>
          </div>

          {keySpecs.length > 0 && (
            <dl className="grid grid-cols-2 gap-2.5" data-testid="key-specs">
              {keySpecs.map((s) => (
                <div key={s.name} className="rounded-2xl border border-slate-200/80 px-4 py-3">
                  <dt className="text-[11px] font-medium uppercase tracking-[0.08em] text-slate-500">{s.name}</dt>
                  <dd className="mt-0.5 line-clamp-2 text-sm font-medium text-slate-950">{s.value}</dd>
                </div>
              ))}
            </dl>
          )}

          <div className="space-y-5 rounded-4xl bg-slate-50 p-6 sm:p-7">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <Price cents={product.priceCents} compareAt={product.compareAtPriceCents} size="lg" />
                <p className="mt-1 text-xs text-slate-500">
                  IVA incluido
                  {saving > 0 && <span className="ml-2 rounded-full bg-accent-300 px-2 py-0.5 font-semibold text-slate-950">Ahorras {formatPrice(saving)}</span>}
                </p>
              </div>
              <AvailabilityLabel availability={product.availability} stock={product.stock} />
            </div>
            {product.availability === 'DISCONTINUED' && (
              <Alert tone="warning" title="Producto descatalogado">
                Este producto ya no está a la venta.
              </Alert>
            )}
            {product.availability === 'OUT_OF_STOCK' && (
              <Alert tone="info" title="Sin stock por el momento">
                Guárdalo en favoritos y vuelve a consultarlo más adelante.
              </Alert>
            )}
            <div className="flex flex-wrap items-center gap-3">
              {purchasable && <QuantityStepper value={quantity} max={maxQty} onChange={setQuantity} testId="product-quantity" />}
              <Button
                size="lg"
                className="min-w-48 flex-1"
                icon={<ShoppingCart className="h-5 w-5" />}
                disabled={!purchasable}
                loading={add.isPending}
                data-testid="product-add-to-cart"
                onClick={() =>
                  add.mutate(
                    { productId: product.id, quantity },
                    {
                      onSuccess: () => {
                        toast.success(`${quantity} × ${product.name} añadido al carrito`, {
                          action: { label: 'Ver carrito', onClick: () => navigate('/carrito') },
                        });
                        setQuantity(1);
                      },
                      onError: (e) => toast.error(errorMessage(e)),
                    },
                  )
                }
              >
                {purchasable ? 'Añadir al carrito' : 'No disponible'}
              </Button>
              <FavoriteButton productId={product.id} />
            </div>
            {purchasable && <p className="text-xs text-slate-500">Máximo {product.maxQuantityPerOrder} unidades por pedido.</p>}
          </div>

          <ul className="grid gap-3 text-sm text-slate-600 sm:grid-cols-3">
            {[
              [Truck, 'Envío gratis', 'Desde 99 €'],
              [RotateCcw, 'Devolución', '14 días'],
              [ShieldCheck, 'Garantía', '3 años'],
            ].map(([Icon, title, text]) => {
              const I = Icon as typeof Truck;
              return (
                <li key={title as string} className="flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-950">
                    <I className="h-[18px] w-[18px]" />
                  </span>
                  <span>
                    <span className="block font-medium text-slate-950">{title as string}</span>
                    <span className="text-xs">{text as string}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <div className="mt-20 grid gap-12 lg:grid-cols-[1fr_1.2fr]">
        <section aria-labelledby="description-title" className="space-y-4">
          <p className="eyebrow">Sobre el producto</p>
          <h2 id="description-title" className="heading-lg">
            Descripción
          </h2>
          <p className="text-[17px] leading-relaxed text-slate-600" data-testid="product-description">
            {product.description}
          </p>
        </section>
        <section aria-labelledby="specs-title" className="space-y-4">
          <p className="eyebrow">Ficha técnica</p>
          <h2 id="specs-title" className="heading-lg">
            Especificaciones
          </h2>
          <table className="w-full overflow-hidden rounded-3xl text-sm" data-testid="product-specs">
            <tbody>
              {product.specs.map((s, i) => (
                <tr key={s.name} className={i % 2 === 0 ? 'bg-slate-50' : 'bg-white'}>
                  <th scope="row" className="w-2/5 px-5 py-3.5 text-left font-medium text-slate-500">
                    {s.name}
                  </th>
                  <td className="px-5 py-3.5 font-medium text-slate-950">{s.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      <div className="mt-20">
        <Reviews product={product} />
      </div>

      {related.data && related.data.length > 0 && (
        <div className="mt-20">
          <ProductRail eyebrow="Misma categoría" title="También te puede interesar" products={related.data} testId="related-products" />
        </div>
      )}
      <div className="mt-10 text-center">
        <ButtonLink to={`/categoria/${product.category.slug}`} variant="outline">
          Ver más en {product.category.name}
        </ButtonLink>
      </div>
    </div>
  );
}
