import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Boxes, ClipboardList, Euro, PackageX, RotateCcw, Truck, Users } from 'lucide-react';
import { Link } from 'react-router';
import { OrderStatusBadge } from '../../components/checkout/OrderView';
import { ErrorState, Skeleton } from '../../components/ui/Feedback';
import { http } from '../../lib/api';
import { formatDate, formatPrice, ORDER_STATUS_LABEL } from '../../lib/format';
import type { Dashboard } from '../../lib/types';
import { useDocumentTitle } from '../useDocumentTitle';
import { AdminTitle, Table, td, th } from './AdminLayout';

function SalesChart({ data }: { data: Dashboard['salesLast14Days'] }) {
  const max = Math.max(1, ...data.map((d) => d.revenueCents));
  return (
    <figure className="card p-5" data-testid="sales-chart">
      <figcaption className="mb-4 text-lg font-semibold tracking-tight">Ventas últimos 14 días</figcaption>
      <div className="flex h-40 items-end gap-1.5" role="img" aria-label="Gráfico de barras de ventas diarias">
        {data.map((d) => (
          <div key={d.date} className="group relative flex h-full flex-1 flex-col items-center justify-end" data-testid="sales-bar" data-date={d.date} data-revenue={d.revenueCents}>
            <div className="w-full rounded-t-md bg-slate-950 transition group-hover:bg-brand-500" style={{ height: `${Math.max(2, (d.revenueCents / max) * 100)}%` }} />
            <span className="pointer-events-none absolute -top-8 hidden whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-xs text-white group-hover:block">
              {formatPrice(d.revenueCents)} · {d.orders} ped.
            </span>
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-xs text-slate-500">
        <span>{formatDate(data[0]?.date)}</span>
        <span>{formatDate(data.at(-1)?.date)}</span>
      </div>
    </figure>
  );
}

export function AdminDashboardPage() {
  useDocumentTitle('Admin · Dashboard');
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['admin', 'dashboard'], queryFn: () => http.get<Dashboard>('/admin/dashboard') });
  if (isError) return <ErrorState onRetry={() => refetch()} />;
  if (isLoading || !data) return <Skeleton className="h-96" />;
  const t = data.totals;
  const kpis = [
    ['Ventas', formatPrice(t.revenueCents), Euro, `Ticket medio ${formatPrice(t.averageOrderCents)}`],
    ['Pedidos', t.orders, ClipboardList, `${t.pendingOrders} pendientes de pago`],
    ['Por enviar', t.ordersToShip, Truck, 'Pagados o en preparación'],
    ['Devoluciones', t.returnRequests, RotateCcw, 'Solicitudes por revisar'],
    ['Usuarios', t.users, Users, `${t.customers} clientes`],
    ['Productos', t.products, Boxes, `${t.activeProducts} activos`],
    ['Sin stock', t.outOfStockProducts, PackageX, 'Productos activos agotados'],
    ['Stock bajo', t.lowStockProducts, AlertTriangle, '5 unidades o menos'],
  ] as const;
  return (
    <div className="space-y-6">
      <AdminTitle title="Dashboard" />
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4" data-testid="kpis">
        {kpis.map(([label, value, Icon, hint]) => (
          <div key={label} className="card p-5" data-testid={`kpi-${label.toLowerCase().replace(/\s/g, '-')}`}>
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-slate-500">{label}</p>
              <span className="rounded-xl bg-slate-100 p-2 text-slate-950"><Icon className="h-4 w-4" /></span>
            </div>
            <p className="mt-3 text-3xl font-semibold tracking-tight" data-testid="kpi-value">{value}</p>
            <p className="mt-1 text-xs text-slate-500">{hint}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <SalesChart data={data.salesLast14Days} />
        <div className="card p-6">
          <p className="mb-3 text-lg font-semibold tracking-tight">Pedidos por estado</p>
          <ul className="space-y-2 text-sm">
            {data.ordersByStatus.map((s) => (
              <li key={s.status} className="flex justify-between">
                <Link to={`/admin/pedidos?status=${s.status}`} className="text-slate-700 hover:text-slate-950 hover:underline">{ORDER_STATUS_LABEL[s.status]}</Link>
                <span className="font-semibold">{s.count}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <section className="min-w-0">
          <h2 className="mb-3 text-lg font-semibold tracking-tight">Pedidos recientes</h2>
          <Table testId="recent-orders">
            <thead><tr><th className={th}>Pedido</th><th className={th}>Cliente</th><th className={th}>Estado</th><th className={th}>Total</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {data.recentOrders.map((o) => (
                <tr key={o.id}>
                  <td className={td}><Link to={`/admin/pedidos/${o.id}`} className="whitespace-nowrap font-mono font-semibold text-slate-950 underline-offset-2 hover:underline">{o.orderNumber}</Link></td>
                  <td className={td}>{o.customer.email}</td>
                  <td className={td}><OrderStatusBadge status={o.status} /></td>
                  <td className={td}>{formatPrice(o.totalCents)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </section>
        <section className="min-w-0 space-y-6">
          <div className="card p-6">
            <h2 className="mb-3 text-lg font-semibold tracking-tight">Alertas de stock</h2>
            <ul className="space-y-2 text-sm" data-testid="low-stock-list">
              {data.lowStock.map((p) => (
                <li key={p.id} className="flex justify-between gap-2">
                  <Link to={`/admin/productos/${p.id}`} className="truncate text-slate-700 hover:text-slate-950 hover:underline">{p.name}</Link>
                  <span className={p.stock === 0 ? 'font-semibold text-rose-600' : 'font-semibold text-amber-600'}>{p.stock}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="card p-6">
            <h2 className="mb-3 text-lg font-semibold tracking-tight">Más vendidos</h2>
            <ol className="list-decimal space-y-1 pl-5 text-sm">
              {data.topProducts.map((p) => <li key={p.id}><span className="text-slate-700">{p.name}</span> <span className="text-slate-400">({p.salesCount})</span></li>)}
            </ol>
          </div>
        </section>
      </div>
    </div>
  );
}
