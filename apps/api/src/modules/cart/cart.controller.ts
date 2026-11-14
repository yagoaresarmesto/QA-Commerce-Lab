import { Body, Controller, Delete, Get, Headers, HttpCode, HttpStatus, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { AuthUser } from '../../common/auth-user';
import { Authenticated, CurrentUser, OptionalAuth, Public } from '../../common/decorators/auth.decorators';
import { ErrorResponseDto } from '../../common/dto/error-response.dto';
import { CartOwner, CartService } from './cart.service';
import { AddCartItemDto, ApplyCouponDto, CartDto, MergeCartDto, UpdateCartItemDto } from './dto/cart.dto';
import { PickupPointDto, PickupPointQueryDto, ShippingMethodDto } from './dto/shipping.dto';
import { ShippingService } from './shipping.service';

const CART_TOKEN_HEADER = {
  name: 'X-Cart-Token',
  required: false,
  description: 'Token del carrito de invitado (se ignora si hay usuario autenticado)',
};

@ApiTags('Cart')
@OptionalAuth()
@ApiHeader(CART_TOKEN_HEADER)
@Controller('cart')
export class CartController {
  constructor(private readonly cart: CartService) {}

  private owner(user: AuthUser | undefined, token: string | undefined): CartOwner {
    return user ? { userId: user.id } : { guestToken: token };
  }

  @Get()
  @ApiOperation({
    summary: 'Consultar el carrito',
    description:
      'Usuario autenticado: su carrito persistente. Invitado: el carrito del X-Cart-Token (vacío si no existe). ' +
      'Los totales se calculan siempre en el servidor con los precios actuales.',
  })
  @ApiOkResponse({ type: CartDto })
  get(@CurrentUser() user: AuthUser | undefined, @Headers('x-cart-token') token?: string): Promise<CartDto> {
    return this.cart.getCart(this.owner(user, token));
  }

  @Post('items')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Añadir producto al carrito',
    description:
      'Si el producto ya está en el carrito se suma la cantidad. Para invitados sin token se crea un carrito nuevo: ' +
      'guarda el `token` de la respuesta y envíalo en X-Cart-Token.',
  })
  @ApiOkResponse({ type: CartDto })
  @ApiNotFoundResponse({ description: 'PRODUCT_NOT_FOUND', type: ErrorResponseDto })
  @ApiConflictResponse({ description: 'OUT_OF_STOCK | INSUFFICIENT_STOCK', type: ErrorResponseDto })
  @ApiUnprocessableEntityResponse({ description: 'PRODUCT_UNAVAILABLE | MAX_QUANTITY_EXCEEDED', type: ErrorResponseDto })
  addItem(
    @CurrentUser() user: AuthUser | undefined,
    @Headers('x-cart-token') token: string | undefined,
    @Body() dto: AddCartItemDto,
  ): Promise<CartDto> {
    return this.cart.addItem(this.owner(user, token), dto.productId, dto.quantity);
  }

  @Patch('items/:itemId')
  @ApiOperation({ summary: 'Cambiar la cantidad de una línea del carrito' })
  @ApiOkResponse({ type: CartDto })
  @ApiNotFoundResponse({ description: 'CART_ITEM_NOT_FOUND', type: ErrorResponseDto })
  @ApiConflictResponse({ description: 'OUT_OF_STOCK | INSUFFICIENT_STOCK', type: ErrorResponseDto })
  @ApiUnprocessableEntityResponse({ description: 'PRODUCT_UNAVAILABLE | MAX_QUANTITY_EXCEEDED', type: ErrorResponseDto })
  updateItem(
    @CurrentUser() user: AuthUser | undefined,
    @Headers('x-cart-token') token: string | undefined,
    @Param('itemId', ParseIntPipe) itemId: number,
    @Body() dto: UpdateCartItemDto,
  ): Promise<CartDto> {
    return this.cart.updateItem(this.owner(user, token), itemId, dto.quantity);
  }

  @Delete('items/:itemId')
  @ApiOperation({ summary: 'Eliminar una línea del carrito (devuelve el carrito actualizado)' })
  @ApiOkResponse({ type: CartDto })
  @ApiNotFoundResponse({ description: 'CART_ITEM_NOT_FOUND', type: ErrorResponseDto })
  removeItem(
    @CurrentUser() user: AuthUser | undefined,
    @Headers('x-cart-token') token: string | undefined,
    @Param('itemId', ParseIntPipe) itemId: number,
  ): Promise<CartDto> {
    return this.cart.removeItem(this.owner(user, token), itemId);
  }

  @Delete()
  @ApiOperation({ summary: 'Vaciar el carrito (también quita el cupón)' })
  @ApiOkResponse({ type: CartDto })
  clear(@CurrentUser() user: AuthUser | undefined, @Headers('x-cart-token') token?: string): Promise<CartDto> {
    return this.cart.clear(this.owner(user, token));
  }

  @Post('coupon')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Aplicar cupón al carrito (requiere sesión)' })
  @ApiOkResponse({ type: CartDto })
  @ApiUnprocessableEntityResponse({
    description:
      'CART_EMPTY | COUPON_INVALID | COUPON_INACTIVE | COUPON_NOT_STARTED | COUPON_EXPIRED | COUPON_USAGE_LIMIT_REACHED | ' +
      'COUPON_REQUIRES_LOGIN | COUPON_ALREADY_USED | COUPON_MIN_SUBTOTAL_NOT_REACHED | COUPON_NOT_APPLICABLE',
    type: ErrorResponseDto,
  })
  applyCoupon(
    @CurrentUser() user: AuthUser | undefined,
    @Headers('x-cart-token') token: string | undefined,
    @Body() dto: ApplyCouponDto,
  ): Promise<CartDto> {
    return this.cart.applyCoupon(this.owner(user, token), dto.code);
  }

  @Delete('coupon')
  @ApiOperation({ summary: 'Quitar el cupón del carrito' })
  @ApiOkResponse({ type: CartDto })
  removeCoupon(@CurrentUser() user: AuthUser | undefined, @Headers('x-cart-token') token?: string): Promise<CartDto> {
    return this.cart.removeCoupon(this.owner(user, token));
  }

  @Post('merge')
  @Authenticated()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Fusionar un carrito de invitado con el del usuario',
    description: 'Suma cantidades (limitadas por stock y máximo por producto) y elimina el carrito de invitado.',
  })
  @ApiOkResponse({ type: CartDto })
  @ApiNotFoundResponse({ description: 'CART_NOT_FOUND', type: ErrorResponseDto })
  merge(@CurrentUser() user: AuthUser, @Body() dto: MergeCartDto): Promise<CartDto> {
    return this.cart.merge(user.id, dto.guestCartToken);
  }
}

@ApiTags('Checkout')
@Public()
@Controller('shipping')
export class ShippingController {
  constructor(private readonly shipping: ShippingService) {}

  @Get('methods')
  @ApiOperation({ summary: 'Métodos de envío disponibles' })
  @ApiOkResponse({ type: [ShippingMethodDto] })
  methods(): Promise<ShippingMethodDto[]> {
    return this.shipping.methods();
  }

  @Get('pickup-points')
  @ApiOperation({ summary: 'Puntos de recogida (filtrables por ciudad o código postal)' })
  @ApiOkResponse({ type: [PickupPointDto] })
  pickupPoints(@Query() query: PickupPointQueryDto): Promise<PickupPointDto[]> {
    return this.shipping.pickupPoints(query);
  }
}
