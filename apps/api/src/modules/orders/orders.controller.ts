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
    'Clave única (8-100 caracteres [A-Za-z0-9_.:-]) por intento de compra. Repetir la petición con la misma clave devuelve ' +
    'el resultado original (200 + cabecera Idempotent-Replayed: true) en lugar de crear un duplicado.',
};

function checkIdempotencyKey(key: string | undefined): string | undefined {
  if (key === undefined || key === '') return undefined;
  if (!IDEMPOTENCY_KEY_PATTERN.test(key)) {
    throw badRequest(ErrorCode.VALIDATION_ERROR, 'Idempotency-Key no válida', [
      { field: 'Idempotency-Key', message: 'Debe tener entre 8 y 100 caracteres [A-Za-z0-9_.:-]' },
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
    summary: 'Presupuesto del pedido',
    description: 'Calcula en el servidor subtotal, descuento, envío, IVA y total para el carrito actual y el método de envío elegido.',
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
    summary: 'Crear pedido (checkout) y procesar el pago',
    description:
      'Convierte el carrito del usuario en un pedido de forma transaccional (bloqueo del carrito, validación de stock, ' +
      'descuento atómico de inventario, cupón, vaciado del carrito) y ejecuta el primer intento de pago con el simulador. ' +
      'Un pago rechazado NO es un error HTTP: el pedido queda PENDING con paymentStatus FAILED y puede pagarse de nuevo. ' +
      'Errores de pasarela (502/504) se devuelven después de crear el pedido (details.orderId).',
  })
  @ApiCreatedResponse({ type: OrderPaymentResultDto })
  @ApiOkResponse({ description: 'Repetición idempotente (Idempotent-Replayed: true)', type: OrderPaymentResultDto })
  @ApiNotFoundResponse({ description: 'ADDRESS_NOT_FOUND | PICKUP_POINT_NOT_FOUND', type: ErrorResponseDto })
  @ApiConflictResponse({ description: 'INSUFFICIENT_STOCK | PRICE_CHANGED', type: ErrorResponseDto })
  @ApiUnprocessableEntityResponse({
    description:
      'CART_EMPTY | CART_HAS_ISSUES | COUPON_* | CARD_INVALID | CARD_EXPIRED | CARD_NOT_ALLOWED | CARD_DETAILS_REQUIRED | IDEMPOTENCY_KEY_REUSED',
    type: ErrorResponseDto,
  })
  @ApiBadGatewayResponse({ description: 'PAYMENT_PROCESSING_ERROR (pedido creado, pago fallido)', type: ErrorResponseDto })
  @ApiGatewayTimeoutResponse({ description: 'PAYMENT_GATEWAY_TIMEOUT (pedido creado, pago fallido)', type: ErrorResponseDto })
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
  @ApiOperation({ summary: 'Historial de pedidos del usuario (más recientes primero)' })
  @ApiOkResponse({ type: OrderListResponseDto })
  list(@CurrentUser() user: AuthUser, @Query() query: OrderListQueryDto): Promise<OrderListResponseDto> {
    return this.orders.list(user.id, query);
  }

  @Get(':idOrNumber')
  @ApiOperation({ summary: 'Detalle de un pedido propio (por id o número de pedido)' })
  @ApiParam({ name: 'idOrNumber', example: '1' })
  @ApiOkResponse({ type: OrderDto })
  @ApiNotFoundResponse({ description: 'ORDER_NOT_FOUND (también para pedidos de otros usuarios)', type: ErrorResponseDto })
  get(@CurrentUser() user: AuthUser, @Param('idOrNumber') idOrNumber: string): Promise<OrderDto> {
    return this.orders.getForUser(user.id, idOrNumber);
  }

  @Post(':idOrNumber/payments')
  @ApiHeader(IDEMPOTENCY_HEADER)
  @ApiOperation({
    summary: 'Reintentar el pago de un pedido pendiente',
    description: 'Permitido mientras el pedido esté PENDING, sin pago en curso y con la reserva de stock vigente.',
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
    summary: 'Cancelar pedido',
    description: 'Solo en estado PENDING o PAID y sin pago en curso. Restaura el stock, reembolsa si estaba pagado y libera el cupón.',
  })
  @ApiOkResponse({ type: OrderDto })
  @ApiConflictResponse({ description: 'ORDER_NOT_CANCELLABLE | PAYMENT_IN_PROGRESS', type: ErrorResponseDto })
  cancel(@CurrentUser() user: AuthUser, @Param('idOrNumber') idOrNumber: string, @Body() dto: CancelOrderDto): Promise<OrderDto> {
    return this.orders.cancel(user.id, idOrNumber, dto.reason);
  }

  @Post(':idOrNumber/return')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Solicitar devolución', description: 'Solo pedidos DELIVERED dentro del plazo de devolución (RETURN_WINDOW_DAYS).' })
  @ApiOkResponse({ type: OrderDto })
  @ApiConflictResponse({ description: 'ORDER_NOT_RETURNABLE', type: ErrorResponseDto })
  @ApiUnprocessableEntityResponse({ description: 'RETURN_WINDOW_EXPIRED', type: ErrorResponseDto })
  requestReturn(@CurrentUser() user: AuthUser, @Param('idOrNumber') idOrNumber: string, @Body() dto: ReturnOrderDto): Promise<OrderDto> {
    return this.orders.requestReturn(user.id, idOrNumber, dto.reason);
  }
}
