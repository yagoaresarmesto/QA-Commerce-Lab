import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Param, Post, Query, Res } from '@nestjs/common';
import {
  ApiBadGatewayResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiGatewayTimeoutResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { AuthUser } from '../../common/auth-user';
import { Authenticated, CurrentUser } from '../../common/decorators/auth.decorators';
import { ErrorResponseDto } from '../../common/dto/error-response.dto';
import { ErrorCode, badRequest } from '../../common/errors';
import {
  CancelOrderDto,
  CheckoutQuoteDto,
  CheckoutQuoteResponseDto,
  CreateOrderDto,
  OrderDto,
  OrderListQueryDto,
  OrderListResponseDto,
  OrderPaymentResultDto,
  PaymentInputDto,
  ReturnOrderDto,
} from './dto/order.dto';
import { IDEMPOTENCY_KEY_PATTERN, OrdersService } from './orders.service';

const IDEMPOTENCY_HEADER = {
  name: 'Idempotency-Key',
  required: false,
  description:
    'Unique key (8-100 characters [A-Za-z0-9_.:-]) per purchase attempt. Repeating the request with the same key returns ' +
    'the original result (200 + Idempotent-Replayed: true header) instead of creating a duplicate.',
};

function checkIdempotencyKey(key: string | undefined): string | undefined {
  if (key === undefined || key === '') return undefined;
  if (!IDEMPOTENCY_KEY_PATTERN.test(key)) {
    throw badRequest(ErrorCode.VALIDATION_ERROR, 'Invalid Idempotency-Key', [
      { field: 'Idempotency-Key', message: 'Must be 8-100 characters [A-Za-z0-9_.:-]' },
    ]);
  }
  return key;
}

@ApiTags('Checkout')
@Authenticated()
@Controller('checkout')
export class CheckoutController {
  constructor(private readonly orders: OrdersService) {}

  @Post('quote')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Order quote',
    description: 'Computes on the server the subtotal, discount, shipping, VAT and total for the current cart and the selected shipping method.',
  })
  @ApiOkResponse({ type: CheckoutQuoteResponseDto })
  @ApiUnprocessableEntityResponse({ description: 'CART_EMPTY | SHIPPING_METHOD_NOT_FOUND | PICKUP_POINT_REQUIRED', type: ErrorResponseDto })
  quote(@CurrentUser() user: AuthUser, @Body() dto: CheckoutQuoteDto): Promise<CheckoutQuoteResponseDto> {
    return this.orders.quote(user.id, dto);
  }
}

@ApiTags('Orders')
@Authenticated()
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  @ApiHeader(IDEMPOTENCY_HEADER)
  @ApiOperation({
    summary: 'Create an order (checkout) and process the payment',
    description:
      'Transactionally turns the user cart into an order (cart lock, stock validation, ' +
      'atomic inventory decrement, coupon, cart emptying) and runs the first payment attempt with the simulator. ' +
      'A declined payment is NOT an HTTP error: the order stays PENDING with paymentStatus FAILED and can be paid again. ' +
      'Gateway errors (502/504) are returned after the order has been created (details.orderId).',
  })
  @ApiCreatedResponse({ type: OrderPaymentResultDto })
  @ApiOkResponse({ description: 'Idempotent replay (Idempotent-Replayed: true)', type: OrderPaymentResultDto })
  @ApiNotFoundResponse({ description: 'ADDRESS_NOT_FOUND | PICKUP_POINT_NOT_FOUND', type: ErrorResponseDto })
  @ApiConflictResponse({ description: 'INSUFFICIENT_STOCK | PRICE_CHANGED', type: ErrorResponseDto })
  @ApiUnprocessableEntityResponse({
    description:
      'CART_EMPTY | CART_HAS_ISSUES | COUPON_* | CARD_INVALID | CARD_EXPIRED | CARD_NOT_ALLOWED | CARD_DETAILS_REQUIRED | IDEMPOTENCY_KEY_REUSED',
    type: ErrorResponseDto,
  })
  @ApiBadGatewayResponse({ description: 'PAYMENT_PROCESSING_ERROR (order created, payment failed)', type: ErrorResponseDto })
  @ApiGatewayTimeoutResponse({ description: 'PAYMENT_GATEWAY_TIMEOUT (order created, payment failed)', type: ErrorResponseDto })
  async create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateOrderDto,
    @Headers('idempotency-key') key: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<OrderPaymentResultDto> {
    const result = await this.orders.create(user.id, dto, checkIdempotencyKey(key));
    res.status(result.replayed ? HttpStatus.OK : HttpStatus.CREATED);
    if (result.replayed) res.setHeader('Idempotent-Replayed', 'true');
    return { order: result.order, payment: result.payment };
  }

  @Get()
  @ApiOperation({ summary: 'User order history (most recent first)' })
  @ApiOkResponse({ type: OrderListResponseDto })
  list(@CurrentUser() user: AuthUser, @Query() query: OrderListQueryDto): Promise<OrderListResponseDto> {
    return this.orders.list(user.id, query);
  }

  @Get(':idOrNumber')
  @ApiOperation({ summary: 'Detail of one of your orders (by id or order number)' })
  @ApiParam({ name: 'idOrNumber', example: '1' })
  @ApiOkResponse({ type: OrderDto })
  @ApiNotFoundResponse({ description: 'ORDER_NOT_FOUND (also for orders of other users)', type: ErrorResponseDto })
  get(@CurrentUser() user: AuthUser, @Param('idOrNumber') idOrNumber: string): Promise<OrderDto> {
    return this.orders.getForUser(user.id, idOrNumber);
  }

  @Post(':idOrNumber/payments')
  @ApiHeader(IDEMPOTENCY_HEADER)
  @ApiOperation({
    summary: 'Retry the payment of a pending order',
    description: 'Allowed while the order is PENDING, with no payment in progress and the stock reservation still valid.',
  })
  @ApiCreatedResponse({ type: OrderPaymentResultDto })
  @ApiConflictResponse({ description: 'ORDER_NOT_PAYABLE | PAYMENT_IN_PROGRESS', type: ErrorResponseDto })
  @ApiUnprocessableEntityResponse({ description: 'CARD_* | IDEMPOTENCY_KEY_REUSED', type: ErrorResponseDto })
  @ApiBadGatewayResponse({ type: ErrorResponseDto })
  @ApiGatewayTimeoutResponse({ type: ErrorResponseDto })
  async pay(
    @CurrentUser() user: AuthUser,
    @Param('idOrNumber') idOrNumber: string,
    @Body() dto: PaymentInputDto,
    @Headers('idempotency-key') key: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<OrderPaymentResultDto> {
    const result = await this.orders.pay(user.id, idOrNumber, dto, checkIdempotencyKey(key));
    res.status(result.replayed ? HttpStatus.OK : HttpStatus.CREATED);
    if (result.replayed) res.setHeader('Idempotent-Replayed', 'true');
    return { order: result.order, payment: result.payment };
  }

  @Post(':idOrNumber/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cancel an order',
    description: 'Only in PENDING or PAID status with no payment in progress. Restores stock, refunds if paid and releases the coupon.',
  })
  @ApiOkResponse({ type: OrderDto })
  @ApiConflictResponse({ description: 'ORDER_NOT_CANCELLABLE | PAYMENT_IN_PROGRESS', type: ErrorResponseDto })
  cancel(@CurrentUser() user: AuthUser, @Param('idOrNumber') idOrNumber: string, @Body() dto: CancelOrderDto): Promise<OrderDto> {
    return this.orders.cancel(user.id, idOrNumber, dto.reason);
  }

  @Post(':idOrNumber/return')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request a return', description: 'Only DELIVERED orders within the return window (RETURN_WINDOW_DAYS).' })
  @ApiOkResponse({ type: OrderDto })
  @ApiConflictResponse({ description: 'ORDER_NOT_RETURNABLE', type: ErrorResponseDto })
  @ApiUnprocessableEntityResponse({ description: 'RETURN_WINDOW_EXPIRED', type: ErrorResponseDto })
  requestReturn(@CurrentUser() user: AuthUser, @Param('idOrNumber') idOrNumber: string, @Body() dto: ReturnOrderDto): Promise<OrderDto> {
    return this.orders.requestReturn(user.id, idOrNumber, dto.reason);
  }
}
