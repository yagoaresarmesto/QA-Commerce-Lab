import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { ProductImage } from '../../components/product/ProductCard';
import { Button, ButtonLink } from '../../components/ui/Button';
import { AvailabilityLabel, Pagination } from '../../components/ui/Commerce';
import { Alert, Badge, ErrorState, Skeleton } from '../../components/ui/Feedback';
import { Checkbox, Input, Select, Textarea } from '../../components/ui/Field';
import { ApiError, errorMessage, http } from '../../lib/api';
import { centsToEuros, eurosToCents, formatPrice } from '../../lib/format';
import { useCategories } from '../../lib/queries';
import type { AdminProduct, Paginated, Ref } from '../../lib/types';
import { useDocumentTitle } from '../useDocumentTitle';
import { AdminTitle, Table, td, th } from './AdminLayout';

export function AdminProductsPage() {
  useDocumentTitle('Admin · Productos');
  const [params, setParams] = useSearchParams();
  const categories = useCategories();
  const [search, setSearch] = useState(params.get('q') ?? '');
  const query = {
    q: params.get('q') ?? undefined,
    status: params.get('status') ?? 'all',
    stock: params.get('stock') ?? undefined,
    categoryId: params.get('categoryId') ?? undefined,
    sort: params.get('sort') ?? 'newest',
    page: Number(params.get('page') ?? 1),
    pageSize: 20,
  };
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['admin', 'products', query], queryFn: () => http.get<Paginated<AdminProduct>>('/admin/products', { query }) });
  const set = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    if (k !== 'page') next.delete('page');
    setParams(next);
  };
  return (
    <div>
      <AdminTitle title="Productos" action={<ButtonLink to="/admin/productos/nuevo" data-testid="new-product"><Plus className="h-4 w-4" /> Nuevo producto</ButtonLink>} />
      <div className="mb-5 grid gap-3 rounded-3xl bg-slate-50 p-4 md:grid-cols-5">
        <form className="md:col-span-2" onSubmit={(e: FormEvent) => { e.preventDefault(); set('q', search.trim() || null); }}>
          <Input label="Buscar" placeholder="Nombre, marca o SKU" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="admin-product-search" />
        </form>
        <Select label="Estado" value={query.status} onChange={(e) => set('status', e.target.value)}>
          <option value="all">Todos</option>
          <option value="active">Activos</option>
          <option value="inactive">Desactivados</option>
        </Select>
        <Select label="Stock" value={query.stock ?? ''} onChange={(e) => set('stock', e.target.value || null)}>
          <option value="">Cualquiera</option>
          <option value="out">Sin stock</option>
          <option value="low">Stock bajo (1-5)</option>
          <option value="in">Con stock (&gt;5)</option>
        </Select>
        <Select label="Categoría" value={query.categoryId ?? ''} onChange={(e) => set('categoryId', e.target.value || null)}>
          <option value="">Todas</option>
          {categories.data?.flatMap((c) => [c, ...c.children]).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </div>
      {isError && <ErrorState onRetry={() => refetch()} />}
      {isLoading ? <Skeleton className="h-96" /> : (
        <Table testId="admin-products-table">
          <thead>
            <tr><th className={th}>Producto</th><th className={th}>SKU</th><th className={th}>Precio</th><th className={th}>Stock</th><th className={th}>Estado</th><th className={th} /></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data?.data.map((p) => (
              <tr key={p.id} data-testid="admin-product-row" data-product-id={p.id}>
                <td className={td}>
                  <div className="flex items-center gap-3">
                    <ProductImage src={p.imageUrl} alt="" className="h-10 w-10 rounded-lg bg-slate-50" />
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{p.name}</p>
                      <p className="text-xs text-slate-500">{p.brand.name} · {p.category.name}</p>
                    </div>
                  </div>
                </td>
                <td className={`${td} font-mono text-xs`}>{p.sku}</td>
                <td className={td}>{formatPrice(p.priceCents)}{p.compareAtPriceCents && <span className="ml-1 text-xs text-slate-400 line-through">{formatPrice(p.compareAtPriceCents)}</span>}</td>
                <td className={td}><span className="font-semibold">{p.stock}</span></td>
                <td className={td}><AvailabilityLabel availability={p.availability} className="text-xs" /> {p.testRunId && <Badge tone="violet">run</Badge>}</td>
                <td className={td}><Link to={`/admin/productos/${p.id}`} className="font-semibold text-slate-950 underline-offset-2 hover:underline" data-testid="edit-product">Editar</Link></td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {data && <div className="mt-4"><Pagination page={data.meta.page} totalPages={data.meta.totalPages} onPage={(p) => set('page', String(p))} /></div>}
      {data && <p className="mt-2 text-center text-xs text-slate-500">{data.meta.total} productos</p>}
    </div>
  );
}

interface FormState {
  sku: string;
  name: string;
  brandId: string;
  categoryId: string;
  shortDescription: string;
  description: string;
  price: string;
  compareAt: string;
  stock: string;
  isActive: boolean;
  isFeatured: boolean;
  specs: Array<{ name: string; value: string }>;
}

const empty: FormState = { sku: '', name: '', brandId: '', categoryId: '', shortDescription: '', description: '', price: '', compareAt: '', stock: '0', isActive: true, isFeatured: false, specs: [] };

export function AdminProductFormPage() {
  const { id } = useParams();
  const isNew = !id || id === 'nuevo';
  useDocumentTitle(isNew ? 'Admin · Nuevo producto' : 'Admin · Editar producto');
  const navigate = useNavigate();
  const qc = useQueryClient();
  const categories = useCategories();
  const brands = useQuery({ queryKey: ['catalog', 'brands'], queryFn: () => http.get<Ref[]>('/brands') });
  const product = useQuery({ queryKey: ['admin', 'product', id], queryFn: () => http.get<AdminProduct>(`/admin/products/${id}`), enabled: !isNew });
  const [form, setForm] = useState<FormState>(empty);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [delta, setDelta] = useState('');

  useEffect(() => {
    const p = product.data;
    if (!p) return;
    setForm({
      sku: p.sku, name: p.name, brandId: String(p.brand.id), categoryId: String(p.category.id), shortDescription: p.shortDescription, description: p.description,
      price: centsToEuros(p.priceCents), compareAt: centsToEuros(p.compareAtPriceCents), stock: String(p.stock), isActive: p.isActive, isFeatured: p.isFeatured, specs: p.specs,
    });
  }, [product.data]);

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: form.name, brandId: Number(form.brandId), categoryId: Number(form.categoryId), shortDescription: form.shortDescription, description: form.description,
        priceCents: eurosToCents(form.price), compareAtPriceCents: form.compareAt ? eurosToCents(form.compareAt) : null, stock: Number(form.stock),
        isActive: form.isActive, isFeatured: form.isFeatured, specs: form.specs.filter((s) => s.name.trim() && s.value.trim()),
      };
      return isNew ? http.post<AdminProduct>('/admin/products', { sku: form.sku.trim().toUpperCase(), ...body }) : http.patch<AdminProduct>(`/admin/products/${id}`, body);
    },
    onSuccess: (p) => {
      toast.success(isNew ? 'Producto creado' : 'Producto actualizado');
      void qc.invalidateQueries({ queryKey: ['admin'] });
      void qc.invalidateQueries({ queryKey: ['catalog'] });
      if (isNew) navigate(`/admin/productos/${p.id}`, { replace: true });
    },
    onError: (e) => {
      setErrors(e instanceof ApiError ? e.fieldErrors : {});
      toast.error(errorMessage(e));
    },
  });
  const adjust = useMutation({
    mutationFn: () => http.post<AdminProduct>(`/admin/products/${id}/stock-adjustments`, { delta: Number(delta) }),
    onSuccess: (p) => {
      toast.success(`Stock actualizado: ${p.stock} unidades`);
      setForm((f) => ({ ...f, stock: String(p.stock) }));
      setDelta('');
      void qc.invalidateQueries({ queryKey: ['admin'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (!isNew && product.isLoading) return <Skeleton className="h-96" />;
  if (!isNew && product.isError) return <ErrorState message={errorMessage(product.error)} />;
  const f = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm((s) => ({ ...s, [k]: e.target.value }));
  const leafCategories = categories.data?.flatMap((c) => (c.children.length ? c.children.map((ch) => ({ ...ch, label: `${c.name} › ${ch.name}` })) : [{ ...c, label: c.name }]));

  return (
    <div>
      <AdminTitle title={isNew ? 'Nuevo producto' : `Editar: ${product.data?.name ?? ''}`} action={<ButtonLink to="/admin/productos" variant="ghost">← Volver</ButtonLink>} />
      {!isNew && product.data?.isReference && <Alert tone="info" className="mb-4">Producto del catálogo de referencia: los cambios se revierten con el seed/reset del entorno.</Alert>}
      <form onSubmit={(e) => { e.preventDefault(); setErrors({}); save.mutate(); }} noValidate className="grid gap-6 xl:grid-cols-[1fr_20rem]" data-testid="product-form">
        <div className="card grid gap-4 p-6 sm:grid-cols-2">
          <Input label="SKU" required value={form.sku} onChange={f('sku')} disabled={!isNew} error={errors.sku} hint="Mayúsculas, números y guiones" />
          <Input label="Nombre" required value={form.name} onChange={f('name')} error={errors.name} />
          <Select label="Marca" required value={form.brandId} onChange={f('brandId')} error={errors.brandId}>
            <option value="">Selecciona…</option>
            {brands.data?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
          <Select label="Categoría" required value={form.categoryId} onChange={f('categoryId')} error={errors.categoryId}>
            <option value="">Selecciona…</option>
            {leafCategories?.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </Select>
          <Input label="Descripción corta" required value={form.shortDescription} onChange={f('shortDescription')} error={errors.shortDescription} wrapperClassName="sm:col-span-2" />
          <Textarea label="Descripción" required value={form.description} onChange={f('description')} error={errors.description} wrapperClassName="sm:col-span-2" rows={5} />
          <fieldset className="space-y-2 sm:col-span-2">
            <legend className="text-sm font-medium text-slate-700">Especificaciones</legend>
            {form.specs.map((s, i) => (
              <div key={i} className="flex gap-2" data-testid="spec-row">
                <input aria-label={`Nombre de la especificación ${i + 1}`} className="h-10 flex-1 rounded-xl border border-slate-300 px-3 text-sm" value={s.name} onChange={(e) => setForm((st) => ({ ...st, specs: st.specs.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) }))} />
                <input aria-label={`Valor de la especificación ${i + 1}`} className="h-10 flex-[2] rounded-xl border border-slate-300 px-3 text-sm" value={s.value} onChange={(e) => setForm((st) => ({ ...st, specs: st.specs.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) }))} />
                <button type="button" className="rounded-lg px-2 text-slate-500 hover:bg-rose-50 hover:text-rose-600" aria-label="Eliminar especificación" onClick={() => setForm((st) => ({ ...st, specs: st.specs.filter((_, j) => j !== i) }))}><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
            <Button size="sm" variant="outline" onClick={() => setForm((s) => ({ ...s, specs: [...s.specs, { name: '', value: '' }] }))} data-testid="add-spec">Añadir especificación</Button>
          </fieldset>
        </div>
        <div className="space-y-6">
          <div className="card space-y-4 p-6">
            <Input label="Precio (€)" required inputMode="decimal" value={form.price} onChange={f('price')} error={errors.priceCents} />
            <Input label="Precio anterior (€)" inputMode="decimal" value={form.compareAt} onChange={f('compareAt')} error={errors.compareAtPriceCents} hint="Debe ser mayor que el precio. Vacío = sin oferta" />
            <Input label="Stock" required type="number" min={0} value={form.stock} onChange={f('stock')} error={errors.stock} />
            <Checkbox label="Producto activo (visible y comprable)" checked={form.isActive} onChange={(e) => setForm((s) => ({ ...s, isActive: e.target.checked }))} data-testid="product-active" />
            <Checkbox label="Destacado en la home" checked={form.isFeatured} onChange={(e) => setForm((s) => ({ ...s, isFeatured: e.target.checked }))} />
            <Button type="submit" className="w-full" loading={save.isPending} data-testid="product-save">{isNew ? 'Crear producto' : 'Guardar cambios'}</Button>
          </div>
          {!isNew && (
            <div className="card space-y-3 p-6">
              <p className="font-semibold">Ajuste rápido de stock</p>
              <p className="text-xs text-slate-500">Operación atómica: suma o resta unidades sin pisar ventas concurrentes.</p>
              <div className="flex gap-2">
                <input aria-label="Unidades a sumar o restar" type="number" className="h-10 w-full rounded-xl border border-slate-300 px-3 text-sm" placeholder="+10 / -2" value={delta} onChange={(e) => setDelta(e.target.value)} data-testid="stock-delta" />
                <Button variant="outline" onClick={() => adjust.mutate()} disabled={!delta || Number(delta) === 0} loading={adjust.isPending} data-testid="stock-adjust">Aplicar</Button>
              </div>
            </div>
          )}
        </div>
      </form>
    </div>
  );
}
