import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { TrustBar } from '../components/layout/Footer';
import { CategoryIcon } from '../components/layout/CategoryIcon';
import { ProductRail } from '../components/product/ProductCard';
import { ButtonLink } from '../components/ui/Button';
import { ErrorState, Skeleton } from '../components/ui/Feedback';
import { cn } from '../lib/cn';
import { useHome } from '../lib/queries';
import type { Banner } from '../lib/types';
import { useDocumentTitle } from './useDocumentTitle';

const THEMES: Record<string, { bg: string; accent: string }> = {
  violet: { bg: 'from-violet-700 via-brand-800 to-brand-950', accent: '8b5cf6' },
  sky: { bg: 'from-sky-600 via-sky-800 to-slate-900', accent: '38bdf8' },
  amber: { bg: 'from-amber-500 via-orange-600 to-rose-700', accent: 'fbbf24' },
  emerald: { bg: 'from-emerald-500 to-teal-700', accent: '34d399' },
  indigo: { bg: 'from-brand-500 to-brand-800', accent: '818cf8' },
  rose: { bg: 'from-rose-500 to-fuchsia-700', accent: 'fb7185' },
};

const bannerImage = (b: Banner) => `/api/media/products/${b.imageKind ?? 'components'}.svg?c=${(THEMES[b.theme] ?? THEMES.indigo).accent}&v=1&bg=0`;

function HeroCarousel({ banners }: { banners: Banner[] }) {
  const [index, setIndex] = useState(0);
  if (!banners.length) return null;
  const current = banners[index];
  const theme = THEMES[current.theme] ?? THEMES.indigo;
  const go = (i: number) => setIndex((i + banners.length) % banners.length);
  return (
    <section aria-roledescription="carrusel" aria-label="Promociones destacadas" className="relative overflow-hidden rounded-3xl" data-testid="hero-carousel">
      <div className={cn('relative flex min-h-72 items-center bg-gradient-to-br px-6 py-10 text-white sm:px-12 md:min-h-80', theme.bg)} aria-roledescription="diapositiva" aria-label={`${index + 1} de ${banners.length}`} data-testid="hero-slide">
        <div className="relative z-10 max-w-lg space-y-4">
          <p className="inline-flex rounded-full bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-wider backdrop-blur">Promoción</p>
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-5xl">{current.title}</h1>
          {current.subtitle && <p className="text-base text-white/85 sm:text-lg">{current.subtitle}</p>}
          <ButtonLink to={current.ctaHref} variant="accent" size="lg" data-testid="hero-cta">
            {current.ctaLabel}
          </ButtonLink>
        </div>
        <img src={bannerImage(current)} alt="" className="pointer-events-none absolute -right-10 bottom-0 hidden h-[115%] max-h-96 opacity-90 drop-shadow-2xl md:block" />
      </div>
      {banners.length > 1 && (
        <>
          <button onClick={() => go(index - 1)} className="absolute left-3 top-1/2 z-10 hidden -translate-y-1/2 rounded-full bg-white/20 p-2 sm:block text-white backdrop-blur hover:bg-white/30" aria-label="Promoción anterior" data-testid="hero-prev">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button onClick={() => go(index + 1)} className="absolute right-3 top-1/2 z-10 hidden -translate-y-1/2 rounded-full bg-white/20 p-2 sm:block text-white backdrop-blur hover:bg-white/30" aria-label="Promoción siguiente" data-testid="hero-next">
            <ChevronRight className="h-5 w-5" />
          </button>
          <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 gap-2">
            {banners.map((b, i) => (
              <button key={b.id} onClick={() => go(i)} className={cn('h-2.5 rounded-full transition-all', i === index ? 'w-8 bg-white' : 'w-2.5 bg-white/50')} aria-label={`Ir a la promoción ${i + 1}`} aria-current={i === index} />
            ))}
          </div>
        </>
      )}
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

  return (
    <div className="container-page space-y-12 py-6 sm:py-8">
      {isLoading ? <Skeleton className="h-80 w-full rounded-3xl" /> : <HeroCarousel banners={data!.heroBanners} />}

      <section aria-labelledby="popular-categories" className="space-y-4">
        <h2 id="popular-categories" className="text-xl font-bold tracking-tight sm:text-2xl">
          Categorías populares
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8" data-testid="popular-categories">
          {(isLoading ? Array.from({ length: 8 }) : data!.popularCategories).map((c, i) =>
            isLoading ? (
              <Skeleton key={i} className="h-28" />
            ) : (
              <Link
                key={(c as { id: number }).id}
                to={`/categoria/${(c as { slug: string }).slug}`}
                className="card group flex flex-col items-center gap-2 p-4 text-center transition hover:-translate-y-0.5 hover:border-brand-200"
                data-testid="category-tile"
              >
                <span className="rounded-2xl bg-brand-50 p-3 text-brand-600 transition group-hover:bg-brand-600 group-hover:text-white">
                  <CategoryIcon icon={(c as { icon: string | null }).icon} className="h-6 w-6" />
                </span>
                <span className="text-sm font-semibold leading-tight text-slate-800">{(c as { name: string }).name}</span>
                <span className="text-xs text-slate-500">{(c as { productCount: number }).productCount} productos</span>
              </Link>
            ),
          )}
        </div>
      </section>

      <ProductRail title="Ofertas que no puedes dejar pasar" products={data?.deals} loading={isLoading} href="/ofertas" testId="home-deals" />

      {!isLoading && data!.promoBanners.length > 0 && (
        <section aria-label="Promociones" className="grid gap-4 md:grid-cols-3" data-testid="promo-banners">
          {data!.promoBanners.map((b) => {
            const theme = THEMES[b.theme] ?? THEMES.indigo;
            return (
              <Link key={b.id} to={b.ctaHref} className={cn('group relative overflow-hidden rounded-2xl bg-gradient-to-br p-6 text-white', theme.bg)} data-testid="promo-banner">
                <h3 className="text-xl font-bold">{b.title}</h3>
                <p className="mt-1 max-w-[70%] text-sm text-white/85">{b.subtitle}</p>
                <span className="mt-4 inline-flex text-sm font-semibold underline-offset-4 group-hover:underline">{b.ctaLabel} →</span>
                <img src={bannerImage(b)} alt="" className="pointer-events-none absolute -bottom-6 -right-6 h-36 opacity-80 transition group-hover:scale-105" />
              </Link>
            );
          })}
        </section>
      )}

      <ProductRail title="Destacados" products={data?.featured} loading={isLoading} href="/buscar?featured=true" testId="home-featured" />
      <ProductRail title="Novedades" products={data?.newArrivals} loading={isLoading} href="/buscar?sort=newest" testId="home-new" />
      <ProductRail title="Los más vendidos" products={data?.bestSellers} loading={isLoading} href="/buscar?sort=popularity" testId="home-bestsellers" />
      <ProductRail title="Mejor valorados" products={data?.topRated} loading={isLoading} href="/buscar?sort=rating" testId="home-toprated" />
      <TrustBar />
    </div>
  );
}
