import { ArrowRight, ArrowUpRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { TrustBar } from '../components/layout/Footer';
import { ProductImage, ProductRail } from '../components/product/ProductCard';
import { ButtonLink } from '../components/ui/Button';
import { Price } from '../components/ui/Commerce';
import { ErrorState, Skeleton } from '../components/ui/Feedback';
import { cn } from '../lib/cn';
import { useBrands, useHome } from '../lib/queries';
import type { Banner, CategoryNode, ProductSummary } from '../lib/types';
import { useDocumentTitle } from './useDocumentTitle';

/** Soft background + illustration accent per banner theme */
const THEMES: Record<string, { soft: string; accent: string }> = {
  violet: { soft: 'bg-brand-100', accent: '7c5cff' },
  sky: { soft: 'bg-sky-100', accent: '0ea5e9' },
  amber: { soft: 'bg-amber-100', accent: 'f59e0b' },
  emerald: { soft: 'bg-accent-200', accent: '65a30d' },
  indigo: { soft: 'bg-brand-50', accent: '6a3ff5' },
  rose: { soft: 'bg-rose-100', accent: 'f43f5e' },
};

const bannerImage = (b: Banner, light = false) =>
  `/api/media/products/${b.imageKind ?? 'components'}.svg?c=${light ? 'c8f542' : (THEMES[b.theme] ?? THEMES.indigo).accent}&v=1&bg=0`;

function HeroCarousel({ banners }: { banners: Banner[] }) {
  const [index, setIndex] = useState(0);
  if (!banners.length) return null;
  const current = banners[index];
  const go = (i: number) => setIndex((i + banners.length) % banners.length);
  return (
    <section aria-roledescription="carrusel" aria-label="Promociones destacadas" className="mesh-dark relative overflow-hidden rounded-4xl text-white lg:row-span-2" data-testid="hero-carousel">
      <div className="relative flex min-h-[26rem] flex-col justify-between gap-10 p-7 sm:p-10 lg:min-h-[34rem] lg:p-12" aria-roledescription="diapositiva" aria-label={`${index + 1} de ${banners.length}`} data-testid="hero-slide">
        <div className="relative z-10 max-w-xl space-y-6">
          <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/80 backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-accent-400" aria-hidden="true" /> Promoción
          </p>
          <h1 className="text-[2.6rem] font-semibold leading-[1.02] tracking-[-0.045em] sm:text-6xl lg:text-7xl">{current.title}</h1>
          {current.subtitle && <p className="max-w-md text-base text-white/70 sm:text-lg">{current.subtitle}</p>}
          <div className="flex flex-wrap items-center gap-3">
            <ButtonLink to={current.ctaHref} variant="accent" size="lg" data-testid="hero-cta">
              {current.ctaLabel} <ArrowRight className="h-4 w-4" />
            </ButtonLink>
            <ButtonLink to="/ofertas" size="lg" className="border border-white/20 bg-white/5 text-white hover:bg-white/15">
              Todas las ofertas
            </ButtonLink>
          </div>
        </div>
        <img
          src={bannerImage(current, true)}
          alt=""
          className="pointer-events-none absolute -bottom-8 -right-10 hidden w-[52%] max-w-[30rem] drop-shadow-[0_30px_60px_rgba(124,92,255,0.45)] md:block"
        />
        {banners.length > 1 && (
          <div className="relative z-10 flex items-center gap-3">
            <button onClick={() => go(index - 1)} className="hidden h-10 w-10 items-center justify-center rounded-full border border-white/15 text-white transition hover:bg-white/10 sm:flex" aria-label="Promoción anterior" data-testid="hero-prev">
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button onClick={() => go(index + 1)} className="hidden h-10 w-10 items-center justify-center rounded-full border border-white/15 text-white transition hover:bg-white/10 sm:flex" aria-label="Promoción siguiente" data-testid="hero-next">
              <ChevronRight className="h-5 w-5" />
            </button>
            <div className="flex gap-2">
              {banners.map((b, i) => (
                <button key={b.id} onClick={() => go(i)} className={cn('h-1.5 rounded-full transition-all', i === index ? 'w-10 bg-accent-400' : 'w-4 bg-white/30 hover:bg-white/50')} aria-label={`Ir a la promoción ${i + 1}`} aria-current={i === index} />
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function PromoTile({ banner, className }: { banner: Banner; className?: string }) {
  const theme = THEMES[banner.theme] ?? THEMES.indigo;
  return (
    <Link to={banner.ctaHref} className={cn('group relative flex min-h-56 flex-col justify-between overflow-hidden rounded-4xl p-7', theme.soft, className)} data-testid="promo-banner">
      <div className="relative z-10 max-w-[65%] space-y-2">
        <h3 className="text-balance text-2xl font-semibold leading-tight tracking-[-0.03em] text-slate-950">{banner.title}</h3>
        <p className="text-sm text-slate-700">{banner.subtitle}</p>
      </div>
      <span className="relative z-10 inline-flex w-fit items-center gap-1.5 rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition group-hover:bg-brand-600">
        {banner.ctaLabel} <ArrowUpRight className="h-4 w-4" />
      </span>
      <img src={bannerImage(banner)} alt="" className="pointer-events-none absolute -bottom-6 -right-8 w-52 transition duration-500 group-hover:scale-105 group-hover:-rotate-3" />
    </Link>
  );
}

function DealTile({ product }: { product: ProductSummary }) {
  return (
    <Link to={`/producto/${product.slug}`} className="group relative flex min-h-56 overflow-hidden rounded-4xl bg-slate-950 p-7 text-white" data-testid="deal-of-the-week">
      <div className="relative z-10 flex max-w-[58%] flex-col justify-between gap-4">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent-400">Oferta destacada · -{product.discountPercent}%</p>
          <h3 className="line-clamp-3 text-xl font-semibold leading-tight tracking-tight">{product.name}</h3>
        </div>
        <div className="[&_[data-testid=price]]:text-white [&_[data-testid=price]]:text-2xl">
          <Price cents={product.priceCents} compareAt={product.compareAtPriceCents} />
        </div>
      </div>
      <ProductImage src={product.imageUrl} alt="" className="pointer-events-none absolute -bottom-4 -right-4 h-48 w-48 transition duration-500 group-hover:scale-105" />
    </Link>
  );
}

function CategoryTiles({ categories }: { categories: CategoryNode[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4 xl:grid-cols-8" data-testid="popular-categories">
      {categories.map((c) => (
        <Link key={c.id} to={`/categoria/${c.slug}`} className="tile group flex flex-col items-center rounded-3xl px-3 pb-5 pt-3 text-center transition hover:bg-slate-100" data-testid="category-tile">
          <img src={`/api/media/products/${c.slug}.svg?c=7c5cff&v=0&bg=0`} alt="" className="h-28 w-28 transition duration-500 group-hover:-translate-y-1 group-hover:scale-105" loading="lazy" />
          <span className="text-sm font-semibold leading-tight tracking-tight text-slate-950">{c.name}</span>
          <span className="mt-0.5 text-xs text-slate-500">{c.productCount} productos</span>
        </Link>
      ))}
    </div>
  );
}

function BrandStrip() {
  const { data } = useBrands();
  if (!data?.length) return null;
  const top = [...data].sort((a, b) => b.productCount - a.productCount || a.name.localeCompare(b.name)).slice(0, 14);
  return (
    <section aria-labelledby="brands-title" className="space-y-5" data-testid="brand-strip">
      <h2 id="brands-title" className="text-center text-sm font-medium text-slate-500">
        Las marcas que buscas, al mejor precio
      </h2>
      <ul className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
        {top.map((b) => (
          <li key={b.id}>
            <Link to={`/buscar?brand=${b.slug}`} className="text-xl font-semibold tracking-tight text-slate-300 transition hover:text-slate-950 sm:text-2xl">
              {b.name}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function HomePage() {
  useDocumentTitle('Tienda de electrónica');
  const { data, isLoading, isError, refetch } = useHome();

  if (isError) {
    return (
      <div className="container-page py-10">
        <ErrorState message="No hemos podido cargar la página principal." onRetry={() => refetch()} />
      </div>
    );
  }

  const deal = data?.deals[0];
  const [firstPromo, ...otherPromos] = data?.promoBanners ?? [];

  return (
    <div className="container-page space-y-20 py-6 sm:py-8">
      <div className="space-y-4">
        {isLoading ? (
          <div className="grid gap-4 lg:grid-cols-[1.75fr_1fr]">
            <Skeleton className="h-[34rem] rounded-4xl" />
            <div className="grid gap-4">
              <Skeleton className="h-full rounded-4xl" />
              <Skeleton className="h-full rounded-4xl" />
            </div>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[1.75fr_1fr] lg:grid-rows-2">
            <HeroCarousel banners={data!.heroBanners} />
            {firstPromo && <PromoTile banner={firstPromo} />}
            {deal && <DealTile product={deal} />}
          </div>
        )}
        <TrustBar />
      </div>

      <section aria-labelledby="popular-categories-title" className="space-y-6">
        <div className="space-y-1.5">
          <p className="eyebrow">Explora</p>
          <h2 id="popular-categories-title" className="heading-lg">
            Categorías populares
          </h2>
        </div>
        {isLoading ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 xl:grid-cols-8">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-44 rounded-3xl" />
            ))}
          </div>
        ) : (
          <CategoryTiles categories={data!.popularCategories} />
        )}
      </section>

      <ProductRail eyebrow="Solo esta semana" title="Ofertas que no puedes dejar pasar" products={data?.deals} loading={isLoading} href="/ofertas" testId="home-deals" />

      {otherPromos.length > 0 && (
        <section aria-label="Promociones" className="grid gap-4 md:grid-cols-2" data-testid="promo-banners">
          {otherPromos.map((b) => (
            <PromoTile key={b.id} banner={b} />
          ))}
        </section>
      )}

      <ProductRail eyebrow="Selección del equipo" title="Destacados" products={data?.featured} loading={isLoading} href="/buscar?featured=true" testId="home-featured" />
      <BrandStrip />
      <ProductRail eyebrow="Recién llegados" title="Novedades" products={data?.newArrivals} loading={isLoading} href="/buscar?sort=newest" testId="home-new" />
      <ProductRail eyebrow="Lo que más se lleva" title="Los más vendidos" products={data?.bestSellers} loading={isLoading} href="/buscar?sort=popularity" testId="home-bestsellers" />
      <ProductRail eyebrow="Opiniones de clientes" title="Mejor valorados" products={data?.topRated} loading={isLoading} href="/buscar?sort=rating" testId="home-toprated" />
    </div>
  );
}
