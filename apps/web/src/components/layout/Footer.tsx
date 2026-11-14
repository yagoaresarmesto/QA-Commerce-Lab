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
    [ShieldCheck, 'Pago seguro', 'Simulador de pagos certificado*'],
    [Headset, 'Atención experta', 'Te asesoramos en tu compra'],
  ] as const;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="trust-bar">
      {items.map(([Icon, title, text]) => (
        <div key={title} className="card flex items-center gap-3 p-4">
          <div className="rounded-xl bg-brand-50 p-2.5 text-brand-600">
            <Icon className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">{title}</p>
            <p className="text-xs text-slate-500">{text}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

export function Footer() {
  return (
    <footer className="mt-16 bg-slate-950 text-slate-400">
      <div className="container-page grid gap-10 py-12 md:grid-cols-4">
        <div className="space-y-4">
          <Logo />
          <p className="text-sm">
            Tienda de electrónica <strong className="text-slate-200">ficticia</strong> creada como laboratorio profesional de QA Automation. Los productos, marcas,
            precios y pagos son simulados.
          </p>
          <div className="flex items-center gap-2 text-xs">
            <CreditCard className="h-4 w-4" aria-hidden="true" /> Solo se aceptan tarjetas de prueba
          </div>
        </div>
        {columns.map((col) => (
          <nav key={col.title} aria-label={col.title}>
            <h2 className="mb-3 text-sm font-semibold text-white">{col.title}</h2>
            <ul className="space-y-2 text-sm">
              {col.links.map(([label, href]) => (
                <li key={href}>
                  {href.startsWith('/api') ? (
                    <a href={href} className="hover:text-white" target="_blank" rel="noreferrer">
                      {label}
                    </a>
                  ) : (
                    <Link to={href} className="hover:text-white">
                      {label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-white/10">
        <div className="container-page flex flex-col gap-2 py-5 text-xs sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} QA Commerce Lab · Proyecto educativo sin actividad comercial</p>
          <p>Precios con IVA incluido · *Pagos 100% simulados</p>
        </div>
      </div>
    </footer>
  );
}
