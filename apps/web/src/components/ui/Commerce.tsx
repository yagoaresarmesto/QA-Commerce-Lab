import { ChevronLeft, ChevronRight, Minus, Plus, Star } from 'lucide-react';
import { Link } from 'react-router';
import { cn } from '../../lib/cn';
import { formatPrice } from '../../lib/format';
import type { Availability } from '../../lib/types';

export function Price({ cents, compareAt, size = 'md', className }: { cents: number; compareAt?: number | null; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const sizes = { sm: 'text-base', md: 'text-lg', lg: 'text-4xl' };
  return (
    <div className={cn('flex flex-wrap items-baseline gap-x-2', className)}>
      <span className={cn('font-semibold tracking-[-0.02em] text-slate-950 tabular-nums', sizes[size])} data-testid="price">
        {formatPrice(cents)}
      </span>
      {compareAt && compareAt > cents && (
        <span className="text-sm text-slate-400 line-through tabular-nums" data-testid="compare-at-price">
          <span className="sr-only">Precio anterior: </span>
          {formatPrice(compareAt)}
        </span>
      )}
    </div>
  );
}

export function Rating({ value, count, size = 'sm', showValue = false }: { value: number; count?: number; size?: 'sm' | 'md'; showValue?: boolean }) {
  const px = size === 'sm' ? 'h-3.5 w-3.5' : 'h-5 w-5';
  return (
    <div className="flex items-center gap-1" aria-label={`Valoración ${value.toFixed(1)} de 5${count !== undefined ? `, ${count} reseñas` : ''}`} role="img">
      <div className="flex">
        {[1, 2, 3, 4, 5].map((i) => (
          <Star key={i} className={cn(px, i <= Math.round(value) ? 'fill-amber-400 text-amber-400' : 'fill-slate-200 text-slate-200')} aria-hidden="true" />
        ))}
      </div>
      {showValue && <span className="text-sm font-semibold text-slate-800">{value.toFixed(1)}</span>}
      {count !== undefined && <span className="text-xs text-slate-500">({count})</span>}
    </div>
  );
}

const availabilityInfo: Record<Availability, { label: string; className: string }> = {
  IN_STOCK: { label: 'En stock', className: 'text-emerald-700' },
  LOW_STOCK: { label: 'Últimas unidades', className: 'text-amber-700' },
  OUT_OF_STOCK: { label: 'Agotado', className: 'text-rose-700' },
  DISCONTINUED: { label: 'Descatalogado', className: 'text-slate-500' },
};

export function AvailabilityLabel({
  availability,
  stock,
  className,
  compact = false,
}: {
  availability: Availability;
  stock?: number;
  className?: string;
  /** Short label for dense layouts (product cards) */
  compact?: boolean;
}) {
  const info = availabilityInfo[availability];
  const lowStock = availability === 'LOW_STOCK' && stock !== undefined;
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap text-sm font-medium', info.className, className)} data-testid="availability" data-availability={availability}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
      {compact && lowStock ? `Quedan ${stock}` : info.label}
      {!compact && lowStock && <span className="font-normal">· quedan {stock}</span>}
    </span>
  );
}

export function QuantityStepper({
  value,
  min = 1,
  max,
  onChange,
  disabled,
  label = 'Cantidad',
  testId = 'quantity',
}: {
  value: number;
  min?: number;
  max: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  label?: string;
  testId?: string;
}) {
  return (
    <div className="inline-flex items-center rounded-full border border-slate-200 bg-white" role="group" aria-label={label} data-testid={testId}>
      <button
        type="button"
        className="flex h-11 w-11 items-center justify-center rounded-full text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-300"
        onClick={() => onChange(value - 1)}
        disabled={disabled || value <= min}
        aria-label="Disminuir cantidad"
        data-testid={`${testId}-decrease`}
      >
        <Minus className="h-4 w-4" />
      </button>
      <output className="w-10 text-center text-sm font-semibold tabular-nums" aria-live="polite" data-testid={`${testId}-value`}>
        {value}
      </output>
      <button
        type="button"
        className="flex h-11 w-11 items-center justify-center rounded-full text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-300"
        onClick={() => onChange(value + 1)}
        disabled={disabled || value >= max}
        aria-label="Aumentar cantidad"
        data-testid={`${testId}-increase`}
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}

export function Pagination({ page, totalPages, onPage }: { page: number; totalPages: number; onPage: (p: number) => void }) {
  if (totalPages <= 1) return null;
  const pages: Array<number | '…'> = [];
  for (let p = 1; p <= totalPages; p++) {
    if (p === 1 || p === totalPages || Math.abs(p - page) <= 1) pages.push(p);
    else if (pages[pages.length - 1] !== '…') pages.push('…');
  }
  const btn = 'flex h-10 min-w-10 items-center justify-center rounded-full px-3 text-sm font-semibold transition';
  return (
    <nav className="flex flex-wrap items-center justify-center gap-1.5" aria-label="Paginación" data-testid="pagination">
      <button className={cn(btn, 'text-slate-700 hover:bg-slate-100 disabled:text-slate-300')} onClick={() => onPage(page - 1)} disabled={page <= 1} aria-label="Página anterior">
        <ChevronLeft className="h-4 w-4" />
      </button>
      {pages.map((p, i) =>
        p === '…' ? (
          <span key={`gap-${i}`} className="px-2 text-slate-400">
            …
          </span>
        ) : (
          <button
            key={p}
            className={cn(btn, p === page ? 'bg-slate-950 text-white' : 'text-slate-700 hover:bg-slate-100')}
            onClick={() => onPage(p)}
            aria-current={p === page ? 'page' : undefined}
            aria-label={`Página ${p}`}
          >
            {p}
          </button>
        ),
      )}
      <button className={cn(btn, 'text-slate-700 hover:bg-slate-100 disabled:text-slate-300')} onClick={() => onPage(page + 1)} disabled={page >= totalPages} aria-label="Página siguiente">
        <ChevronRight className="h-4 w-4" />
      </button>
    </nav>
  );
}

export function Breadcrumbs({ items }: { items: Array<{ label: string; to?: string }> }) {
  return (
    <nav aria-label="Ruta de navegación" className="mb-5 text-[13px] text-slate-500" data-testid="breadcrumbs">
      <ol className="flex flex-wrap items-center gap-1.5">
        <li>
          <Link to="/" className="hover:text-slate-950">
            Inicio
          </Link>
        </li>
        {items.map((item, i) => (
          <li key={`${item.label}-${i}`} className="flex items-center gap-1.5">
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            {item.to && i < items.length - 1 ? (
              <Link to={item.to} className="hover:text-slate-950">
                {item.label}
              </Link>
            ) : (
              <span aria-current="page" className="font-medium text-slate-900">
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
