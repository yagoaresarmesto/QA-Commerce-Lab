import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { AVAILABILITY, Availability } from '../../catalog/dto/product.dto';

export const CART_ISSUES = ['UNAVAILABLE', 'OUT_OF_STOCK', 'INSUFFICIENT_STOCK'] as const;
export type CartIssueCode = (typeof CART_ISSUES)[number];

export class AddCartItemDto {
  @ApiProperty({ example: 1 })
  @IsInt({ message: 'productId must be an integer' })
  @Min(1)
  productId: number;

  /** Units to add (1-10). Added to the existing quantity if the product is already in the cart. */
  @ApiProperty({ example: 1, minimum: 1, maximum: 10 })
  @IsInt({ message: 'The quantity must be an integer' })
  @Min(1, { message: 'The minimum quantity is 1' })
  @Max(10, { message: 'The maximum quantity per product is 10' })
  quantity: number;
}

export class UpdateCartItemDto {
  /** New quantity (1-10). Use DELETE to remove the item. */
  @ApiProperty({ example: 2, minimum: 1, maximum: 10 })
  @IsInt({ message: 'The quantity must be an integer' })
  @Min(1, { message: 'The minimum quantity is 1. Use DELETE to remove the product' })
  @Max(10, { message: 'The maximum quantity per product is 10' })
  quantity: number;
}

export class ApplyCouponDto {
  @ApiProperty({ example: 'WELCOME10' })
  @IsString()
  @IsNotEmpty({ message: 'The coupon code is required' })
  @MaxLength(40)
  code: string;
}

export class MergeCartDto {
  /** Token of the guest cart (X-Cart-Token) to merge into the user's cart */
  @IsUUID('4', { message: 'guestCartToken must be a UUID' })
  guestCartToken: string;
}

export class CartIssueDto {
  @ApiProperty({ enum: CART_ISSUES })
  code: CartIssueCode;
  message: string;
  availableStock?: number;
}

export class CartProductDto {
  id: number;
  sku: string;
  slug: string;
  name: string;
  brandName: string;
  categoryId: number;
  imageUrl: string;
  priceCents: number;
  compareAtPriceCents: number | null;
  stock: number;
  @ApiProperty({ enum: AVAILABILITY })
  availability: Availability;
  isActive: boolean;
}

export class CartItemDto {
  id: number;
  productId: number;
  product: CartProductDto;
  quantity: number;
  /** Current unit price (source of truth) */
  unitPriceCents: number;
  lineTotalCents: number;
  /** True when the price changed since the product was added/last modified */
  priceChanged: boolean;
  previousUnitPriceCents: number | null;
  issues: CartIssueDto[];
  addedAt: Date;
}

export class CartCouponDto {
  code: string;
  description: string;
  type: string;
  value: number;
}

export class CartCouponErrorDto {
  code: string;
  message: string;
}

export class CartTotalsDto {
  /** Sum of purchasable lines (lines with issues are excluded) */
  subtotalCents: number;
  discountCents: number;
  /** Standard shipping estimate; the final cost depends on the method chosen at checkout */
  shippingEstimateCents: number;
  totalCents: number;
  taxCents: number;
  freeShippingThresholdCents: number | null;
  amountToFreeShippingCents: number | null;
}

export class CartDto {
  id: number | null;
  /** Guest cart token. Send it back as X-Cart-Token. Null for user carts. */
  token: string | null;
  items: CartItemDto[];
  /** Total units */
  itemsCount: number;
  coupon: CartCouponDto | null;
  /** Set when the applied coupon is no longer valid for the current cart (discount not applied) */
  couponError: CartCouponErrorDto | null;
  totals: CartTotalsDto;
  /** Any item has a blocking issue: checkout is not possible until fixed */
  hasIssues: boolean;
  updatedAt: Date | null;
}
