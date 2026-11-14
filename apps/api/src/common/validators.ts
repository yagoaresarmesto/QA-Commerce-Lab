import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export const PASSWORD_POLICY_MESSAGE =
  'La contraseña debe tener entre 8 y 64 caracteres e incluir al menos una mayúscula, una minúscula y un número';

/** Password policy: 8-64 chars, at least one lowercase, one uppercase and one digit. */
export function IsStrongPassword() {
  return applyDecorators(
    IsNotEmpty({ message: 'La contraseña es obligatoria' }),
    IsString(),
    MinLength(8, { message: PASSWORD_POLICY_MESSAGE }),
    MaxLength(64, { message: PASSWORD_POLICY_MESSAGE }),
    Matches(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, { message: PASSWORD_POLICY_MESSAGE }),
  );
}

/** Trims strings (keeps other values untouched so validation can reject them). */
export const Trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

/** Lower-cases and trims e-mails. */
export const NormalizeEmail = () =>
  Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value));

export const SPANISH_PHONE = /^(\+34|0034)?[6789]\d{8}$/;
export const SPANISH_POSTAL_CODE = /^(0[1-9]|[1-4]\d|5[0-2])\d{3}$/;

export const SPANISH_PROVINCES = [
  'A Coruña', 'Álava', 'Albacete', 'Alicante', 'Almería', 'Asturias', 'Ávila', 'Badajoz', 'Baleares', 'Barcelona',
  'Burgos', 'Cáceres', 'Cádiz', 'Cantabria', 'Castellón', 'Ceuta', 'Ciudad Real', 'Córdoba', 'Cuenca', 'Girona',
  'Granada', 'Guadalajara', 'Guipúzcoa', 'Huelva', 'Huesca', 'Jaén', 'La Rioja', 'Las Palmas', 'León', 'Lleida',
  'Lugo', 'Madrid', 'Málaga', 'Melilla', 'Murcia', 'Navarra', 'Ourense', 'Palencia', 'Pontevedra', 'Salamanca',
  'Santa Cruz de Tenerife', 'Segovia', 'Sevilla', 'Soria', 'Tarragona', 'Teruel', 'Toledo', 'Valencia', 'Valladolid',
  'Vizcaya', 'Zamora', 'Zaragoza',
] as const;

export function StrictString(min: number, max: number, label: string) {
  return applyDecorators(
    Trim(),
    IsNotEmpty({ message: `${label} es obligatorio` }),
    IsString({ message: `${label} debe ser un texto` }),
    MinLength(min, { message: `${label} debe tener al menos ${min} caracteres` }),
    MaxLength(max, { message: `${label} no puede superar ${max} caracteres` }),
  );
}
