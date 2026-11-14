import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Heart, KeyRound, LayoutDashboard, MapPin, Monitor, Package, Pencil, Plus, Star, Trash2, User } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, NavLink, Outlet } from 'react-router';
import { toast } from 'sonner';
import { z } from 'zod';
import { useAuth } from '../../auth/AuthProvider';
import { AddressForm } from '../../components/checkout/AddressForm';
import { OrderStatusBadge } from '../../components/checkout/OrderView';
import { ProductGrid, ProductImage } from '../../components/product/ProductCard';
import { Button, ButtonLink } from '../../components/ui/Button';
import { Rating } from '../../components/ui/Commerce';
import { Alert, Badge, EmptyState, Skeleton } from '../../components/ui/Feedback';
import { Checkbox, Input } from '../../components/ui/Field';
import { ConfirmDialog, Modal } from '../../components/ui/Modal';
import { ApiError, errorMessage, http } from '../../lib/api';
import { cn } from '../../lib/cn';
import { formatDate, formatDateTime, formatPrice } from '../../lib/format';
import { useAddresses, useFavorites, useOrders } from '../../lib/queries';
import type { Address, MyReview, Session, User as UserType } from '../../lib/types';
import { passwordSchema, PasswordRules } from '../AuthPages';
import { useDocumentTitle } from '../useDocumentTitle';

const NAV = [
  ['/account', 'Overview', LayoutDashboard],
  ['/account/orders', 'My orders', Package],
  ['/account/profile', 'Personal details', User],
  ['/account/addresses', 'Addresses', MapPin],
  ['/account/security', 'Password & sessions', KeyRound],
  ['/account/favorites', 'Favorites', Heart],
  ['/account/reviews', 'My reviews', Star],
] as const;

export function AccountLayout() {
  const { user } = useAuth();
  return (
    <div className="container-page py-8">
      <div className="grid gap-8 lg:grid-cols-[17rem_1fr]">
        <aside className="h-fit rounded-4xl bg-slate-50 p-3 lg:sticky lg:top-40" aria-label="My account">
          <div className="mb-2 flex items-center gap-3 px-3 py-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-950 text-sm font-semibold text-white" aria-hidden="true">
              {user?.firstName?.[0]}
              {user?.lastName?.[0]}
            </span>
            <span className="min-w-0">
              <span className="block text-xs text-slate-500">Hi,</span>
              <span className="block truncate font-semibold tracking-tight" data-testid="account-greeting">{user?.firstName} {user?.lastName}</span>
            </span>
          </div>
          <nav className="flex gap-1 overflow-x-auto lg:flex-col">
            {NAV.map(([to, label, Icon]) => (
              <NavLink key={to} to={to} end={to === '/account'} className={({ isActive }) => cn('flex items-center gap-2.5 whitespace-nowrap rounded-full px-4 py-2.5 text-sm font-medium transition', isActive ? 'bg-slate-950 text-white' : 'text-slate-700 hover:bg-white')}>
                <Icon className="h-4 w-4" /> {label}
              </NavLink>
            ))}
          </nav>
        </aside>
        <div className="min-w-0">
          <Outlet />
        </div>
      </div>
    </div>
  );
}

function PageTitle({ title, action }: { title: string; action?: React.ReactNode }) {
  useDocumentTitle(title);
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
      <h1 className="heading-xl">{title}</h1>
      {action}
    </div>
  );
}

export function AccountDashboardPage() {
  const { user } = useAuth();
  const orders = useOrders({ pageSize: 3 });
  const favorites = useFavorites();
  const addresses = useAddresses();
  const tiles = [
    ['Orders', orders.data?.meta.total, '/account/orders', Package],
    ['Favorites', favorites.data?.length, '/account/favorites', Heart],
    ['Addresses', addresses.data?.length, '/account/addresses', MapPin],
  ] as const;
  return (
    <div className="space-y-6">
      <PageTitle title="My account" />
      <p className="text-slate-600">Customer since {formatDate(user?.createdAt)} · {user?.email}</p>
      <div className="grid gap-4 sm:grid-cols-3">
        {tiles.map(([label, value, to, Icon]) => (
          <Link key={label} to={to} className="group flex items-center gap-4 rounded-3xl bg-slate-50 p-5 transition hover:bg-slate-100" data-testid={`account-tile-${label.toLowerCase()}`}>
            <span className="rounded-2xl bg-white p-3 text-slate-950 shadow-card ring-1 ring-slate-900/5 transition group-hover:bg-accent-400"><Icon className="h-5 w-5" /></span>
            <span>
              <span className="block text-3xl font-semibold tracking-tight">{value ?? '–'}</span>
              <span className="text-sm text-slate-500">{label}</span>
            </span>
          </Link>
        ))}
      </div>
      <section className="card p-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">Latest orders</h2>
          <Link to="/account/orders" className="text-sm font-semibold text-slate-950 underline-offset-2 hover:underline">View all</Link>
        </div>
        {orders.isLoading && <Skeleton className="h-24" />}
        {orders.data?.data.length === 0 && <p className="text-sm text-slate-500">You have not placed any orders yet.</p>}
        <ul className="divide-y divide-slate-200/80">
          {orders.data?.data.map((o) => (
            <li key={o.id} className="flex items-center justify-between gap-3 py-3 text-sm">
              <Link to={`/account/orders/${o.id}`} className="font-mono font-semibold text-slate-950 underline-offset-2 hover:underline">{o.orderNumber}</Link>
              <span className="hidden text-slate-500 sm:inline">{formatDate(o.createdAt)}</span>
              <OrderStatusBadge status={o.status} />
              <span className="font-semibold">{formatPrice(o.totalCents)}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

const profileSchema = z.object({
  firstName: z.string().trim().min(2, 'First name must be at least 2 characters long').max(50),
  lastName: z.string().trim().min(2, 'Last name must be at least 2 characters long').max(80),
  phone: z.string().trim().regex(/^((\+34|0034)?[6789]\d{8})?$/, 'Invalid Spanish phone number'),
  marketingOptIn: z.boolean(),
});

export function ProfilePage() {
  const { user, setUser } = useAuth();
  const { register, handleSubmit, formState, reset } = useForm<z.infer<typeof profileSchema>>({
    resolver: zodResolver(profileSchema),
    defaultValues: { firstName: user?.firstName ?? '', lastName: user?.lastName ?? '', phone: user?.phone ?? '', marketingOptIn: user?.marketingOptIn ?? false },
  });
  const save = useMutation({
    mutationFn: (v: z.infer<typeof profileSchema>) => http.patch<UserType>('/users/me', { ...v, phone: v.phone || null }),
    onSuccess: (u) => {
      setUser(u);
      reset({ firstName: u.firstName, lastName: u.lastName, phone: u.phone ?? '', marketingOptIn: u.marketingOptIn });
      toast.success('Details updated');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <div>
      <PageTitle title="Personal details" />
      <form onSubmit={handleSubmit((v) => save.mutate(v))} noValidate className="card grid max-w-2xl gap-4 p-6 sm:grid-cols-2" data-testid="profile-form">
        <Input label="First name" required {...register('firstName')} error={formState.errors.firstName?.message} />
        <Input label="Last name" required {...register('lastName')} error={formState.errors.lastName?.message} />
        <Input label="Email" value={user?.email ?? ''} disabled hint="The e-mail cannot be changed" wrapperClassName="sm:col-span-2" readOnly />
        <Input label="Phone" type="tel" {...register('phone')} error={formState.errors.phone?.message} />
        <div className="flex items-end pb-2">
          <Checkbox label="Receive offers by e-mail" {...register('marketingOptIn')} />
        </div>
        <div className="sm:col-span-2">
          <Button type="submit" loading={save.isPending} disabled={!formState.isDirty} data-testid="profile-save">Save changes</Button>
        </div>
      </form>
    </div>
  );
}

export function AddressesPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useAddresses();
  const [editing, setEditing] = useState<Address | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Address | null>(null);
  const setDefault = useMutation({
    mutationFn: (id: number) => http.post(`/users/me/addresses/${id}/default`),
    onSuccess: () => {
      toast.success('Default address updated');
      void qc.invalidateQueries({ queryKey: ['addresses'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: (id: number) => http.delete(`/users/me/addresses/${id}`),
    onSuccess: () => {
      toast.success('Address deleted');
      setDeleting(null);
      void qc.invalidateQueries({ queryKey: ['addresses'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <div>
      <PageTitle title="Addresses" action={<Button icon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')} data-testid="new-address">New address</Button>} />
      {isLoading && <Skeleton className="h-40" />}
      {data?.length === 0 && <EmptyState icon={<MapPin className="h-8 w-8" />} title="You have no saved addresses" description="Add an address to speed up your purchases." testId="addresses-empty" />}
      <ul className="grid gap-4 md:grid-cols-2" data-testid="address-list">
        {data?.map((a) => (
          <li key={a.id} className={cn('card p-6', a.isDefault && 'border-slate-950 ring-1 ring-slate-950')} data-testid="address-card" data-address-id={a.id}>
            <div className="mb-2 flex items-center justify-between">
              <p className="font-semibold">{a.label ?? 'Address'}</p>
              {a.isDefault && <Badge tone="brand" testId="default-address-badge">Default</Badge>}
            </div>
            <address className="text-sm not-italic text-slate-600">
              {a.fullName}<br />{a.line1}{a.line2 ? `, ${a.line2}` : ''}<br />{a.postalCode} {a.city} ({a.province})<br />{a.phone}
            </address>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => setEditing(a)} data-testid="edit-address">Edit</Button>
              {!a.isDefault && <Button size="sm" variant="ghost" onClick={() => setDefault.mutate(a.id)} data-testid="set-default-address">Set as default</Button>}
              <Button size="sm" variant="ghost" className="text-rose-600" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => setDeleting(a)} data-testid="delete-address">Delete</Button>
            </div>
          </li>
        ))}
      </ul>
      <Modal open={!!editing} onOpenChange={(o) => !o && setEditing(null)} title={editing === 'new' ? 'New address' : 'Edit address'} size="lg" testId="address-modal">
        {editing && <AddressForm address={editing === 'new' ? undefined : editing} onSaved={() => setEditing(null)} onCancel={() => setEditing(null)} />}
      </Modal>
      <ConfirmDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)} title="Delete address" description={deleting?.isDefault ? 'This is your default address: another one will become the default.' : 'Are you sure you want to delete it?'} confirmLabel="Delete" loading={remove.isPending} onConfirm={() => deleting && remove.mutate(deleting.id)} />
    </div>
  );
}

const passwordFormSchema = z
  .object({ currentPassword: z.string().min(1, 'Enter your current password'), newPassword: passwordSchema, confirmPassword: z.string().min(1, 'Repeat the password') })
  .refine((v) => v.newPassword === v.confirmPassword, { path: ['confirmPassword'], message: 'The passwords do not match' });

export function SecurityPage() {
  const qc = useQueryClient();
  const { register, handleSubmit, formState, reset, watch, setError } = useForm<z.infer<typeof passwordFormSchema>>({ resolver: zodResolver(passwordFormSchema) });
  const change = useMutation({
    mutationFn: (v: z.infer<typeof passwordFormSchema>) => http.post('/users/me/password', { currentPassword: v.currentPassword, newPassword: v.newPassword }),
    onSuccess: () => {
      toast.success('Password updated. Your other sessions have been signed out');
      reset({ currentPassword: '', newPassword: '', confirmPassword: '' });
      void qc.invalidateQueries({ queryKey: ['sessions'] });
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code === 'CURRENT_PASSWORD_INCORRECT') setError('currentPassword', { message: e.message });
      else if (e instanceof ApiError && e.code === 'PASSWORD_REUSED') setError('newPassword', { message: e.message });
      else toast.error(errorMessage(e));
    },
  });
  const sessions = useQuery({ queryKey: ['sessions'], queryFn: () => http.get<Session[]>('/users/me/sessions') });
  const revoke = useMutation({
    mutationFn: (id: string) => http.delete(`/users/me/sessions/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['sessions'] }),
  });
  const revokeOthers = useMutation({
    mutationFn: () => http.post<{ revoked: number }>('/users/me/sessions/revoke-others'),
    onSuccess: (r) => {
      toast.success(`${r.revoked} sessions signed out`);
      void qc.invalidateQueries({ queryKey: ['sessions'] });
    },
  });
  return (
    <div className="space-y-6">
      <PageTitle title="Password & sessions" />
      <form onSubmit={handleSubmit((v) => change.mutate(v))} noValidate className="card max-w-xl space-y-4 p-6" data-testid="change-password-form">
        <h2 className="text-lg font-semibold tracking-tight">Change password</h2>
        <Input label="Current password" type="password" required autoComplete="current-password" {...register('currentPassword')} error={formState.errors.currentPassword?.message} />
        <Input label="New password" type="password" required autoComplete="new-password" {...register('newPassword')} error={formState.errors.newPassword?.message} />
        <PasswordRules value={watch('newPassword') ?? ''} />
        <Input label="Repeat the new password" type="password" required autoComplete="new-password" {...register('confirmPassword')} error={formState.errors.confirmPassword?.message} />
        <Button type="submit" loading={change.isPending} data-testid="change-password-submit">Update password</Button>
      </form>
      <section className="card p-6" aria-labelledby="sessions-title">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 id="sessions-title" className="text-lg font-semibold tracking-tight">Active sessions</h2>
          <Button size="sm" variant="outline" onClick={() => revokeOthers.mutate()} loading={revokeOthers.isPending} data-testid="revoke-other-sessions">Sign out other sessions</Button>
        </div>
        {sessions.isLoading && <Skeleton className="h-20" />}
        <ul className="divide-y divide-slate-100" data-testid="session-list">
          {sessions.data?.map((s) => (
            <li key={s.id} className="flex items-center gap-3 py-3 text-sm" data-testid="session-item">
              <Monitor className="h-5 w-5 text-slate-400" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{s.userAgent ?? 'Unknown device'}</p>
                <p className="text-xs text-slate-500">Last used: {formatDateTime(s.lastUsedAt)} · IP {s.ip ?? '—'} · Expires {formatDate(s.expiresAt)}</p>
              </div>
              {s.current ? <Badge tone="green">This session</Badge> : <Button size="sm" variant="ghost" className="text-rose-600" onClick={() => revoke.mutate(s.id)}>Sign out</Button>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export function FavoritesPage() {
  const { data, isLoading } = useFavorites();
  return (
    <div>
      <PageTitle title="Favorites" />
      {data?.length === 0 ? (
        <EmptyState icon={<Heart className="h-8 w-8" />} title="You have no favorites yet" description="Tap the heart on any product to save it here." action={<ButtonLink to="/">Explore products</ButtonLink>} testId="favorites-empty" />
      ) : (
        <ProductGrid products={data?.map((f) => f.product)} loading={isLoading} skeletons={4} />
      )}
    </div>
  );
}

export function MyReviewsPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['my-reviews'], queryFn: () => http.get<MyReview[]>('/users/me/reviews') });
  const [deleting, setDeleting] = useState<MyReview | null>(null);
  const remove = useMutation({
    mutationFn: (id: number) => http.delete(`/reviews/${id}`),
    onSuccess: () => {
      toast.success('Review deleted');
      setDeleting(null);
      void qc.invalidateQueries({ queryKey: ['my-reviews'] });
      void qc.invalidateQueries({ queryKey: ['catalog'] });
    },
  });
  return (
    <div>
      <PageTitle title="My reviews" />
      {isLoading && <Skeleton className="h-32" />}
      {data?.length === 0 && <EmptyState icon={<Star className="h-8 w-8" />} title="You have not written any reviews" description="Share your opinion from any product page." testId="reviews-empty" />}
      <ul className="space-y-3">
        {data?.map((r) => (
          <li key={r.id} className="card flex gap-4 p-5" data-testid="my-review">
            <ProductImage src={r.productImageUrl} alt="" className="h-16 w-16 shrink-0 rounded-lg bg-slate-50" />
            <div className="min-w-0 flex-1">
              <Link to={`/product/${r.productSlug}`} className="text-sm font-semibold text-slate-950 underline-offset-2 hover:underline">{r.productName}</Link>
              <div className="mt-1 flex items-center gap-2"><Rating value={r.rating} /><span className="font-semibold">{r.title}</span></div>
              <p className="mt-1 text-sm text-slate-600">{r.comment}</p>
              <p className="mt-2 text-xs text-slate-500">{formatDate(r.createdAt)}</p>
            </div>
            <div className="flex flex-col gap-2">
              <ButtonLink to={`/product/${r.productSlug}#reviews`} size="sm" variant="outline">Edit</ButtonLink>
              <Button size="sm" variant="ghost" className="text-rose-600" onClick={() => setDeleting(r)}>Delete</Button>
            </div>
          </li>
        ))}
      </ul>
      <ConfirmDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)} title="Delete review" description="This action cannot be undone." confirmLabel="Delete" loading={remove.isPending} onConfirm={() => deleting && remove.mutate(deleting.id)} />
      {remove.isError && <Alert tone="error">{errorMessage(remove.error)}</Alert>}
    </div>
  );
}
