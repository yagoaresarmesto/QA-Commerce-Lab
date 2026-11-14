import { ApiProperty } from '@nestjs/swagger';
import { Equals, IsBoolean, IsEmail, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { IsStrongPassword, NormalizeEmail, SPANISH_PHONE, StrictString, Trim } from '../../../common/validators';
import { UserDto } from '../../users/dto/user.dto';

export class RegisterDto {
  @ApiProperty({ example: 'ana.garcia@example.com' })
  @NormalizeEmail()
  @IsEmail({}, { message: 'The e-mail format is not valid' })
  @MaxLength(254)
  email: string;

  @ApiProperty({ example: 'Secret123', description: '8-64 characters, with uppercase, lowercase and a number' })
  @IsStrongPassword()
  password: string;

  @ApiProperty({ example: 'Ana' })
  @StrictString(2, 50, 'First name')
  firstName: string;

  @ApiProperty({ example: 'García López' })
  @StrictString(2, 80, 'Last name')
  lastName: string;

  @ApiProperty({ required: false, example: '600123123' })
  @IsOptional()
  @Trim()
  @Matches(SPANISH_PHONE, { message: 'The phone must be a valid Spanish number (9 digits)' })
  phone?: string;

  /** Must be true: the user accepts the terms and conditions */
  @ApiProperty({ example: true })
  @IsBoolean({ message: 'You must accept the terms and conditions' })
  @Equals(true, { message: 'You must accept the terms and conditions' })
  acceptTerms: boolean;

  @IsOptional()
  @IsBoolean()
  marketingOptIn?: boolean;
}

export class LoginDto {
  @ApiProperty({ example: 'customer@qacommerce.test' })
  @NormalizeEmail()
  @IsEmail({}, { message: 'The e-mail format is not valid' })
  email: string;

  @ApiProperty({ example: 'Customer123!' })
  @IsString()
  @IsNotEmpty({ message: 'Password is required' })
  @MaxLength(128)
  password: string;
}

export class RefreshDto {
  /** Refresh token. Optional when sent as the `qcl_rt` httpOnly cookie. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  refreshToken?: string;
}

export class ForgotPasswordDto {
  @ApiProperty({ example: 'customer@qacommerce.test' })
  @NormalizeEmail()
  @IsEmail({}, { message: 'The e-mail format is not valid' })
  email: string;
}

export class ResetPasswordDto {
  @IsString()
  @IsNotEmpty({ message: 'The token is required' })
  @MaxLength(200)
  token: string;

  @ApiProperty({ example: 'NewPass123' })
  @IsStrongPassword()
  newPassword: string;
}

export class AuthResponseDto {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  /** Access token lifetime in seconds */
  expiresIn: number;
  refreshTokenExpiresAt: Date;
  user: UserDto;
}

export class MessageResponseDto {
  message: string;
}

export class ResetTokenStatusDto {
  valid: boolean;
  /** Masked e-mail of the account (e.g. c*****r@qacommerce.test) */
  email: string;
  expiresAt: Date;
}
