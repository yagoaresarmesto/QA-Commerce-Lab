import { ApiProperty } from '@nestjs/swagger';
import { CouponType, OrderPaymentStatus, OrderStatus, Role, UserStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDate,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  NotEquals,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { PageMetaDto } from '../../../common/dto/pagination.dto';
import { StrictString, Trim } from '../../../common/validators';
import { ProductDetailDto } from '../../catalog/dto/product.dto';
import { OrderDto, OrderSummaryDto } from '../../orders/dto/order.dto';
import { UserDto } from '../../users/dto/user.dto';

const toBool = () =>
  Transform(({ value }) => (value === 'true' || value === true ? true : value === 'false' || value === false ? false : value));

// ─── Products ───────────────────────────────────────────────────────────

export class AdminProductQueryDto {
  /** Search by name, brand, category or SKU */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  categoryId?: number;

  @ApiProperty({ required: false, enum: ['active', 'inactive', 'all'], default: 'all' })
  @IsOptional()
  @IsIn(['active', 'inactive', 'all'])
  status?: 'active' | 'inactive' | 'all' = 'all';

  @ApiProperty({ required: false, enum: ['out', 'low', 'in'] })
  @IsOptional()
  @IsIn(['out', 'low', 'in'])
  stock?: 'out' | 'low' | 'in';

  @ApiProperty({ required: false, enum: ['newest', 'name', 'price_asc', 'price_desc', 'stock_asc', 'stock_desc', 'sales'] })
  @IsOptional()
  @IsIn(['newest', 'name', 'price_asc', 'price_desc', 'stock_asc', 'stock_desc', 'sales'])
  sort?: string = 'newest';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;
}

export class ProductSpecInputDto {
  @StrictString(1, 60, 'Spec name')
  name: string;

  @StrictString(1, 200, 'Spec value')
  value: string;
}

export class CreateProductDto {
  @ApiProperty({ example: 'QCL-LAP-9001' })
  @Trim()
  @Matches(/^[A-Z0-9][A-Z0-9-]{2,39}$/, { message: 'The SKU must be 3-40 characters long (uppercase letters, digits or hyphens)' })
  sku: string;

  @ApiProperty({ example: 'ASUS Vivobook 15 OLED Core i5' })
  @StrictString(3, 150, 'Name')
  name: string;

  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  brandId: number;

  /** Must be a leaf category (without subcategories) */
  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  categoryId: number;

  @StrictString(10, 200, 'Short description')
  shortDescription: string;

  @StrictString(20, 5000, 'Description')
  description: string;

  @ApiProperty({ example: 89999, description: 'Price in cents (VAT included)' })
  @IsInt({ message: 'The price must be an integer number of cents' })
  @Min(1, { message: 'The price must be greater than 0' })
  @Max(100_000_000)
  priceCents: number;

  /** Previous price (must be greater than priceCents). Null = not on sale. */
  @ApiProperty({ required: false, nullable: true, example: 99999 })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsInt()
  @Min(1)
  @Max(100_000_000)
  compareAtPriceCents?: number | null;

  @ApiProperty({ example: 25 })
  @IsInt({ message: 'Stock must be an integer' })
  @Min(0, { message: 'Stock cannot be negative' })
  @Max(100_000)
  stock: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;

  @ApiProperty({ type: [ProductSpecInputDto], required: false })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => ProductSpecInputDto)
  specs?: ProductSpecInputDto[];

  /** Image URLs (absolute http(s) URLs or /api/media/... paths). If omitted an illustration is generated. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @IsString({ each: true })
  @Matches(/^(https?:\/\/|\/api\/media\/)[^\s]{1,500}$/, { each: true, message: 'Each image must be an http(s) URL or an /api/media/... path' })
  imageUrls?: string[];

  /** Accent colour (hex, without #) for the generated illustration */
  @IsOptional()
  @Matches(/^[0-9a-fA-F]{6}$/, { message: 'The color must be a 6-digit hexadecimal value' })
  imageColor?: string;
}

export class UpdateProductDto {
  @IsOptional()
  @StrictString(3, 150, 'Name')
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  brandId?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  categoryId?: number;

  @IsOptional()
  @StrictString(10, 200, 'Short description')
  shortDescription?: string;

  @IsOptional()
  @StrictString(20, 5000, 'Description')
  description?: string;

  @IsOptional()
  @IsInt({ message: 'The price must be an integer number of cents' })
  @Min(1, { message: 'The price must be greater than 0' })
  @Max(100_000_000)
  priceCents?: number;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsInt()
  @Min(1)
  @Max(100_000_000)
  compareAtPriceCents?: number | null;

  /** Absolute stock value. For concurrent-safe changes use POST /admin/products/:id/stock-adjustments */
  @IsOptional()
  @IsInt({ message: 'Stock must be an integer' })
  @Min(0, { message: 'Stock cannot be negative' })
  @Max(100_000)
  stock?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;

  @ApiProperty({ type: [ProductSpecInputDto], required: false })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => ProductSpecInputDto)
  specs?: ProductSpecInputDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @IsString({ each: true })
  @Matches(/^(https?:\/\/|\/api\/media\/)[^\s]{1,500}$/, { each: true, message: 'Each image must be an http(s) URL or an /api/media/... path' })
  imageUrls?: string[];
}

export class StockAdjustmentDto {
  /** Units to add (positive) or remove (negative). The stock never goes below 0. */
  @ApiProperty({ example: -2 })
  @IsInt()
  @NotEquals(0, { message: 'The adjustment cannot be 0' })
  @Min(-100_000)
  @Max(100_000)
  delta: number;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(200)
  reason?: string;
}

export class AdminProductDto extends ProductDetailDto {
  isReference: boolean;
  testRunId: string | null;
}

export class AdminProductListDto {
  data: AdminProductDto[];
  meta: PageMetaDto;
}

// ─── Orders ─────────────────────────────────────────────────────────────

export class AdminOrderQueryDto {
  @ApiProperty({ required: false, enum: OrderStatus })
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @ApiProperty({ required: false, enum: OrderPaymentStatus })
  @IsOptional()
  @IsEnum(OrderPaymentStatus)
  paymentStatus?: OrderPaymentStatus;

  /** Order number or customer e-mail (partial) */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;

  @ApiProperty({ required: false, enum: ['newest', 'oldest', 'total_desc', 'total_asc'] })
  @IsOptional()
  @IsIn(['newest', 'oldest', 'total_desc', 'total_asc'])
  sort?: string = 'newest';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;
}

export class UpdateOrderStatusDto {
  @ApiProperty({ enum: OrderStatus, example: OrderStatus.PREPARING })
  @IsEnum(OrderStatus)
  status: OrderStatus;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(300)
  note?: string;

  /** Optional tracking number when moving to SHIPPED (generated if omitted) */
  @IsOptional()
  @Matches(/^[A-Z0-9-]{6,40}$/, { message: 'Invalid tracking number' })
  trackingNumber?: string;
}

export class OrderCustomerDto {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
}

export class AdminOrderSummaryDto extends OrderSummaryDto {
  customer: OrderCustomerDto;
}

export class AdminOrderDto extends OrderDto {
  customer: OrderCustomerDto;
  /** Statuses an admin can move this order to */
  @ApiProperty({ enum: OrderStatus, isArray: true })
  allowedTransitions: OrderStatus[];
  canConfirmPayment: boolean;
  testRunId: string | null;
}

export class AdminOrderListDto {
  data: AdminOrderSummaryDto[];
  meta: PageMetaDto;
}

// ─── Users ──────────────────────────────────────────────────────────────

export class AdminUserQueryDto {
  /** E-mail or name (partial) */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiProperty({ required: false, enum: Role })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @ApiProperty({ required: false, enum: UserStatus })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;
}

export class AdminUpdateUserDto {
  /** DISABLED users cannot log in and all their sessions are revoked */
  @ApiProperty({ required: false, enum: UserStatus })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @ApiProperty({ required: false, enum: Role })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;
}

export class AdminUserDto extends UserDto {
  ordersCount: number;
  totalSpentCents: number;
  addressesCount: number;
  isReference: boolean;
  testRunId: string | null;
  updatedAt: Date;
}

export class AdminUserListDto {
  data: AdminUserDto[];
  meta: PageMetaDto;
}

// ─── Coupons ────────────────────────────────────────────────────────────

export class AdminCouponQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  q?: string;

  @IsOptional()
  @toBool()
  @IsBoolean()
  active?: boolean;
}

export class CreateCouponDto {
  @ApiProperty({ example: 'SUMMER25' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @Matches(/^[A-Z0-9_-]{3,30}$/, { message: 'The code must be 3-30 characters long (A-Z, 0-9, _ or -)' })
  code: string;

  @StrictString(3, 200, 'Description')
  description: string;

  @ApiProperty({ enum: CouponType })
  @IsEnum(CouponType)
  type: CouponType;

  /** PERCENTAGE: 1-100 · FIXED_AMOUNT: cents · FREE_SHIPPING: 0 */
  @IsInt()
  @Min(0)
  @Max(100_000_000)
  value: number;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsInt()
  @Min(0)
  minSubtotalCents?: number | null;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsInt()
  @Min(1)
  maxDiscountCents?: number | null;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsInt()
  @Min(1)
  categoryId?: number | null;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @Type(() => Date)
  @IsDate()
  startsAt?: Date | null;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @Type(() => Date)
  @IsDate()
  expiresAt?: Date | null;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsInt()
  @Min(1)
  usageLimit?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  perUserLimit?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateCouponDto {
  @IsOptional()
  @StrictString(3, 200, 'Description')
  description?: string;

  @ApiProperty({ required: false, enum: CouponType })
  @IsOptional()
  @IsEnum(CouponType)
  type?: CouponType;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100_000_000)
  value?: number;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsInt()
  @Min(0)
  minSubtotalCents?: number | null;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsInt()
  @Min(1)
  maxDiscountCents?: number | null;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsInt()
  @Min(1)
  categoryId?: number | null;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @Type(() => Date)
  @IsDate()
  startsAt?: Date | null;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @Type(() => Date)
  @IsDate()
  expiresAt?: Date | null;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsInt()
  @Min(1)
  usageLimit?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  perUserLimit?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class AdminCouponDto {
  id: number;
  code: string;
  description: string;
  @ApiProperty({ enum: CouponType })
  type: CouponType;
  value: number;
  minSubtotalCents: number | null;
  maxDiscountCents: number | null;
  categoryId: number | null;
  categoryName: string | null;
  startsAt: Date | null;
  expiresAt: Date | null;
  usageLimit: number | null;
  perUserLimit: number;
  timesUsed: number;
  isActive: boolean;
  /** ACTIVE | INACTIVE | SCHEDULED | EXPIRED | EXHAUSTED */
  state: string;
  isReference: boolean;
  testRunId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Dashboard ──────────────────────────────────────────────────────────

export class DashboardTotalsDto {
  users: number;
  customers: number;
  products: number;
  activeProducts: number;
  orders: number;
  revenueCents: number;
  averageOrderCents: number;
  outOfStockProducts: number;
  lowStockProducts: number;
  pendingOrders: number;
  ordersToShip: number;
  returnRequests: number;
}

export class StatusCountDto {
  @ApiProperty({ enum: OrderStatus })
  status: OrderStatus;
  count: number;
}

export class DailySalesDto {
  /** YYYY-MM-DD */
  date: string;
  orders: number;
  revenueCents: number;
}

export class StockAlertDto {
  id: number;
  sku: string;
  name: string;
  stock: number;
}

export class TopProductDto {
  id: number;
  sku: string;
  name: string;
  salesCount: number;
}

export class DashboardDto {
  totals: DashboardTotalsDto;
  ordersByStatus: StatusCountDto[];
  salesLast14Days: DailySalesDto[];
  recentOrders: AdminOrderSummaryDto[];
  lowStock: StockAlertDto[];
  topProducts: TopProductDto[];
}
