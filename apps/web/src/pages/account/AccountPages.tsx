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
  ['/cuenta', 'Resumen', LayoutDashboard],
  ['/cuenta/pedidos', 'Mis pedidos', Package],
  ['/cuenta/perfil', 'Datos personales', User],
  ['/cuenta/direcciones', 'Direcciones', MapPin],
  ['/cuenta/seguridad', 'Contraseña y sesiones', KeyRound],
  ['/cuenta/favoritos', 'Favoritos', Heart],
  ['/cuenta/resenas', 'Mis reseñas', Star],
] as const;

export function AccountLayout() {
  const { user } = useAuth();
  return (
    <div className="container-page py-8">
      <div className="grid gap-6 lg:grid-cols-[15rem_1fr]">
        <aside className="card h-fit p-3" aria-label="Mi cuenta">
          <div className="mb-2 px-3 py-2">
            <p className="text-xs text-slate-500">Hola,</p>
            <p className="font-bold" data-testid="account-greeting">{user?.firstName} {user?.lastName}</p>
          </div>
          <nav className="flex gap-1 overflow-x-auto lg:flex-col">
            {NAV.map(([to, label, Icon]) => (
              <NavLink key={to} to={to} end={to === '/cuenta'} className={({ isActive }) => cn('flex items-center gap-2.5 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-medium', isActive ? 'bg-brand-50 text-brand-800' : 'text-slate-700 hover:bg-slate-100')}>
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
    <div className="mb-5 flex items-center justify-between gap-4">
      <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
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
    ['Pedidos', orders.data?.meta.total, '/cuenta/pedidos', Package],
    ['Favoritos', favorites.data?.length, '/cuenta/favoritos', Heart],
    ['Direcciones', addresses.data?.length, '/cuenta/direcciones', MapPin],
  ] as const;
  return (
    <div className="space-y-6">
      <PageTitle title="Mi cuenta" />
      <p className="text-slate-600">Cliente desde {formatDate(user?.createdAt)} · {user?.email}</p>
      <div className="grid gap-4 sm:grid-cols-3">
        {tiles.map(([label, value, to, Icon]) => (
          <Link key={label} to={to} className="card flex items-center gap-4 p-5 hover:border-brand-200" data-testid={`account-tile-${label.toLowerCase()}`}>
            <span className="rounded-xl bg-brand-50 p-3 text-brand-600"><Icon className="h-5 w-5" /></span>
            <span>
              <span className="block text-2xl font-extrabold">{value ?? '–'}</span>
              <span className="text-sm text-slate-500">{label}</span>
            </span>
          </Link>
        ))}
      </div>
      <section className="card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-bold">Últimos pedidos</h2>
          <Link to="/cuenta/pedidos" className="text-sm font-semibold text-brand-700">Ver todos</Link>
        </div>
        {orders.isLoading && <Skeleton className="h-24" />}
        {orders.data?.data.length === 0 && <p className="text-sm text-slate-500">Todavía no has realizado ningún pedido.</p>}
        <ul className="divide-y divide-slate-100">
          {orders.data?.data.map((o) => (
            <li key={o.id} className="flex items-center justify-between gap-3 py-3 text-sm">
              <Link to={`/cuenta/pedidos/${o.id}`} className="font-mono font-semibold text-brand-700">{o.orderNumber}</Link>
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
  firstName: z.string().trim().min(2, 'El nombre debe tener al menos 2 caracteres').max(50),
  lastName: z.string().trim().min(2, 'El apellido debe tener al menos 2 caracteres').max(80),
  phone: z.string().trim().regex(/^((\+34|0034)?[6789]\d{8})?$/, 'Teléfono español no válido'),
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
      toast.success('Datos actualizados');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <div>
      <PageTitle title="Datos personales" />
      <form onSubmit={handleSubmit((v) => save.mutate(v))} noValidate className="card grid max-w-2xl gap-4 p-6 sm:grid-cols-2" data-testid="profile-form">
        <Input label="Nombre" required {...register('firstName')} error={formState.errors.firstName?.message} />
        <Input label="Apellidos" required {...register('lastName')} error={formState.errors.lastName?.message} />
        <Input label="Email" value={user?.email ?? ''} disabled hint="El email no se puede modificar" wrapperClassName="sm:col-span-2" readOnly />
        <Input label="Teléfono" type="tel" {...register('phone')} error={formState.errors.phone?.message} />
        <div className="flex items-end pb-2">
          <Checkbox label="Recibir ofertas por email" {...register('marketingOptIn')} />
        </div>
        <div className="sm:col-span-2">
          <Button type="submit" loading={save.isPending} disabled={!formState.isDirty} data-testid="profile-save">Guardar cambios</Button>
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
      toast.success('Dirección predeterminada actualizada');
      void qc.invalidateQueries({ queryKey: ['addresses'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: (id: number) => http.delete(`/users/me/addresses/${id}`),
    onSuccess: () => {
      toast.success('Dirección eliminada');
      setDeleting(null);
      void qc.invalidateQueries({ queryKey: ['addresses'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <div>
      <PageTitle title="Direcciones" action={<Button icon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')} data-testid="new-address">Nueva dirección</Button>} />
      {isLoading && <Skeleton className="h-40" />}
      {data?.length === 0 && <EmptyState icon={<MapPin className="h-8 w-8" />} title="No tienes direcciones guardadas" description="Añade una dirección para agilizar tus compras." testId="addresses-empty" />}
      <ul className="grid gap-4 md:grid-cols-2" data-testid="address-list">
        {data?.map((a) => (
          <li key={a.id} className={cn('card p-5', a.isDefault && 'border-brand-300')} data-testid="address-card" data-address-id={a.id}>
            <div className="mb-2 flex items-center justify-between">
              <p className="font-semibold">{a.label ?? 'Dirección'}</p>
              {a.isDefault && <Badge tone="brand" testId="default-address-badge">Predeterminada</Badge>}
            </div>
            <address className="text-sm not-italic text-slate-600">
              {a.fullName}<br />{a.line1}{a.line2 ? `, ${a.line2}` : ''}<br />{a.postalCode} {a.city} ({a.province})<br />{a.phone}
            </address>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => setEditing(a)} data-testid="edit-address">Editar</Button>
              {!a.isDefault && <Button size="sm" variant="ghost" onClick={() => setDefault.mutate(a.id)} data-testid="set-default-address">Usar como predeterminada</Button>}
              <Button size="sm" variant="ghost" className="text-rose-600" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => setDeleting(a)} data-testid="delete-address">Eliminar</Button>
            </div>
          </li>
        ))}
      </ul>
      <Modal open={!!editing} onOpenChange={(o) => !o && setEditing(null)} title={editing === 'new' ? 'Nueva dirección' : 'Editar dirección'} size="lg" testId="address-modal">
        {editing && <AddressForm address={editing === 'new' ? undefined : editing} onSaved={() => setEditing(null)} onCancel={() => setEditing(null)} />}
      </Modal>
      <ConfirmDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)} title="Eliminar dirección" description={deleting?.isDefault ? 'Es tu dirección predeterminada: otra pasará a serlo.' : '¿Seguro que quieres eliminarla?'} confirmLabel="Eliminar" loading={remove.isPending} onConfirm={() => deleting && remove.mutate(deleting.id)} />
    </div>
  );
}

const passwordFormSchema = z
  .object({ currentPassword: z.string().min(1, 'Introduce tu contraseña actual'), newPassword: passwordSchema, confirmPassword: z.string().min(1, 'Repite la contraseña') })
  .refine((v) => v.newPassword === v.confirmPassword, { path: ['confirmPassword'], message: 'Las contraseñas no coinciden' });

export function SecurityPage() {
  const qc = useQueryClient();
  const { register, handleSubmit, formState, reset, watch, setError } = useForm<z.infer<typeof passwordFormSchema>>({ resolver: zodResolver(passwordFormSchema) });
  const change = useMutation({
    mutationFn: (v: z.infer<typeof passwordFormSchema>) => http.post('/users/me/password', { currentPassword: v.currentPassword, newPassword: v.newPassword }),
    onSuccess: () => {
      toast.success('Contraseña actualizada. Se han cerrado tus otras sesiones');
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
      toast.success(`${r.revoked} sesiones cerradas`);
      void qc.invalidateQueries({ queryKey: ['sessions'] });
    },
  });
  return (
    <div className="space-y-6">
      <PageTitle title="Contraseña y sesiones" />
      <form onSubmit={handleSubmit((v) => change.mutate(v))} noValidate className="card max-w-xl space-y-4 p-6" data-testid="change-password-form">
        <h2 className="font-bold">Cambiar contraseña</h2>
        <Input label="Contraseña actual" type="password" required autoComplete="current-password" {...register('currentPassword')} error={formState.errors.currentPassword?.message} />
        <Input label="Nueva contraseña" type="password" required autoComplete="new-password" {...register('newPassword')} error={formState.errors.newPassword?.message} />
        <PasswordRules value={watch('newPassword') ?? ''} />
        <Input label="Repite la nueva contraseña" type="password" required autoComplete="new-password" {...register('confirmPassword')} error={formState.errors.confirmPassword?.message} />
        <Button type="submit" loading={change.isPending} data-testid="change-password-submit">Actualizar contraseña</Button>
      </form>
      <section className="card p-6" aria-labelledby="sessions-title">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 id="sessions-title" className="font-bold">Sesiones activas</h2>
          <Button size="sm" variant="outline" onClick={() => revokeOthers.mutate()} loading={revokeOthers.isPending} data-testid="revoke-other-sessions">Cerrar las demás sesiones</Button>
        </div>
        {sessions.isLoading && <Skeleton className="h-20" />}
        <ul className="divide-y divide-slate-100" data-testid="session-list">
          {sessions.data?.map((s) => (
            <li key={s.id} className="flex items-center gap-3 py-3 text-sm" data-testid="session-item">
              <Monitor className="h-5 w-5 text-slate-400" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{s.userAgent ?? 'Dispositivo desconocido'}</p>
                <p className="text-xs text-slate-500">Último uso: {formatDateTime(s.lastUsedAt)} · IP {s.ip ?? '—'} · Caduca {formatDate(s.expiresAt)}</p>
              </div>
              {s.current ? <Badge tone="green">Esta sesión</Badge> : <Button size="sm" variant="ghost" className="text-rose-600" onClick={() => revoke.mutate(s.id)}>Cerrar</Button>}
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
      <PageTitle title="Favoritos" />
      {data?.length === 0 ? (
        <EmptyState icon={<Heart className="h-8 w-8" />} title="Aún no tienes favoritos" description="Pulsa el corazón de cualquier producto para guardarlo aquí." action={<ButtonLink to="/">Explorar productos</ButtonLink>} testId="favorites-empty" />
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
      toast.success('Reseña eliminada');
      setDeleting(null);
      void qc.invalidateQueries({ queryKey: ['my-reviews'] });
      void qc.invalidateQueries({ queryKey: ['catalog'] });
    },
  });
  return (
    <div>
      <PageTitle title="Mis reseñas" />
      {isLoading && <Skeleton className="h-32" />}
      {data?.length === 0 && <EmptyState icon={<Star className="h-8 w-8" />} title="No has escrito reseñas" description="Comparte tu opinión desde la ficha de cualquier producto." testId="reviews-empty" />}
      <ul className="space-y-3">
        {data?.map((r) => (
          <li key={r.id} className="card flex gap-4 p-5" data-testid="my-review">
            <ProductImage src={r.productImageUrl} alt="" className="h-16 w-16 shrink-0 rounded-lg bg-slate-50" />
            <div className="min-w-0 flex-1">
              <Link to={`/producto/${r.productSlug}`} className="text-sm font-semibold text-brand-700">{r.productName}</Link>
              <div className="mt-1 flex items-center gap-2"><Rating value={r.rating} /><span className="font-semibold">{r.title}</span></div>
              <p className="mt-1 text-sm text-slate-600">{r.comment}</p>
              <p className="mt-2 text-xs text-slate-500">{formatDate(r.createdAt)}</p>
            </div>
            <div className="flex flex-col gap-2">
              <ButtonLink to={`/producto/${r.productSlug}#resenas`} size="sm" variant="outline">Editar</ButtonLink>
              <Button size="sm" variant="ghost" className="text-rose-600" onClick={() => setDeleting(r)}>Eliminar</Button>
            </div>
          </li>
        ))}
      </ul>
      <ConfirmDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)} title="Eliminar reseña" description="Esta acción no se puede deshacer." confirmLabel="Eliminar" loading={remove.isPending} onConfirm={() => deleting && remove.mutate(deleting.id)} />
      {remove.isError && <Alert tone="error">{errorMessage(remove.error)}</Alert>}
    </div>
  );
}
