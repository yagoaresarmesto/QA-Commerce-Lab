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
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-900 px-5 py-4 text-white">
        <div>
          <p className="text-xs uppercase tracking-widest text-accent-400">Backoffice</p>
          <p className="text-lg font-bold">Panel de administración</p>
        </div>
        <NavLink to="/" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-white/10">
          <Store className="h-4 w-4" /> Ver tienda
        </NavLink>
      </div>
      <div className="grid gap-6 lg:grid-cols-[13rem_1fr]">
        <nav aria-label="Administración" className="card flex h-fit gap-1 overflow-x-auto p-2 lg:flex-col">
          {NAV.map(([to, label, Icon]) => (
            <NavLink key={to} to={to} end={to === '/admin'} className={({ isActive }) => cn('flex items-center gap-2.5 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-medium', isActive ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100')} data-testid={`admin-nav-${label.toLowerCase()}`}>
              <Icon className="h-4 w-4" /> {label}
            </NavLink>
          ))}
        </nav>
        <div className="min-w-0">
          <Outlet />
        </div>
      </div>
    </div>
  );
}

export function AdminTitle({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
      <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
      {action}
    </div>
  );
}

export function Table({ children, testId }: { children: React.ReactNode; testId?: string }) {
  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[40rem] text-left text-sm" data-testid={testId}>
        {children}
      </table>
    </div>
  );
}

export const th = 'px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 bg-slate-50';
export const td = 'px-4 py-3 align-middle';
