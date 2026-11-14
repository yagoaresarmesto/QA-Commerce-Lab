import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { ApiError, errorMessage, http } from '../../lib/api';
import type { Address } from '../../lib/types';
import { Button } from '../ui/Button';
import { Checkbox, Input, Select } from '../ui/Field';

export const PROVINCES = [
  'A Coruña', 'Álava', 'Albacete', 'Alicante', 'Almería', 'Asturias', 'Ávila', 'Badajoz', 'Baleares', 'Barcelona', 'Burgos', 'Cáceres', 'Cádiz', 'Cantabria',
  'Castellón', 'Ceuta', 'Ciudad Real', 'Córdoba', 'Cuenca', 'Girona', 'Granada', 'Guadalajara', 'Guipúzcoa', 'Huelva', 'Huesca', 'Jaén', 'La Rioja', 'Las Palmas',
  'León', 'Lleida', 'Lugo', 'Madrid', 'Málaga', 'Melilla', 'Murcia', 'Navarra', 'Ourense', 'Palencia', 'Pontevedra', 'Salamanca', 'Santa Cruz de Tenerife',
  'Segovia', 'Sevilla', 'Soria', 'Tarragona', 'Teruel', 'Toledo', 'Valencia', 'Valladolid', 'Vizcaya', 'Zamora', 'Zaragoza',
];

const schema = z.object({
  label: z.string().trim().max(40, 'Máximo 40 caracteres').optional(),
  fullName: z.string().trim().min(3, 'Indica el nombre completo del destinatario').max(100),
  phone: z.string().trim().regex(/^(\+34|0034)?[6789]\d{8}$/, 'Introduce un teléfono español válido (9 dígitos)'),
  line1: z.string().trim().min(5, 'La dirección debe tener al menos 5 caracteres').max(120),
  line2: z.string().trim().max(120).optional(),
  city: z.string().trim().min(2, 'Indica la ciudad').max(80),
  province: z.string().min(1, 'Selecciona una provincia'),
  postalCode: z.string().trim().regex(/^(0[1-9]|[1-4]\d|5[0-2])\d{3}$/, 'Código postal español no válido (5 dígitos)'),
  isDefault: z.boolean().optional(),
});
export type AddressFormValues = z.infer<typeof schema>;

export function AddressForm({ address, onSaved, onCancel }: { address?: Address; onSaved: (a: Address) => void; onCancel?: () => void }) {
  const qc = useQueryClient();
  const { register, handleSubmit, setError, formState } = useForm<AddressFormValues>({
    resolver: zodResolver(schema),
    defaultValues: address
      ? { ...address, label: address.label ?? '', line2: address.line2 ?? '' }
      : { label: '', fullName: '', phone: '', line1: '', line2: '', city: '', province: '', postalCode: '', isDefault: false },
  });
  const save = useMutation({
    mutationFn: (v: AddressFormValues) => {
      const body = { ...v, label: v.label || undefined, line2: v.line2 || (address ? null : undefined) };
      return address ? http.patch<Address>(`/users/me/addresses/${address.id}`, body) : http.post<Address>('/users/me/addresses', body);
    },
    onSuccess: (a) => {
      void qc.invalidateQueries({ queryKey: ['addresses'] });
      toast.success(address ? 'Dirección actualizada' : 'Dirección guardada');
      onSaved(a);
    },
    onError: (e) => {
      if (e instanceof ApiError) Object.entries(e.fieldErrors).forEach(([f, m]) => setError(f as keyof AddressFormValues, { message: m }));
      toast.error(errorMessage(e));
    },
  });
  const err = formState.errors;
  return (
    <form onSubmit={handleSubmit((v) => save.mutate(v))} noValidate className="grid gap-4 sm:grid-cols-2" aria-label="Dirección de envío" data-testid="address-form">
      <Input label="Nombre y apellidos del destinatario" required autoComplete="name" {...register('fullName')} error={err.fullName?.message} wrapperClassName="sm:col-span-2" />
      <Input label="Dirección" required autoComplete="address-line1" placeholder="Calle, número, piso" {...register('line1')} error={err.line1?.message} wrapperClassName="sm:col-span-2" />
      <Input label="Información adicional" autoComplete="address-line2" placeholder="Escalera, bloque… (opcional)" {...register('line2')} error={err.line2?.message} wrapperClassName="sm:col-span-2" />
      <Input label="Código postal" required inputMode="numeric" autoComplete="postal-code" maxLength={5} {...register('postalCode')} error={err.postalCode?.message} />
      <Input label="Ciudad" required autoComplete="address-level2" {...register('city')} error={err.city?.message} />
      <Select label="Provincia" required {...register('province')} error={err.province?.message}>
        <option value="">Selecciona…</option>
        {PROVINCES.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </Select>
      <Input label="Teléfono" required type="tel" autoComplete="tel" {...register('phone')} error={err.phone?.message} />
      <Input label="Etiqueta" placeholder="Casa, trabajo… (opcional)" {...register('label')} error={err.label?.message} />
      <div className="flex items-end pb-2">
        <Checkbox label="Usar como dirección predeterminada" {...register('isDefault')} disabled={address?.isDefault} />
      </div>
      <p className="text-xs text-slate-500 sm:col-span-2">Solo realizamos envíos a España.</p>
      <div className="flex gap-3 sm:col-span-2">
        <Button type="submit" loading={save.isPending} data-testid="address-save">
          Guardar dirección
        </Button>
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
        )}
      </div>
    </form>
  );
}
