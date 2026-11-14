import { Boxes, ClipboardList, LayoutDashboard, Store, Tag, Users } from 'lucide-react';
import { NavLink, Outlet } from 'react-router';
import { cn } from '../../lib/cn';

const NAV = [
  ['/admin', 'Dashboard', LayoutDashboard],
  ['/admin/productos', 'Productos', Boxes],
  ['/admin/pedidos', 'Pedidos', ClipboardList],
  ['/admin/usuarios', 'Usuarios', Users],
  ['/admin/cupones', 'Cupones', Tag],
] as const;

export function AdminLayout() {
  return (
    <div className="container-page py-6">
      <div className="grid gap-6 lg:grid-cols-[15rem_1fr] xl:gap-10">
        <aside className="mesh-dark flex h-fit flex-col gap-5 rounded-4xl p-4 text-white lg:sticky lg:top-40 lg:min-h-[32rem] lg:p-5">
          <div className="px-2 pt-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent-400">Backoffice</p>
            <p className="mt-0.5 text-lg font-semibold tracking-tight">Panel de administración</p>
          </div>
          <nav aria-label="Administración" className="flex gap-1 overflow-x-auto lg:flex-col">
            {NAV.map(([to, label, Icon]) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/admin'}
                className={({ isActive }) => cn('flex items-center gap-2.5 whitespace-nowrap rounded-full px-4 py-2.5 text-sm font-medium transition', isActive ? 'bg-white text-slate-950' : 'text-white/70 hover:bg-white/10 hover:text-white')}
                data-testid={`admin-nav-${label.toLowerCase()}`}
              >
                <Icon className="h-4 w-4" /> {label}
              </NavLink>
            ))}
          </nav>
          <NavLink to="/" className="mt-auto hidden items-center gap-2 rounded-full border border-white/15 px-4 py-2.5 text-sm text-white/80 transition hover:bg-white/10 lg:flex">
            <Store className="h-4 w-4" /> Ver tienda
          </NavLink>
        </aside>
        <div className="min-w-0">
          <Outlet />
        </div>
      </div>
    </div>
  );
}

export function AdminTitle({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
      <h1 className="heading-xl">{title}</h1>
      {action}
    </div>
  );
}

export function Table({ children, testId }: { children: React.ReactNode; testId?: string }) {
  return (
    <div className="overflow-x-auto rounded-3xl border border-slate-200/80 bg-white">
      <table className="w-full min-w-[40rem] text-left text-sm" data-testid={testId}>
        {children}
      </table>
    </div>
  );
}

export const th = 'px-4 py-3.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500 bg-slate-50';
export const td = 'px-4 py-3.5 align-middle';
