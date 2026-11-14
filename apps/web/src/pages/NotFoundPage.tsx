import { Compass, ShieldAlert } from 'lucide-react';
import { ButtonLink } from '../components/ui/Button';
import { useDocumentTitle } from './useDocumentTitle';

export function NotFoundPage() {
  useDocumentTitle('Página no encontrada');
  return (
    <div className="container-page flex flex-col items-center py-24 text-center" data-testid="not-found">
      <div className="mb-6 rounded-3xl bg-brand-50 p-6 text-brand-600">
        <Compass className="h-12 w-12" />
      </div>
      <p className="text-sm font-semibold uppercase tracking-widest text-brand-600">Error 404</p>
      <h1 className="mt-2 text-3xl font-extrabold tracking-tight">No encontramos esta página</h1>
      <p className="mt-2 max-w-md text-slate-600">Es posible que el enlace sea incorrecto o que el contenido ya no esté disponible.</p>
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
      <div className="mb-6 rounded-3xl bg-rose-50 p-6 text-rose-600">
        <ShieldAlert className="h-12 w-12" />
      </div>
      <p className="text-sm font-semibold uppercase tracking-widest text-rose-600">Error 403</p>
      <h1 className="mt-2 text-3xl font-extrabold tracking-tight">No tienes permiso para ver esta página</h1>
      <p className="mt-2 max-w-md text-slate-600">Esta sección está reservada a otro tipo de usuario.</p>
      <ButtonLink to="/" className="mt-8">
        Volver a la tienda
      </ButtonLink>
    </div>
  );
}
