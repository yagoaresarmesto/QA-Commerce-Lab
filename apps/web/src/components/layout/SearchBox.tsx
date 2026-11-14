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
    ...(data?.products ?? []).map((p) => ({ key: `p-${p.id}`, to: `/product/${p.slug}`, label: p.name, meta: formatPrice(p.priceCents), image: p.imageUrl, type: 'Product' })),
    ...(data?.categories ?? []).map((c) => ({ key: `c-${c.id}`, to: `/category/${c.slug}`, label: c.name, meta: 'Category', image: undefined, type: 'Category' })),
    ...(data?.brands ?? []).map((b) => ({ key: `b-${b.id}`, to: `/search?brand=${b.slug}`, label: b.name, meta: 'Brand', image: undefined, type: 'Brand' })),
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
    go(q ? `/search?q=${encodeURIComponent(q)}` : '/search');
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
        Search products
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
        placeholder="Search laptops, graphics cards, phones…"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        className="h-11 w-full rounded-full border border-transparent bg-slate-100 pl-11 pr-14 text-sm text-slate-900 transition placeholder:text-slate-500 hover:bg-slate-200/70 focus:border-slate-200 focus:bg-white focus:outline-none focus:ring-4 focus:ring-brand-100"
        data-testid="search-input"
        maxLength={100}
      />
      <Search className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-500" aria-hidden="true" />
      <button type="submit" className="absolute right-1 top-1 flex h-9 items-center justify-center rounded-full bg-slate-950 px-3.5 text-xs font-semibold text-white transition hover:bg-brand-600" aria-label="Search" data-testid="search-submit">
        Search
      </button>
      {showList && (
        <ul id={listId} role="listbox" aria-label="Suggestions" className="absolute left-0 right-0 top-[3.25rem] z-40 overflow-hidden rounded-3xl border border-slate-200/80 bg-white p-2 shadow-pop" data-testid="search-suggestions">
          {options.length === 0 && <li className="px-4 py-3 text-sm text-slate-500">No suggestions for “{debounced}”</li>}
          {options.map((o, i) => (
            <li
              key={o.key}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={cn('flex cursor-pointer items-center gap-3 rounded-2xl px-2.5 py-2 text-sm', i === active ? 'bg-slate-100' : 'hover:bg-slate-50')}
              onMouseDown={(e) => {
                e.preventDefault();
                go(o.to);
              }}
              onMouseEnter={() => setActive(i)}
              data-testid="search-suggestion"
            >
              {o.image ? <img src={o.image} alt="" className="tile h-10 w-10 rounded-xl object-contain p-0.5" /> : <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-[10px] font-semibold uppercase text-slate-500">{o.type.slice(0, 3)}</span>}
              <span className="flex-1 truncate text-slate-800">{o.label}</span>
              <span className="text-xs font-medium text-slate-500 tabular-nums">{o.meta}</span>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
