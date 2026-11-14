import { Search } from 'lucide-react';
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { cn } from '../../lib/cn';
import { formatPrice } from '../../lib/format';
import { useSuggestions } from '../../lib/queries';

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

/** Search combobox with debounced suggestions (ARIA 1.2 combobox pattern). */
export function SearchBox({ className }: { className?: string }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [value, setValue] = useState(params.get('q') ?? '');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const debounced = useDebounced(value, 250);
  const { data, isFetching } = useSuggestions(debounced);
  const listId = useId();
  const wrapperRef = useRef<HTMLFormElement>(null);

  const options = [
    ...(data?.products ?? []).map((p) => ({ key: `p-${p.id}`, to: `/producto/${p.slug}`, label: p.name, meta: formatPrice(p.priceCents), image: p.imageUrl, type: 'Producto' })),
    ...(data?.categories ?? []).map((c) => ({ key: `c-${c.id}`, to: `/categoria/${c.slug}`, label: c.name, meta: 'Categoría', image: undefined, type: 'Categoría' })),
    ...(data?.brands ?? []).map((b) => ({ key: `b-${b.id}`, to: `/buscar?brand=${b.slug}`, label: b.name, meta: 'Marca', image: undefined, type: 'Marca' })),
  ];
  const showList = open && debounced.trim().length >= 2 && (options.length > 0 || !isFetching);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const go = (to: string) => {
    setOpen(false);
    setActive(-1);
    navigate(to);
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const q = value.trim();
    if (active >= 0 && options[active]) return go(options[active].to);
    go(q ? `/buscar?q=${encodeURIComponent(q)}` : '/buscar');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, options.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, -1));
    } else if (e.key === 'Escape') {
      setOpen(false);
      setActive(-1);
    }
  };

  return (
    <form ref={wrapperRef} role="search" onSubmit={onSubmit} className={cn('relative', className)}>
      <label htmlFor="site-search" className="sr-only">
        Buscar productos
      </label>
      <input
        id="site-search"
        type="search"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 && options[active] ? `${listId}-${active}` : undefined}
        autoComplete="off"
        placeholder="Busca portátiles, gráficas, móviles…"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        className="h-11 w-full rounded-xl border-0 bg-white pl-4 pr-12 text-sm text-slate-900 shadow-inner ring-1 ring-white/10 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-accent-400"
        data-testid="search-input"
        maxLength={100}
      />
      <button type="submit" className="absolute right-1 top-1 flex h-9 w-10 items-center justify-center rounded-lg bg-accent-500 text-slate-950 hover:bg-accent-400" aria-label="Buscar" data-testid="search-submit">
        <Search className="h-4 w-4" />
      </button>
      {showList && (
        <ul id={listId} role="listbox" aria-label="Sugerencias" className="absolute left-0 right-0 top-12 z-40 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-pop" data-testid="search-suggestions">
          {options.length === 0 && <li className="px-4 py-3 text-sm text-slate-500">Sin sugerencias para “{debounced}”</li>}
          {options.map((o, i) => (
            <li
              key={o.key}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={cn('flex cursor-pointer items-center gap-3 px-3 py-2 text-sm', i === active ? 'bg-brand-50' : 'hover:bg-slate-50')}
              onMouseDown={(e) => {
                e.preventDefault();
                go(o.to);
              }}
              onMouseEnter={() => setActive(i)}
              data-testid="search-suggestion"
            >
              {o.image ? <img src={o.image} alt="" className="h-9 w-9 rounded-lg bg-slate-50 object-contain" /> : <span className="h-9 w-9 rounded-lg bg-slate-100" />}
              <span className="flex-1 truncate text-slate-800">{o.label}</span>
              <span className="text-xs text-slate-500">{o.meta}</span>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
