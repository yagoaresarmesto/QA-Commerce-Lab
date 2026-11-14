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
  label: z.string().trim().max(40, 'Maximum 40 characters').optional(),
  fullName: z.string().trim().min(3, 'Enter the recipient full name').max(100),
  phone: z.string().trim().regex(/^(\+34|0034)?[6789]\d{8}$/, 'Enter a valid Spanish phone number (9 digits)'),
  line1: z.string().trim().min(5, 'The address must be at least 5 characters long').max(120),
  line2: z.string().trim().max(120).optional(),
  city: z.string().trim().min(2, 'Enter the city').max(80),
  province: z.string().min(1, 'Select a province'),
  postalCode: z.string().trim().regex(/^(0[1-9]|[1-4]\d|5[0-2])\d{3}$/, 'Invalid Spanish postal code (5 digits)'),
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
      toast.success(address ? 'Address updated' : 'Address saved');
      onSaved(a);
    },
    onError: (e) => {
      if (e instanceof ApiError) Object.entries(e.fieldErrors).forEach(([f, m]) => setError(f as keyof AddressFormValues, { message: m }));
      toast.error(errorMessage(e));
    },
  });
  const err = formState.errors;
  return (
    <form onSubmit={handleSubmit((v) => save.mutate(v))} noValidate className="grid gap-4 sm:grid-cols-2" aria-label="Shipping address" data-testid="address-form">
      <Input label="Recipient full name" required autoComplete="name" {...register('fullName')} error={err.fullName?.message} wrapperClassName="sm:col-span-2" />
      <Input label="Address" required autoComplete="address-line1" placeholder="Street, number, floor" {...register('line1')} error={err.line1?.message} wrapperClassName="sm:col-span-2" />
      <Input label="Additional information" autoComplete="address-line2" placeholder="Staircase, block… (optional)" {...register('line2')} error={err.line2?.message} wrapperClassName="sm:col-span-2" />
      <Input label="Postal code" required inputMode="numeric" autoComplete="postal-code" maxLength={5} {...register('postalCode')} error={err.postalCode?.message} />
      <Input label="City" required autoComplete="address-level2" {...register('city')} error={err.city?.message} />
      <Select label="Province" required {...register('province')} error={err.province?.message}>
        <option value="">Select…</option>
        {PROVINCES.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </Select>
      <Input label="Phone" required type="tel" autoComplete="tel" {...register('phone')} error={err.phone?.message} />
      <Input label="Label" placeholder="Home, work… (optional)" {...register('label')} error={err.label?.message} />
      <div className="flex items-end pb-2">
        <Checkbox label="Use as default address" {...register('isDefault')} disabled={address?.isDefault} />
      </div>
      <p className="text-xs text-slate-500 sm:col-span-2">We only ship to Spain.</p>
      <div className="flex gap-3 sm:col-span-2">
        <Button type="submit" loading={save.isPending} data-testid="address-save">
          Save address
        </Button>
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
