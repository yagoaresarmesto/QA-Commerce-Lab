import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class ShippingMethodDto {
  id: number;
  /** STANDARD | EXPRESS | PICKUP */
  code: string;
  name: string;
  description: string;
  priceCents: number;
  /** Free when the subtotal after discounts reaches this amount (null = never free) */
  freeOverCents: number | null;
  minDays: number;
  maxDays: number;
  requiresPickupPoint: boolean;
}

export class PickupPointDto {
  id: number;
  code: string;
  name: string;
  address: string;
  city: string;
  province: string;
  postalCode: string;
  openingHours: string;
}

export class PickupPointQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string;

  /** Matches pickup points of the same province (first two digits) */
  @IsOptional()
  @Matches(/^\d{5}$/)
  postalCode?: string;
}
