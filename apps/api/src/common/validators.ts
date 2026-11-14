import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export const PASSWORD_POLICY_MESSAGE =
  'The password must be 8-64 characters long and include at least one uppercase letter, one lowercase letter and one number';

/** Password policy: 8-64 chars, at least one lowercase, one uppercase and one digit. */
export function IsStrongPassword() {
  return applyDecorators(
    IsNotEmpty({ message: 'Password is required' }),
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
    IsNotEmpty({ message: `${label} is required` }),
    IsString({ message: `${label} must be a string` }),
    MinLength(min, { message: `${label} must be at least ${min} characters long` }),
    MaxLength(max, { message: `${label} must be at most ${max} characters long` }),
  );
}
