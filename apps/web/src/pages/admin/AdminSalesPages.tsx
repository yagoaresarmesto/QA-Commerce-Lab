import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { OrderInfo, OrderItems, OrderPayments, OrderStatusBadge, OrderTimeline, OrderTotals, PaymentStatusBadge } from '../../components/checkout/OrderView';
import { Button } from '../../components/ui/Button';
import { Pagination } from '../../components/ui/Commerce';
import { Alert, Badge, ErrorState, Skeleton } from '../../components/ui/Feedback';
import { Checkbox, Input, Select } from '../../components/ui/Field';
import { ConfirmDialog, Modal } from '../../components/ui/Modal';
import { ApiError, errorMessage, http } from '../../lib/api';
import { centsToEuros, eurosToCents, formatDate, formatDateTime, formatPrice, ORDER_STATUS_LABEL, PAYMENT_STATUS_LABEL } from '../../lib/format';
import { useCategories } from '../../lib/queries';
import type { AdminCoupon, AdminOrder, AdminOrderSummary, AdminUser, CouponType, OrderPaymentStatus, OrderStatus, Paginated } from '../../lib/types';
import { useDocumentTitle } from '../useDocumentTitle';
import { AdminTitle, Table, td, th } from './AdminLayout';

// ─── Orders ──────────────────────────────────────────────────────────────

export function AdminOrdersPage() {
  useDocumentTitle('Admin · Orders');
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get('q') ?? '');
  const query = { status: params.get('status') ?? undefined, paymentStatus: params.get('paymentStatus') ?? undefined, q: params.get('q') ?? undefined, from: params.get('from') ?? undefined, to: params.get('to') ?? undefined, sort: params.get('sort') ?? 'newest', page: Number(params.get('page') ?? 1), pageSize: 20 };
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['admin', 'orders', query], queryFn: () => http.get<Paginated<AdminOrderSummary>>('/admin/orders', { query }) });
  const set = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    if (k !== 'page') next.delete('page');
    setParams(next);
  };
  return (
    <div>
      <AdminTitle title="Orders" />
      <div className="mb-5 grid gap-3 rounded-3xl bg-slate-50 p-4 md:grid-cols-6">
        <form className="md:col-span-2" onSubmit={(e: FormEvent) => { e.preventDefault(); set('q', search.trim() || null); }}>
          <Input label="Search" placeholder="Order number or e-mail" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="admin-order-search" />
        </form>
        <Select label="Status" value={query.status ?? ''} onChange={(e) => set('status', e.target.value || null)} data-testid="admin-order-status-filter">
          <option value="">All</option>
          {(Object.keys(ORDER_STATUS_LABEL) as OrderStatus[]).map((s) => <option key={s} value={s}>{ORDER_STATUS_LABEL[s]}</option>)}
        </Select>
        <Select label="Payment" value={query.paymentStatus ?? ''} onChange={(e) => set('paymentStatus', e.target.value || null)}>
          <option value="">All</option>
          {(Object.keys(PAYMENT_STATUS_LABEL) as OrderPaymentStatus[]).map((s) => <option key={s} value={s}>{PAYMENT_STATUS_LABEL[s]}</option>)}
        </Select>
        <Input label="From" type="date" value={query.from ?? ''} onChange={(e) => set('from', e.target.value || null)} />
        <Input label="To" type="date" value={query.to ?? ''} onChange={(e) => set('to', e.target.value || null)} />
      </div>
      {isError && <ErrorState onRetry={() => refetch()} />}
      {isLoading ? <Skeleton className="h-96" /> : (
        <Table testId="admin-orders-table">
          <thead><tr><th className={th}>Order</th><th className={th}>Date</th><th className={th}>Customer</th><th className={th}>Status</th><th className={th}>Payment</th><th className={th}>Total</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {data?.data.map((o) => (
              <tr key={o.id} data-testid="admin-order-row" data-order-id={o.id}>
                <td className={td}><Link to={`/admin/orders/${o.id}`} className="whitespace-nowrap font-mono font-semibold text-slate-950 underline-offset-2 hover:underline">{o.orderNumber}</Link></td>
                <td className={td}>{formatDateTime(o.createdAt)}</td>
                <td className={td}>{o.customer.email}</td>
                <td className={td}><OrderStatusBadge status={o.status} /></td>
                <td className={td}><PaymentStatusBadge status={o.paymentStatus} /></td>
                <td className={`${td} font-semibold`}>{formatPrice(o.totalCents)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {data && <div className="mt-4"><Pagination page={data.meta.page} totalPages={data.meta.totalPages} onPage={(p) => set('page', String(p))} /></div>}
      {data && <p className="mt-2 text-center text-xs text-slate-500">{data.meta.total} pedidos</p>}
    </div>
  );
}

export function AdminOrderDetailPage() {
  const { id } = useParams();
  const qc = useQueryClient();
  const { data: order, isLoading, error } = useQuery({ queryKey: ['admin', 'order', id], queryFn: () => http.get<AdminOrder>(`/admin/orders/${id}`) });
  useDocumentTitle(order ? `Admin · ${order.orderNumber}` : 'Admin · Order');
  const [status, setStatus] = useState<OrderStatus | ''>('');
  const [note, setNote] = useState('');
  const [tracking, setTracking] = useState('');
  const [confirmPay, setConfirmPay] = useState(false);
  const onUpdated = (o: AdminOrder) => {
    qc.setQueryData(['admin', 'order', id], o);
    void qc.invalidateQueries({ queryKey: ['admin', 'orders'] });
    void qc.invalidateQueries({ queryKey: ['admin', 'dashboard'] });
  };
  const update = useMutation({
    mutationFn: () => http.patch<AdminOrder>(`/admin/orders/${id}/status`, { status, note: note || undefined, trackingNumber: tracking || undefined }),
    onSuccess: (o) => {
      toast.success(`Order updated: ${ORDER_STATUS_LABEL[o.status]}`);
      setStatus('');
      setNote('');
      setTracking('');
      onUpdated(o);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const confirmPayment = useMutation({
    mutationFn: () => http.post<AdminOrder>(`/admin/orders/${id}/confirm-payment`),
    onSuccess: (o) => {
      toast.success('Bank transfer confirmed');
      setConfirmPay(false);
      onUpdated(o);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (error) return <ErrorState message={errorMessage(error)} />;
  if (isLoading || !order) return <Skeleton className="h-96" />;
  return (
    <div className="space-y-5" data-testid="admin-order-detail" data-order-status={order.status}>
      <AdminTitle title={`Order ${order.orderNumber}`} action={<Link to="/admin/orders" className="text-sm text-slate-500">← Orders</Link>} />
      <div className="flex flex-wrap items-center gap-2">
        <OrderStatusBadge status={order.status} /> <PaymentStatusBadge status={order.paymentStatus} />
        {order.testRunId && <Badge tone="violet">run: {order.testRunId}</Badge>}
        <span className="text-sm text-slate-500">Created {formatDateTime(order.createdAt)} · Customer <Link to={`/admin/users?q=${encodeURIComponent(order.customer.email)}`} className="font-semibold text-slate-950 underline-offset-2 hover:underline">{order.customer.email}</Link></span>
      </div>
      <section className="card space-y-4 p-5" aria-label="Order management">
        <h2 className="text-lg font-semibold tracking-tight">Manage order</h2>
        {order.canConfirmPayment && (
          <Alert tone="warning" title="Pending bank transfer">
            <Button size="sm" className="mt-2" onClick={() => setConfirmPay(true)} data-testid="confirm-payment">Mark transfer as received</Button>
          </Alert>
        )}
        {order.allowedTransitions.length === 0 ? (
          <p className="text-sm text-slate-500">This order does not allow further status changes.</p>
        ) : (
          <form className="grid gap-3 md:grid-cols-4" onSubmit={(e) => { e.preventDefault(); if (status) update.mutate(); }}>
            <Select label="New status" value={status} onChange={(e) => setStatus(e.target.value as OrderStatus)} data-testid="admin-status-select">
              <option value="">Select…</option>
              {order.allowedTransitions.map((s) => <option key={s} value={s}>{ORDER_STATUS_LABEL[s]}</option>)}
            </Select>
            <Input label="Internal note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} wrapperClassName="md:col-span-2" />
            {status === 'SHIPPED' && <Input label="Tracking number" placeholder="Generated automatically if left empty" value={tracking} onChange={(e) => setTracking(e.target.value.toUpperCase())} />}
            <div className="flex items-end md:col-start-4"><Button type="submit" disabled={!status} loading={update.isPending} className="w-full" data-testid="admin-status-submit">Update status</Button></div>
          </form>
        )}
      </section>
      <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-5">
          <section className="card p-6"><h2 className="mb-2 text-lg font-semibold tracking-tight">Products</h2><OrderItems order={order} /></section>
          <section className="card p-6"><h2 className="mb-3 text-lg font-semibold tracking-tight">Delivery</h2><OrderInfo order={order} /></section>
          <section className="card p-6"><h2 className="mb-3 text-lg font-semibold tracking-tight">Payments</h2><OrderPayments order={order} /></section>
          {order.customerNote && <section className="card p-6"><h2 className="mb-2 text-lg font-semibold tracking-tight">Customer note</h2><p className="text-sm text-slate-600">{order.customerNote}</p></section>}
        </div>
        <div className="space-y-5">
          <section className="card p-6"><h2 className="mb-3 text-lg font-semibold tracking-tight">Amount</h2><OrderTotals order={order} /></section>
          <section className="card p-6"><h2 className="mb-3 text-lg font-semibold tracking-tight">History</h2><OrderTimeline order={order} /></section>
        </div>
      </div>
      <ConfirmDialog open={confirmPay} onOpenChange={setConfirmPay} title="Confirm bank transfer" description={`The order will be marked as paid (${formatPrice(order.totalCents)}).`} confirmLabel="Confirm payment" tone="primary" loading={confirmPayment.isPending} onConfirm={() => confirmPayment.mutate()} />
    </div>
  );
}

// ─── Users ───────────────────────────────────────────────────────────────

export function AdminUsersPage() {
  useDocumentTitle('Admin · Users');
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get('q') ?? '');
  const [target, setTarget] = useState<{ user: AdminUser; change: { status?: string; role?: string } } | null>(null);
  const query = { q: params.get('q') ?? undefined, role: params.get('role') ?? undefined, status: params.get('status') ?? undefined, page: Number(params.get('page') ?? 1), pageSize: 20 };
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['admin', 'users', query], queryFn: () => http.get<Paginated<AdminUser>>('/admin/users', { query }) });
  const update = useMutation({
    mutationFn: () => http.patch<AdminUser>(`/admin/users/${target!.user.id}`, target!.change),
    onSuccess: () => {
      toast.success('User updated');
      setTarget(null);
      void qc.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const set = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    if (k !== 'page') next.delete('page');
    setParams(next);
  };
  return (
    <div>
      <AdminTitle title="Users" />
      <div className="mb-5 grid gap-3 rounded-3xl bg-slate-50 p-4 md:grid-cols-4">
        <form className="md:col-span-2" onSubmit={(e: FormEvent) => { e.preventDefault(); set('q', search.trim() || null); }}>
          <Input label="Search" placeholder="E-mail or name" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="admin-user-search" />
        </form>
        <Select label="Role" value={query.role ?? ''} onChange={(e) => set('role', e.target.value || null)}>
          <option value="">All</option><option value="CUSTOMER">Customer</option><option value="ADMIN">Administrator</option>
        </Select>
        <Select label="Status" value={query.status ?? ''} onChange={(e) => set('status', e.target.value || null)}>
          <option value="">All</option><option value="ACTIVE">Active</option><option value="DISABLED">Disabled</option>
        </Select>
      </div>
      {isError && <ErrorState onRetry={() => refetch()} />}
      {isLoading ? <Skeleton className="h-96" /> : (
        <Table testId="admin-users-table">
          <thead><tr><th className={th}>User</th><th className={th}>Role</th><th className={th}>Status</th><th className={th}>Orders</th><th className={th}>Spent</th><th className={th}>Joined</th><th className={th} /></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {data?.data.map((u) => (
              <tr key={u.id} data-testid="admin-user-row" data-user-id={u.id}>
                <td className={td}><p className="font-semibold">{u.firstName} {u.lastName}</p><p className="text-xs text-slate-500">{u.email}</p></td>
                <td className={td}><Badge tone={u.role === 'ADMIN' ? 'violet' : 'slate'}>{u.role === 'ADMIN' ? 'Admin' : 'Customer'}</Badge></td>
                <td className={td}><Badge tone={u.status === 'ACTIVE' ? 'green' : 'red'}>{u.status === 'ACTIVE' ? 'Active' : 'Disabled'}</Badge></td>
                <td className={td}>{u.ordersCount}</td>
                <td className={td}>{formatPrice(u.totalSpentCents)}</td>
                <td className={td}>{formatDate(u.createdAt)}</td>
                <td className={td}>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setTarget({ user: u, change: { status: u.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE' } })} data-testid="toggle-user-status">{u.status === 'ACTIVE' ? 'Disable' : 'Enable'}</Button>
                    <Button size="sm" variant="ghost" onClick={() => setTarget({ user: u, change: { role: u.role === 'ADMIN' ? 'CUSTOMER' : 'ADMIN' } })}>{u.role === 'ADMIN' ? 'Remove admin' : 'Make admin'}</Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {data && <div className="mt-4"><Pagination page={data.meta.page} totalPages={data.meta.totalPages} onPage={(p) => set('page', String(p))} /></div>}
      <ConfirmDialog
        open={!!target}
        onOpenChange={(o) => !o && setTarget(null)}
        title="Confirm change"
        description={target ? `${target.user.email}: ${target.change.status ? (target.change.status === 'DISABLED' ? 'disable the account (their sessions will be signed out)' : 're-enable the account') : target.change.role === 'ADMIN' ? 'grant the administrator role' : 'remove the administrator role'}` : ''}
        confirmLabel="Confirm"
        tone={target?.change.status === 'DISABLED' ? 'danger' : 'primary'}
        loading={update.isPending}
        onConfirm={() => update.mutate()}
      />
    </div>
  );
}

// ─── Coupons ─────────────────────────────────────────────────────────────

const STATE_TONE = { ACTIVE: 'green', INACTIVE: 'slate', SCHEDULED: 'sky', EXPIRED: 'red', EXHAUSTED: 'amber' } as const;
const STATE_LABEL = { ACTIVE: 'Active', INACTIVE: 'Deactivated', SCHEDULED: 'Scheduled', EXPIRED: 'Expired', EXHAUSTED: 'Used up' } as const;
const toDateInput = (iso: string | null) => (iso ? iso.slice(0, 10) : '');

function CouponForm({ coupon, onDone }: { coupon?: AdminCoupon; onDone: () => void }) {
  const qc = useQueryClient();
  const categories = useCategories();
  const [type, setType] = useState<CouponType>(coupon?.type ?? 'PERCENTAGE');
  const [values, setValues] = useState({
    code: coupon?.code ?? '', description: coupon?.description ?? '',
    value: coupon ? (coupon.type === 'FIXED_AMOUNT' ? centsToEuros(coupon.value) : String(coupon.value)) : '',
    min: centsToEuros(coupon?.minSubtotalCents), max: centsToEuros(coupon?.maxDiscountCents), categoryId: coupon?.categoryId ? String(coupon.categoryId) : '',
    startsAt: toDateInput(coupon?.startsAt ?? null), expiresAt: toDateInput(coupon?.expiresAt ?? null), usageLimit: coupon?.usageLimit ? String(coupon.usageLimit) : '',
    perUserLimit: String(coupon?.perUserLimit ?? 1), isActive: coupon?.isActive ?? true,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useMutation({
    mutationFn: () => {
      const body = {
        description: values.description, type,
        value: type === 'FREE_SHIPPING' ? 0 : type === 'FIXED_AMOUNT' ? eurosToCents(values.value) : Number(values.value),
        minSubtotalCents: values.min ? eurosToCents(values.min) : null, maxDiscountCents: values.max ? eurosToCents(values.max) : null,
        categoryId: values.categoryId ? Number(values.categoryId) : null,
        startsAt: values.startsAt ? new Date(values.startsAt).toISOString() : null, expiresAt: values.expiresAt ? new Date(`${values.expiresAt}T23:59:59`).toISOString() : null,
        usageLimit: values.usageLimit ? Number(values.usageLimit) : null, perUserLimit: Number(values.perUserLimit), isActive: values.isActive,
      };
      return coupon ? http.patch(`/admin/coupons/${coupon.id}`, body) : http.post('/admin/coupons', { code: values.code, ...body });
    },
    onSuccess: () => {
      toast.success(coupon ? 'Coupon updated' : 'Coupon created');
      void qc.invalidateQueries({ queryKey: ['admin', 'coupons'] });
      onDone();
    },
    onError: (e) => {
      setErrors(e instanceof ApiError ? e.fieldErrors : {});
      toast.error(errorMessage(e));
    },
  });
  const v = (k: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setValues((s) => ({ ...s, [k]: e.target.value }));
  return (
    <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} noValidate className="grid gap-4 sm:grid-cols-2" data-testid="coupon-form">
      <Input label="Code" required value={values.code} onChange={(e) => setValues((s) => ({ ...s, code: e.target.value.toUpperCase() }))} disabled={!!coupon} error={errors.code} />
      <Select label="Type" value={type} onChange={(e) => setType(e.target.value as CouponType)}>
        <option value="PERCENTAGE">Percentage</option><option value="FIXED_AMOUNT">Fixed amount</option><option value="FREE_SHIPPING">Free shipping</option>
      </Select>
      <Input label="Description" required value={values.description} onChange={v('description')} error={errors.description} wrapperClassName="sm:col-span-2" />
      {type !== 'FREE_SHIPPING' && <Input label={type === 'PERCENTAGE' ? 'Discount (%)' : 'Discount (€)'} required inputMode="decimal" value={values.value} onChange={v('value')} error={errors.value} />}
      <Input label="Minimum order (€)" inputMode="decimal" value={values.min} onChange={v('min')} />
      {type === 'PERCENTAGE' && <Input label="Maximum discount (€)" inputMode="decimal" value={values.max} onChange={v('max')} />}
      <Select label="Category only" value={values.categoryId} onChange={v('categoryId')}>
        <option value="">All</option>
        {categories.data?.flatMap((c) => [c, ...c.children]).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </Select>
      <Input label="Valid from" type="date" value={values.startsAt} onChange={v('startsAt')} />
      <Input label="Valid until" type="date" value={values.expiresAt} onChange={v('expiresAt')} error={errors.expiresAt} />
      <Input label="Total usage limit" type="number" min={1} value={values.usageLimit} onChange={v('usageLimit')} hint="Empty = unlimited" />
      <Input label="Uses per customer" type="number" min={1} value={values.perUserLimit} onChange={v('perUserLimit')} />
      <Checkbox label="Active coupon" checked={values.isActive} onChange={(e) => setValues((s) => ({ ...s, isActive: e.target.checked }))} className="sm:col-span-2" />
      <div className="flex gap-3 sm:col-span-2">
        <Button type="submit" loading={save.isPending} data-testid="coupon-save">{coupon ? 'Save changes' : 'Create coupon'}</Button>
        <Button variant="ghost" onClick={onDone}>Cancel</Button>
      </div>
    </form>
  );
}

export function AdminCouponsPage() {
  useDocumentTitle('Admin · Coupons');
  const qc = useQueryClient();
  const [editing, setEditing] = useState<AdminCoupon | 'new' | null>(null);
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['admin', 'coupons'], queryFn: () => http.get<AdminCoupon[]>('/admin/coupons') });
  const toggle = useMutation({
    mutationFn: (c: AdminCoupon) => http.patch(`/admin/coupons/${c.id}`, { isActive: !c.isActive }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin', 'coupons'] }),
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <div>
      <AdminTitle title="Coupons" action={<Button icon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')} data-testid="new-coupon">New coupon</Button>} />
      {isError && <ErrorState onRetry={() => refetch()} />}
      {isLoading ? <Skeleton className="h-96" /> : (
        <Table testId="admin-coupons-table">
          <thead><tr><th className={th}>Code</th><th className={th}>Discount</th><th className={th}>Conditions</th><th className={th}>Validity</th><th className={th}>Uses</th><th className={th}>Status</th><th className={th} /></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {data?.map((c) => (
              <tr key={c.id} data-testid="admin-coupon-row" data-coupon-code={c.code}>
                <td className={td}><p className="font-mono font-semibold">{c.code}</p><p className="max-w-56 truncate text-xs text-slate-500">{c.description}</p></td>
                <td className={td}>{c.type === 'PERCENTAGE' ? `${c.value}%` : c.type === 'FIXED_AMOUNT' ? formatPrice(c.value) : 'Free shipping'}</td>
                <td className={`${td} text-xs text-slate-600`}>
                  {c.minSubtotalCents ? `Min. ${formatPrice(c.minSubtotalCents)}` : 'No minimum'}
                  {c.maxDiscountCents ? ` · Max. ${formatPrice(c.maxDiscountCents)}` : ''}
                  {c.categoryName ? ` · ${c.categoryName}` : ''} · {c.perUserLimit}/customer
                </td>
                <td className={`${td} text-xs`}>{formatDate(c.startsAt)} – {formatDate(c.expiresAt)}</td>
                <td className={td}>{c.timesUsed}{c.usageLimit ? ` / ${c.usageLimit}` : ''}</td>
                <td className={td}><Badge tone={STATE_TONE[c.state]}>{STATE_LABEL[c.state]}</Badge></td>
                <td className={td}>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setEditing(c)}>Edit</Button>
                    <Button size="sm" variant="ghost" onClick={() => toggle.mutate(c)} data-testid="toggle-coupon">{c.isActive ? 'Deactivate' : 'Activate'}</Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <Modal open={!!editing} onOpenChange={(o) => !o && setEditing(null)} title={editing === 'new' ? 'New coupon' : 'Edit coupon'} size="lg" testId="coupon-modal">
        {editing && <CouponForm coupon={editing === 'new' ? undefined : editing} onDone={() => setEditing(null)} />}
      </Modal>
    </div>
  );
}
