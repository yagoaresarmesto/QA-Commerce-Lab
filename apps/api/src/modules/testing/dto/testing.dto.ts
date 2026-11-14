import { ApiProperty } from '@nestjs/swagger';
import { CouponType, OrderStatus, PaymentMethod, Role, UserStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  Equals,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { TEST_RUN_ID_PATTERN } from '../../../common/request-context';

const RunId = () => Matches(TEST_RUN_ID_PATTERN, { message: 'runId: 3-64 characters [A-Za-z0-9._-], starting with a letter or digit' });

export class RunScopedDto {
  /** Automation run identifier. Defaults to the X-Test-Run-Id header, or a generated one (returned in the response). */
  @IsOptional()
  @RunId()
  runId?: string;
}

export class ResetDto {
  /** Must be the literal string "RESET" */
  @ApiProperty({ example: 'RESET' })
  @Equals('RESET', { message: 'Send { "confirm": "RESET" } to confirm the global reset' })
  confirm: string;
}

export class CreateTestUserDto extends RunScopedDto {
  /** Defaults to a unique e-mail containing the runId */
  @IsOptional()
  @IsEmail()
  email?: string;

  /** Defaults to Test1234! */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  password?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  lastName?: string;

  @ApiProperty({ required: false, enum: Role })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @ApiProperty({ required: false, enum: UserStatus })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  /** Create a default shipping address (default: true) */
  @IsOptional()
  @IsBoolean()
  withAddress?: boolean;

  /** Also open a session and return tokens (default: true) */
  @IsOptional()
  @IsBoolean()
  login?: boolean;

  /** Custom access token lifetime in seconds (e.g. 5 to test expiration) */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(86400)
  accessTtlSeconds?: number;
}

export class TestTokenDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsInt()
  userId?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(86400)
  accessTtlSeconds?: number;

  /** Refresh token / session lifetime in seconds */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30 * 86400)
  refreshTtlSeconds?: number;
}

export class ExpireSessionsDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsInt()
  userId?: number;

  /** expire: sessions reach their expiry date (SESSION_EXPIRED) · revoke: like a logout (SESSION_REVOKED) */
  @ApiProperty({ required: false, enum: ['expire', 'revoke'], default: 'expire' })
  @IsOptional()
  @IsIn(['expire', 'revoke'])
  mode?: 'expire' | 'revoke';
}

export class CreateTestProductDto extends RunScopedDto {
  @IsOptional()
  @IsString()
  @MaxLength(150)
  name?: string;

  /** Leaf category slug (default: accesorios) */
  @IsOptional()
  @IsString()
  categorySlug?: string;

  /** Brand slug (default: anker) */
  @IsOptional()
  @IsString()
  brandSlug?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  priceCents?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  compareAtPriceCents?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  stock?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;
}

export class PatchTestProductDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  stock?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  priceCents?: number;

  /** null removes the previous price */
  @IsOptional()
  @IsInt()
  @Min(1)
  compareAtPriceCents?: number | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class TestItemDto {
  @IsOptional()
  @IsInt()
  productId?: number;

  @IsOptional()
  @IsString()
  sku?: string;

  @IsInt()
  @Min(1)
  @Max(100)
  quantity: number;
}

export class PrepareCartDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsInt()
  userId?: number;

  @ApiProperty({ type: [TestItemDto] })
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => TestItemDto)
  items: TestItemDto[];

  @IsOptional()
  @IsString()
  couponCode?: string;

  /** Replace the current cart content (default true) */
  @IsOptional()
  @IsBoolean()
  replace?: boolean;

  /** Skip stock/availability validation to build carts with issues (default false) */
  @IsOptional()
  @IsBoolean()
  force?: boolean;
}

export class CreateTestOrderDto extends RunScopedDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsInt()
  userId?: number;

  @ApiProperty({ type: [TestItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => TestItemDto)
  items: TestItemDto[];

  @ApiProperty({ enum: OrderStatus, example: OrderStatus.PAID })
  @IsEnum(OrderStatus)
  status: OrderStatus;

  @ApiProperty({ required: false, enum: PaymentMethod })
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  /** For PENDING orders: leave a failed payment attempt (retry scenario) */
  @IsOptional()
  @IsBoolean()
  failedPayment?: boolean;

  @IsOptional()
  @IsIn(['STANDARD', 'EXPRESS', 'PICKUP'])
  shippingMethodCode?: string;

  @IsOptional()
  @IsString()
  couponCode?: string;

  /** Decrement inventory like a real order (default true) */
  @IsOptional()
  @IsBoolean()
  decrementStock?: boolean;

  /** Shift the whole timeline to the past (e.g. 20 → delivered 20 days ago, outside the return window) */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3650)
  daysAgo?: number;
}

export class CreateTestCouponDto extends RunScopedDto {
  /** Defaults to a unique code containing the runId */
  @IsOptional()
  @Matches(/^[A-Z0-9_-]{3,40}$/)
  code?: string;

  @ApiProperty({ enum: CouponType, required: false })
  @IsOptional()
  @IsEnum(CouponType)
  type?: CouponType;

  @IsOptional()
  @IsInt()
  @Min(0)
  value?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  minSubtotalCents?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxDiscountCents?: number;

  @IsOptional()
  @IsString()
  categorySlug?: string;

  /** Valid from N days relative to now (negative = past) */
  @IsOptional()
  @IsInt()
  startsInDays?: number;

  /** Expires in N days relative to now (negative = already expired) */
  @IsOptional()
  @IsInt()
  expiresInDays?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  usageLimit?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  timesUsed?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  perUserLimit?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ResolvePaymentDto {
  @ApiProperty({ enum: ['APPROVED', 'DECLINED'] })
  @IsIn(['APPROVED', 'DECLINED'])
  outcome: 'APPROVED' | 'DECLINED';
}

export class EmailQueryDto {
  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  @IsString()
  runId?: string;

  @IsOptional()
  @IsString()
  template?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

export class PasswordResetTokenDto {
  @IsEmail()
  email: string;
}

export class CreateFaultDto extends RunScopedDto {
  /** Scope the rule to an authenticated user instead of (or in addition to) a run */
  @IsOptional()
  @IsInt()
  userId?: number;

  /** Apply to every request (only allowed when ALLOW_GLOBAL_FAULTS=true) */
  @IsOptional()
  @IsBoolean()
  global?: boolean;

  @ApiProperty({ required: false, example: 'POST' })
  @IsOptional()
  @IsIn(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])
  method?: string;

  /** Path pattern: exact path, `*` = one segment, `**` = anything. Example: /api/orders/** */
  @ApiProperty({ example: '/api/orders' })
  @IsString()
  @Matches(/^\/api\/[A-Za-z0-9/*_.-]*$/, { message: 'path must start with /api/' })
  path: string;

  @ApiProperty({ enum: ['error', 'delay', 'timeout'] })
  @IsIn(['error', 'delay', 'timeout'])
  action: 'error' | 'delay' | 'timeout';

  /** HTTP status for `error` (default 500) */
  @IsOptional()
  @IsInt()
  @Min(400)
  @Max(599)
  status?: number;

  @IsOptional()
  @Matches(/^[A-Z0-9_]{2,60}$/)
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  message?: string;

  /** Delay before responding (delay/error) or before the 504 (timeout, default 30000) */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(120_000)
  delayMs?: number;

  /** Number of matching requests affected (default: unlimited until ttl). 1 = transient failure */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10_000)
  times?: number;

  /** Rule lifetime in seconds (default 600, max 3600) */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3600)
  ttlSeconds?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;
}

export class ScenarioDto extends RunScopedDto {}
