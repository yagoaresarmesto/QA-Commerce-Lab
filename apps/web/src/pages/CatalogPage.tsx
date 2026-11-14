import * as Dialog from '@radix-ui/react-dialog';
import { SlidersHorizontal, X } from 'lucide-react';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { ProductGrid } from '../components/product/ProductCard';
import { Button } from '../components/ui/Button';
import { Breadcrumbs, Pagination, Rating } from '../components/ui/Commerce';
import { EmptyState, ErrorState } from '../components/ui/Feedback';
import { ApiError } from '../lib/api';
import { eurosToCents, formatPrice } from '../lib/format';
import { useCategory, useProducts } from '../lib/queries';
import type { ProductList } from '../lib/types';
import { NotFoundPage } from './NotFoundPage';
import { useDocumentTitle } from './useDocumentTitle';

export type CatalogMode = 'category' | 'search' | 'offers';

const SORTS = [
  ['relevance', 'Relevancia'],
  ['price_asc', 'Precio: de menor a mayor'],
  ['price_desc', 'Precio: de mayor a menor'],
  ['popularity', 'Más vendidos'],
  ['rating', 'Mejor valorados'],
  ['newest', 'Novedades'],
  ['discount', 'Mayor descuento'],
  ['name_asc', 'Nombre (A-Z)'],
] as const;

function FilterSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="border-b border-slate-200/80 py-5 first:pt-0 last:border-0">
      <legend className="float-left mb-3.5 w-full text-[13px] font-semibold uppercase tracking-[0.08em] text-slate-500">{title}</legend>
      <div className="clear-both space-y-2.5">{children}</div>
    </fieldset>
  );
}

function Filters({ mode, facets, params, update }: { mode: CatalogMode; facets?: ProductList['facets']; params: URLSearchParams; update: (changes: Record<string, string | null>) => void }) {
  const selectedBrands = (params.get('brand') ?? '').split(',').filter(Boolean);
  const [min, setMin] = useState(params.get('min') ?? '');
  const [max, setMax] = useState(params.get('max') ?? '');
  const [priceError, setPriceError] = useState<string>();
  useEffect(() => {
    setMin(params.get('min') ?? '');
    setMax(params.get('max') ?? '');
  }, [params]);

  const applyPrice = (e: FormEvent) => {
    e.preventDefault();
    const minC = eurosToCents(min);
    const maxC = eurosToCents(max);
    if ((min && minC === undefined) || (max && maxC === undefined)) return setPriceError('Introduce importes válidos');
    if (minC !== undefined && maxC !== undefined && minC > maxC) return setPriceError('El mínimo no puede ser mayor que el máximo');
    setPriceError(undefined);
    update({ min: min || null, max: max || null });
  };

  return (
    <div data-testid="filters">
      {facets && facets.categories.length > 1 && (
        <FilterSection title="Categoría">
          {facets.categories.map((c) => (
            <Link key={c.slug} to={`/categoria/${c.slug}`} className="flex justify-between rounded-xl text-sm text-slate-700 hover:text-slate-950">
              <span>{c.name}</span>
              <span className="text-slate-400">{c.count}</span>
            </Link>
          ))}
        </FilterSection>
      )}
      <FilterSection title="Marca">
        {facets?.brands.length === 0 && <p className="text-sm text-slate-500">Sin marcas</p>}
        {facets?.brands.map((b) => {
          const checked = selectedBrands.includes(b.slug);
          return (
            <label key={b.slug} className="flex cursor-pointer items-center gap-2.5 text-sm text-slate-700">
              <input
                type="checkbox"
                className="h-[18px] w-[18px] rounded accent-slate-950"
                checked={checked}
                onChange={() => {
                  const next = checked ? selectedBrands.filter((s) => s !== b.slug) : [...selectedBrands, b.slug];
                  update({ brand: next.length ? next.join(',') : null });
                }}
                data-testid={`filter-brand-${b.slug}`}
              />
              <span className="flex-1">{b.name}</span>
              <span className="text-slate-400">{b.count}</span>
            </label>
          );
        })}
      </FilterSection>
      <FilterSection title="Precio (€)">
        <form onSubmit={applyPrice} className="space-y-2" aria-label="Filtrar por precio">
          <div className="flex items-center gap-2">
            <input aria-label="Precio mínimo" inputMode="decimal" placeholder={facets ? String(Math.floor(facets.priceRange.minCents / 100)) : 'Mín'} value={min} onChange={(e) => setMin(e.target.value)} className="h-10 w-full rounded-full border border-slate-200 px-3.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-100" data-testid="filter-price-min" />
            <span className="text-slate-400">–</span>
            <input aria-label="Precio máximo" inputMode="decimal" placeholder={facets ? String(Math.ceil(facets.priceRange.maxCents / 100)) : 'Máx'} value={max} onChange={(e) => setMax(e.target.value)} className="h-10 w-full rounded-full border border-slate-200 px-3.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-100" data-testid="filter-price-max" />
          </div>
          {priceError && (
            <p className="text-xs text-rose-600" role="alert">
              {priceError}
            </p>
          )}
          <Button type="submit" size="sm" variant="outline" className="w-full" data-testid="filter-price-apply">
            Aplicar precio
          </Button>
        </form>
      </FilterSection>
      <FilterSection title="Disponibilidad">
        <label className="flex cursor-pointer items-center gap-2.5 text-sm text-slate-700">
          <input type="checkbox" className="h-[18px] w-[18px] rounded accent-slate-950" checked={params.get('inStock') === 'true'} onChange={(e) => update({ inStock: e.target.checked ? 'true' : null })} data-testid="filter-in-stock" />
          <span className="flex-1">Solo productos en stock</span>
          {facets && <span className="text-slate-400">{facets.inStockCount}</span>}
        </label>
        {mode !== 'offers' && (
          <label className="flex cursor-pointer items-center gap-2.5 text-sm text-slate-700">
            <input type="checkbox" className="h-[18px] w-[18px] rounded accent-slate-950" checked={params.get('onSale') === 'true'} onChange={(e) => update({ onSale: e.target.checked ? 'true' : null })} data-testid="filter-on-sale" />
            <span className="flex-1">Solo ofertas</span>
            {facets && <span className="text-slate-400">{facets.onSaleCount}</span>}
          </label>
        )}
      </FilterSection>
      <FilterSection title="Valoración">
        {[4, 3, 2].map((r) => (
          <label key={r} className="flex cursor-pointer items-center gap-2.5 text-sm text-slate-700">
            <input type="radio" name="minRating" className="h-[18px] w-[18px] rounded accent-slate-950" checked={params.get('minRating') === String(r)} onChange={() => update({ minRating: String(r) })} data-testid={`filter-rating-${r}`} />
            <Rating value={r} /> <span>o más</span>
          </label>
        ))}
        {params.get('minRating') && (
          <button className="text-xs font-semibold text-brand-700" onClick={() => update({ minRating: null })}>
            Quitar valoración
          </button>
        )}
      </FilterSection>
    </div>
  );
}

const FILTER_KEYS = ['brand', 'min', 'max', 'inStock', 'onSale', 'minRating', 'featured'];

export function CatalogPage({ mode }: { mode: CatalogMode }) {
  const { slug } = useParams();
  const [params, setParams] = useSearchParams();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const category = useCategory(mode === 'category' ? slug : undefined);
  const q = params.get('q') ?? undefined;
  const page = Number(params.get('page') ?? 1) || 1;

  const query = {
    q,
    category: mode === 'category' ? slug : (params.get('category') ?? undefined),
    brand: params.get('brand') ?? undefined,
    minPriceCents: params.get('min') ? eurosToCents(params.get('min')!) : undefined,
    maxPriceCents: params.get('max') ? eurosToCents(params.get('max')!) : undefined,
    inStock: params.get('inStock') === 'true' ? true : undefined,
    onSale: mode === 'offers' || params.get('onSale') === 'true' ? true : undefined,
    featured: params.get('featured') === 'true' ? true : undefined,
    minRating: params.get('minRating') ? Number(params.get('minRating')) : undefined,
    sort: params.get('sort') ?? (mode === 'offers' ? 'discount' : 'relevance'),
    page,
    pageSize: 24,
  };
  const products = useProducts(query);

  const title = mode === 'category' ? category.data?.name : mode === 'offers' ? 'Ofertas' : q ? `Resultados para “${q}”` : 'Todos los productos';
  useDocumentTitle(title);

  const update = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v === null || v === '') next.delete(k);
      else next.set(k, v);
    }
    if (!('page' in changes)) next.delete('page');
    setParams(next);
  };

  if (mode === 'category' && category.error instanceof ApiError && category.error.status === 404) return <NotFoundPage />;

  const activeFilters = FILTER_KEYS.filter((k) => params.get(k));
  const data = products.data;
  const breadcrumbs =
    mode === 'category' && category.data
      ? [...(category.data.parent ? [{ label: category.data.parent.name, to: `/categoria/${category.data.parent.slug}` }] : []), { label: category.data.name }]
      : [{ label: title ?? 'Catálogo' }];

  return (
    <div className="container-page py-6">
      <Breadcrumbs items={breadcrumbs} />
      <div className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-4xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-5xl" data-testid="catalog-title">
            {title ?? ' '}
          </h1>
          {mode === 'category' && category.data?.description && <p className="mt-2 text-lg text-slate-500">{category.data.description}</p>}
          <p className="mt-3 inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600" aria-live="polite" data-testid="results-count">
            {data ? `${data.meta.total} ${data.meta.total === 1 ? 'producto' : 'productos'}` : 'Buscando…'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="lg:hidden" icon={<SlidersHorizontal className="h-4 w-4" />} onClick={() => setFiltersOpen(true)} data-testid="open-filters">
            Filtros{activeFilters.length ? ` (${activeFilters.length})` : ''}
          </Button>
          <label htmlFor="sort" className="sr-only">
            Ordenar por
          </label>
          <select id="sort" value={query.sort} onChange={(e) => update({ sort: e.target.value })} className="h-11 rounded-full border border-slate-200 bg-white pl-4 pr-9 text-sm font-medium hover:border-slate-300 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-100" data-testid="sort-select">
            {SORTS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {activeFilters.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2" data-testid="active-filters">
          {activeFilters.map((k) => (
            <button key={k} onClick={() => update({ [k]: null })} className="inline-flex items-center gap-1.5 rounded-full bg-slate-950 px-3.5 py-1.5 text-xs font-medium text-white transition hover:bg-brand-600">
              {k === 'brand' ? `Marcas: ${params.get('brand')}` : k === 'min' ? `Desde ${params.get('min')} €` : k === 'max' ? `Hasta ${params.get('max')} €` : k === 'inStock' ? 'En stock' : k === 'onSale' ? 'Ofertas' : k === 'featured' ? 'Destacados' : `${params.get('minRating')}★ o más`}
              <X className="h-3 w-3" aria-hidden="true" />
              <span className="sr-only">Quitar filtro</span>
            </button>
          ))}
          <button className="px-2 text-xs font-semibold text-slate-600 underline-offset-4 hover:text-slate-950 hover:underline" onClick={() => update(Object.fromEntries(FILTER_KEYS.map((k) => [k, null])))} data-testid="clear-filters">
            Limpiar filtros
          </button>
        </div>
      )}

      <div className="grid gap-10 lg:grid-cols-[15rem_1fr]">
        <aside className="hidden h-fit lg:sticky lg:top-40 lg:block" aria-label="Filtros">
          <Filters mode={mode} facets={data?.facets} params={params} update={update} />
        </aside>
        <Dialog.Root open={filtersOpen} onOpenChange={setFiltersOpen}>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-sm" />
            <Dialog.Content className="fixed inset-y-2 right-2 z-50 w-80 max-w-[90vw] overflow-y-auto rounded-4xl bg-white px-6 py-5 shadow-pop">
              <div className="flex items-center justify-between">
                <Dialog.Title className="mb-4 text-lg font-semibold tracking-tight">Filtros</Dialog.Title>
                <Dialog.Description className="sr-only">Filtra los productos del catálogo</Dialog.Description>
                <Dialog.Close className="rounded-lg p-1.5 hover:bg-slate-100" aria-label="Cerrar filtros">
                  <X className="h-5 w-5" />
                </Dialog.Close>
              </div>
              <Filters mode={mode} facets={data?.facets} params={params} update={update} />
              <Button className="mt-4 w-full" onClick={() => setFiltersOpen(false)}>
                Ver {data?.meta.total ?? ''} productos
              </Button>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>

        <section aria-label="Resultados" aria-busy={products.isFetching}>
          {products.isError ? (
            <ErrorState message={products.error instanceof Error ? products.error.message : undefined} onRetry={() => products.refetch()} />
          ) : data && data.data.length === 0 ? (
            <EmptyState
              title="No hemos encontrado productos"
              description={q ? `No hay resultados para “${q}” con los filtros seleccionados.` : 'Prueba a cambiar o quitar algunos filtros.'}
              action={
                activeFilters.length > 0 ? (
                  <Button variant="outline" onClick={() => update(Object.fromEntries(FILTER_KEYS.map((k) => [k, null])))}>
                    Limpiar filtros
                  </Button>
                ) : undefined
              }
              testId="no-results"
            />
          ) : (
            <div className={products.isFetching && !products.isLoading ? 'opacity-60 transition' : undefined}>
              <ProductGrid products={data?.data} loading={products.isLoading} />
            </div>
          )}
          {data && data.meta.totalPages > 1 && (
            <div className="mt-8 space-y-2">
              <Pagination page={data.meta.page} totalPages={data.meta.totalPages} onPage={(p) => update({ page: String(p) })} />
              <p className="text-center text-xs text-slate-500">
                Página {data.meta.page} de {data.meta.totalPages} · {data.facets.priceRange.maxCents > 0 && `Precios entre ${formatPrice(data.facets.priceRange.minCents)} y ${formatPrice(data.facets.priceRange.maxCents)}`}
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
