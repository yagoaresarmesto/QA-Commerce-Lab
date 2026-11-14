import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, ValidateIf } from 'class-validator';
import {
  IsStrongPassword,
  SPANISH_PHONE,
  SPANISH_POSTAL_CODE,
  SPANISH_PROVINCES,
  StrictString,
  Trim,
} from '../../../common/validators';

export class UpdateProfileDto {
  @IsOptional()
  @StrictString(2, 50, 'First name')
  firstName?: string;

  @IsOptional()
  @StrictString(2, 80, 'Last name')
  lastName?: string;

  /** Spanish phone number. Send null or "" to remove it. */
  @ApiProperty({ required: false, nullable: true, example: '600123123' })
  @IsOptional()
  @Trim()
  @ValidateIf((_o, v) => v !== null && v !== '')
  @Matches(SPANISH_PHONE, { message: 'The phone must be a valid Spanish number (9 digits)' })
  phone?: string | null;

  @IsOptional()
  @IsBoolean()
  marketingOptIn?: boolean;
}

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty({ message: 'The current password is required' })
  @MaxLength(128)
  currentPassword: string;

  @ApiProperty({ example: 'NewPass123' })
  @IsStrongPassword()
  newPassword: string;
}

export class AddressInputDto {
  /** Optional label, e.g. "Casa" or "Trabajo" */
  @IsOptional()
  @StrictString(1, 40, 'Label')
  label?: string;

  @ApiProperty({ example: 'Ana García López' })
  @StrictString(3, 100, 'Recipient name')
  fullName: string;

  @ApiProperty({ example: '600123123' })
  @Trim()
  @Matches(SPANISH_PHONE, { message: 'The phone must be a valid Spanish number (9 digits)' })
  phone: string;

  @ApiProperty({ example: 'Calle Mayor 10, 3º B' })
  @StrictString(5, 120, 'Address line 1')
  line1: string;

  @IsOptional()
  @StrictString(1, 120, 'Address line 2')
  line2?: string;

  @ApiProperty({ example: 'Madrid' })
  @StrictString(2, 80, 'City')
  city: string;

  @ApiProperty({ example: 'Madrid', enum: SPANISH_PROVINCES })
  @Trim()
  @IsIn(SPANISH_PROVINCES as unknown as string[], { message: 'The province is not valid' })
  province: string;

  @ApiProperty({ example: '28013', description: 'Spanish postal code (01000-52999)' })
  @Trim()
  @Matches(SPANISH_POSTAL_CODE, { message: 'The postal code must be a 5-digit Spanish postal code (01000-52999)' })
  postalCode: string;

  /** Only Spain (ES) is supported */
  @IsOptional()
  @IsIn(['ES'], { message: 'We only ship to Spain (ES)' })
  country?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class UpdateAddressDto {
  @IsOptional()
  @StrictString(1, 40, 'Label')
  label?: string;

  @IsOptional()
  @StrictString(3, 100, 'Recipient name')
  fullName?: string;

  @IsOptional()
  @Trim()
  @Matches(SPANISH_PHONE, { message: 'The phone must be a valid Spanish number (9 digits)' })
  phone?: string;

  @IsOptional()
  @StrictString(5, 120, 'Address line 1')
  line1?: string;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @StrictString(1, 120, 'Address line 2')
  line2?: string | null;

  @IsOptional()
  @StrictString(2, 80, 'City')
  city?: string;

  @ApiProperty({ required: false, enum: SPANISH_PROVINCES })
  @IsOptional()
  @Trim()
  @IsIn(SPANISH_PROVINCES as unknown as string[], { message: 'The province is not valid' })
  province?: string;

  @IsOptional()
  @Trim()
  @Matches(SPANISH_POSTAL_CODE, { message: 'The postal code must be a 5-digit Spanish postal code (01000-52999)' })
  postalCode?: string;

  @IsOptional()
  @IsIn(['ES'], { message: 'We only ship to Spain (ES)' })
  country?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class AddressDto {
  id: number;
  label: string | null;
  fullName: string;
  phone: string;
  line1: string;
  line2: string | null;
  city: string;
  province: string;
  postalCode: string;
  country: string;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export class SessionDto {
  id: string;
  userAgent: string | null;
  ip: string | null;
  createdAt: Date;
  lastUsedAt: Date;
  expiresAt: Date;
  /** True for the session that made this request */
  current: boolean;
}

export class RevokedCountDto {
  revoked: number;
}
