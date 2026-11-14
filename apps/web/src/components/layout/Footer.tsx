import { CreditCard, Headset, RotateCcw, ShieldCheck, Truck } from 'lucide-react';
import { Link } from 'react-router';
import { Logo } from './Header';

const columns = [
  {
    title: 'Comprar',
    links: [
      ['Ofertas', '/ofertas'],
      ['Portátiles', '/categoria/portatiles'],
      ['Componentes', '/categoria/componentes'],
      ['Smartphones', '/categoria/smartphones'],
      ['Novedades', '/buscar?sort=newest'],
    ],
  },
  {
    title: 'Ayuda',
    links: [
      ['Envíos y entregas', '/info/envios'],
      ['Devoluciones', '/info/devoluciones'],
      ['Métodos de pago', '/info/pagos'],
      ['Garantía', '/info/garantia'],
      ['Contacto', '/info/contacto'],
    ],
  },
  {
    title: 'QA Commerce Lab',
    links: [
      ['Sobre el proyecto', '/info/sobre-nosotros'],
      ['Términos y condiciones', '/info/terminos'],
      ['Privacidad', '/info/privacidad'],
      ['Documentación API', '/api/docs'],
    ],
  },
];

export function TrustBar() {
  const items = [
    [Truck, 'Envío gratis', 'En pedidos desde 99 €'],
    [RotateCcw, 'Devolución fácil', '14 días para devolver'],
    [ShieldCheck, 'Pago seguro', 'Simulador de pagos*'],
    [Headset, 'Atención experta', 'Te asesoramos en tu compra'],
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
            Tienda de electrónica <strong className="font-medium text-white">ficticia</strong> creada como laboratorio profesional de QA Automation. Precios, stock,
            pedidos y pagos son simulados.
          </p>
          <p className="flex items-center gap-2 text-xs">
            <CreditCard className="h-4 w-4 text-accent-400" aria-hidden="true" /> Solo se aceptan tarjetas de prueba
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
          <p>© {new Date().getFullYear()} QA Commerce Lab · Proyecto educativo sin actividad comercial</p>
          <p className="max-w-xl sm:text-right" data-testid="trademark-notice">
            Los nombres de productos y marcas pertenecen a sus respectivos propietarios y se usan con fines ilustrativos, sin afiliación. Precios con IVA incluido ·
            *Pagos simulados.
          </p>
        </div>
      </div>
    </footer>
  );
}
