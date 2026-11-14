import { Compass, ShieldAlert } from 'lucide-react';
import { ButtonLink } from '../components/ui/Button';
import { useDocumentTitle } from './useDocumentTitle';

export function NotFoundPage() {
  useDocumentTitle('Página no encontrada');
  return (
    <div className="container-page flex flex-col items-center py-24 text-center" data-testid="not-found">
      <p className="select-none text-[clamp(6rem,22vw,13rem)] font-semibold leading-none tracking-[-0.07em] text-slate-950" aria-hidden="true">
        4<span className="text-brand-500">0</span>4
      </p>
      <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">
        <Compass className="h-3.5 w-3.5" /> Error 404
      </p>
      <h1 className="mt-4 text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">No encontramos esta página</h1>
      <p className="mt-3 max-w-md text-slate-600">Es posible que el enlace sea incorrecto o que el contenido ya no esté disponible.</p>
      <div className="mt-8 flex gap-3">
        <ButtonLink to="/">Volver a la tienda</ButtonLink>
        <ButtonLink to="/ofertas" variant="outline">
          Ver ofertas
        </ButtonLink>
      </div>
    </div>
  );
}

export function ForbiddenPage() {
  useDocumentTitle('Acceso denegado');
  return (
    <div className="container-page flex flex-col items-center py-24 text-center" data-testid="forbidden">
      <div className="mb-6 rounded-full bg-rose-100 p-6 text-rose-600">
        <ShieldAlert className="h-12 w-12" />
      </div>
      <p className="inline-flex rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-rose-700">Error 403</p>
      <h1 className="mt-4 text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">No tienes permiso para ver esta página</h1>
      <p className="mt-3 max-w-md text-slate-600">Esta sección está reservada a otro tipo de usuario.</p>
      <ButtonLink to="/" className="mt-8">
        Volver a la tienda
      </ButtonLink>
    </div>
  );
}
