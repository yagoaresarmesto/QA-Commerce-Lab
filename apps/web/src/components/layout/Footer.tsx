import { CreditCard, Headset, RotateCcw, ShieldCheck, Truck } from 'lucide-react';
import { Link } from 'react-router';
import { Logo } from './Header';

const columns = [
  {
    title: 'Shop',
    links: [
      ['Deals', '/deals'],
      ['Laptops', '/category/laptops'],
      ['Components', '/category/components'],
      ['Smartphones', '/category/smartphones'],
      ['New arrivals', '/search?sort=newest'],
    ],
  },
  {
    title: 'Help',
    links: [
      ['Shipping & delivery', '/info/shipping'],
      ['Returns', '/info/returns'],
      ['Payment methods', '/info/payments'],
      ['Warranty', '/info/warranty'],
      ['Contact', '/info/contact'],
    ],
  },
  {
    title: 'QA Commerce Lab',
    links: [
      ['About the project', '/info/about'],
      ['Terms & conditions', '/info/terms'],
      ['Privacy', '/info/privacy'],
      ['API documentation', '/api/docs'],
    ],
  },
];

export function TrustBar() {
  const items = [
    [Truck, 'Free shipping', 'On orders over €99'],
    [RotateCcw, 'Easy returns', '14 days to return'],
    [ShieldCheck, 'Secure payment', 'Payment simulator*'],
    [Headset, 'Expert support', 'We help you choose'],
  ] as const;
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-5 rounded-4xl bg-slate-50 px-6 py-6 lg:grid-cols-4 lg:px-8" data-testid="trust-bar">
      {items.map(([Icon, title, text]) => (
        <div key={title} className="flex items-center gap-3.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-slate-950 shadow-card ring-1 ring-slate-900/5">
            <Icon className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-950">{title}</p>
            <p className="text-xs text-slate-500">{text}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

export function Footer() {
  return (
    <footer className="mt-24 overflow-hidden rounded-t-[2.5rem] bg-slate-950 text-slate-400">
      <div className="container-page grid gap-12 pb-10 pt-16 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div className="space-y-5">
          <Logo light />
          <p className="max-w-sm text-sm leading-relaxed">
            A <strong className="font-medium text-white">fictional</strong> electronics store built as a professional QA automation lab. Prices, stock,
            orders and payments are simulated.
          </p>
          <p className="flex items-center gap-2 text-xs">
            <CreditCard className="h-4 w-4 text-accent-400" aria-hidden="true" /> Only test cards are accepted
          </p>
        </div>
        {columns.map((col) => (
          <nav key={col.title} aria-label={col.title}>
            <h2 className="mb-4 text-sm font-semibold text-white">{col.title}</h2>
            <ul className="space-y-2.5 text-sm">
              {col.links.map(([label, href]) => (
                <li key={href}>
                  {href.startsWith('/api') ? (
                    <a href={href} className="transition hover:text-white" target="_blank" rel="noreferrer">
                      {label}
                    </a>
                  ) : (
                    <Link to={href} className="transition hover:text-white">
                      {label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="container-page">
        <p className="select-none text-center text-[clamp(3rem,13vw,11rem)] font-semibold leading-none tracking-[-0.06em] text-white/[0.04]" aria-hidden="true">
          QA COMMERCE
        </p>
      </div>
      <div className="border-t border-white/10">
        <div className="container-page flex flex-col gap-2 py-6 text-xs sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} QA Commerce Lab · Educational project with no commercial activity</p>
          <p className="max-w-xl sm:text-right" data-testid="trademark-notice">
            Product and brand names belong to their respective owners and are used for illustrative purposes only, with no affiliation. Prices include VAT ·
            *Simulated payments.
          </p>
        </div>
      </div>
    </footer>
  );
}
