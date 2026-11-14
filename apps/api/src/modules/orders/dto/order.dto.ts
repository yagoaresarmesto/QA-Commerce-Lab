import { ApiProperty } from '@nestjs/swagger';
import { ActorType, OrderPaymentStatus, OrderStatus, PaymentMethod, PaymentStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { PageMetaDto } from '../../../common/dto/pagination.dto';
import { StrictString, Trim } from '../../../common/validators';
import { PickupPointDto } from '../../cart/dto/shipping.dto';

export class CardDetailsDto {
  /** Test card number (see docs/TESTING.md). Real cards are rejected. */
  @ApiProperty({ example: '4242 4242 4242 4242' })
  @IsString()
  @Matches(/^[\d\s-]{12,23}$/, { message: 'El número de tarjeta no es válido' })
  number: string;

  @ApiProperty({ example: 'ANA GARCIA' })
  @StrictString(2, 80, 'El titular')
  holderName: string;

  @ApiProperty({ example: 12 })
  @IsInt()
  @Min(1)
  @Max(12)
  expMonth: number;

  @ApiProperty({ example: 2030 })
  @IsInt()
  @Min(2000)
  @Max(2100)
  expYear: number;

  @ApiProperty({ example: '123' })
  @Matches(/^\d{3,4}$/, { message: 'El CVC debe tener 3 o 4 dígitos' })
  cvc: string;
}

export class PaymentInputDto {
  @ApiProperty({ enum: PaymentMethod, example: PaymentMethod.CARD })
  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;

  /** Required when paymentMethod = CARD */
  @ApiProperty({ required: false, type: CardDetailsDto })
  @ValidateIf((o: PaymentInputDto) => o.paymentMethod === PaymentMethod.CARD)
  @IsNotEmpty({ message: 'Los datos de la tarjeta son obligatorios para pagar con tarjeta' })
  @ValidateNested()
  @Type(() => CardDetailsDto)
  card?: CardDetailsDto;
}

export class CheckoutQuoteDto {
  @ApiProperty({ example: 1, required: false })
  @IsOptional()
  @IsInt()
  @Min(1)
  addressId?: number;

  @ApiProperty({ example: 'STANDARD', enum: ['STANDARD', 'EXPRESS', 'PICKUP'] })
  @IsString()
  @IsIn(['STANDARD', 'EXPRESS', 'PICKUP'], { message: 'Método de envío no válido' })
  shippingMethodCode: string;

  /** Required for PICKUP */
  @IsOptional()
  @IsInt()
  @Min(1)
  pickupPointId?: number;
}

export class CreateOrderDto extends PaymentInputDto {
  @ApiProperty({ example: 1 })
  @IsInt({ message: 'Selecciona una dirección de envío' })
  @Min(1)
  addressId: number;

  @ApiProperty({ example: 'STANDARD', enum: ['STANDARD', 'EXPRESS', 'PICKUP'] })
  @IsString()
  @IsIn(['STANDARD', 'EXPRESS', 'PICKUP'], { message: 'Método de envío no válido' })
  shippingMethodCode: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  pickupPointId?: number;

  /**
   * Total shown to the customer in the review step. If it differs from the total computed by the
   * server (prices changed meanwhile), the order is rejected with 409 PRICE_CHANGED.
   */
  @IsOptional()
  @IsInt()
  @Min(0)
  expectedTotalCents?: number;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(500)
  customerNote?: string;
}

export class CancelOrderDto {
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(300)
  reason?: string;
}

export class ReturnOrderDto {
  @ApiProperty({ example: 'El producto no cumple mis expectativas' })
  @StrictString(5, 500, 'El motivo')
  reason: string;
}

export class OrderListQueryDto {
  @ApiProperty({ required: false, enum: OrderStatus })
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize?: number = 10;
}

// ─── Responses ───────────────────────────────────────────────────────────

export class OrderItemDto {
  id: number;
  productId: number | null;
  productSlug: string | null;
  sku: string;
  name: string;
  brandName: string;
  imageUrl: string | null;
  unitPriceCents: number;
  compareAtPriceCents: number | null;
  quantity: number;
  lineTotalCents: number;
}

export class OrderAddressDto {
  fullName: string;
  phone: string;
  line1: string;
  line2: string | null;
  city: string;
  province: string;
  postalCode: string;
  country: string;
}

export class OrderHistoryDto {
  fromStatus: OrderStatus | null;
  @ApiProperty({ enum: OrderStatus })
  toStatus: OrderStatus;
  note: string | null;
  @ApiProperty({ enum: ActorType })
  actorType: ActorType;
  createdAt: Date;
}

export class PaymentDto {
  id: number;
  @ApiProperty({ enum: PaymentMethod })
  method: PaymentMethod;
  @ApiProperty({ enum: PaymentStatus })
  status: PaymentStatus;
  amountCents: number;
  cardBrand: string | null;
  cardLast4: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  /** Simulated provider reference (bank transfer reference for BANK_TRANSFER) */
  providerReference: string;
  /** When a PENDING card payment will be resolved by the simulator */
  resolveAt: Date | null;
  createdAt: Date;
  resolvedAt: Date | null;
}

export class OrderActionsDto {
  canCancel: boolean;
  canRequestReturn: boolean;
  canPay: boolean;
  returnDeadline: Date | null;
}

export class OrderShippingMethodDto {
  code: string;
  name: string;
}

export class OrderSummaryDto {
  id: number;
  orderNumber: string;
  @ApiProperty({ enum: OrderStatus })
  status: OrderStatus;
  @ApiProperty({ enum: OrderPaymentStatus })
  paymentStatus: OrderPaymentStatus;
  @ApiProperty({ enum: PaymentMethod })
  paymentMethod: PaymentMethod;
  totalCents: number;
  itemsCount: number;
  previewImages: string[];
  createdAt: Date;
}

export class OrderDto extends OrderSummaryDto {
  items: OrderItemDto[];
  shippingAddress: OrderAddressDto;
  shippingMethod: OrderShippingMethodDto;
  pickupPoint: PickupPointDto | null;
  subtotalCents: number;
  discountCents: number;
  shippingCents: number;
  taxCents: number;
  couponCode: string | null;
  customerNote: string | null;
  trackingNumber: string | null;
  /** PENDING orders are cancelled automatically when the reservation expires without payment */
  reservationExpiresAt: Date | null;
  paidAt: Date | null;
  preparingAt: Date | null;
  shippedAt: Date | null;
  deliveredAt: Date | null;
  cancelledAt: Date | null;
  cancelReason: string | null;
  returnRequestedAt: Date | null;
  returnReason: string | null;
  returnedAt: Date | null;
  history: OrderHistoryDto[];
  payments: PaymentDto[];
  actions: OrderActionsDto;
  updatedAt: Date;
}

export class OrderListResponseDto {
  data: OrderSummaryDto[];
  meta: PageMetaDto;
}

export class OrderPaymentResultDto {
  order: OrderDto;
  payment: PaymentDto | null;
}

export class QuoteLineDto {
  productId: number;
  name: string;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
}

export class CheckoutQuoteResponseDto {
  lines: QuoteLineDto[];
  subtotalCents: number;
  discountCents: number;
  shippingCents: number;
  shippingBaseCents: number;
  freeShippingApplied: boolean;
  taxCents: number;
  totalCents: number;
  couponCode: string | null;
  couponError: { code: string; message: string } | null;
  shippingMethod: OrderShippingMethodDto;
  /** Checkout is blocked while the cart has issues */
  hasIssues: boolean;
}
