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
  description: 'Guest cart token (ignored when a user is authenticated)',
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
    summary: 'Get the cart',
    description:
      'Authenticated user: their persistent cart. Guest: the cart of the X-Cart-Token (empty when it does not exist). ' +
      'Totals are always computed on the server with current prices.',
  })
  @ApiOkResponse({ type: CartDto })
  get(@CurrentUser() user: AuthUser | undefined, @Headers('x-cart-token') token?: string): Promise<CartDto> {
    return this.cart.getCart(this.owner(user, token));
  }

  @Post('items')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Add a product to the cart',
    description:
      'If the product is already in the cart the quantity is added. For guests without a token a new cart is created: ' +
      'store the `token` from the response and send it in X-Cart-Token.',
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
  @ApiOperation({ summary: 'Change the quantity of a cart line' })
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
  @ApiOperation({ summary: 'Remove a cart line (returns the updated cart)' })
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
  @ApiOperation({ summary: 'Empty the cart (also removes the coupon)' })
  @ApiOkResponse({ type: CartDto })
  clear(@CurrentUser() user: AuthUser | undefined, @Headers('x-cart-token') token?: string): Promise<CartDto> {
    return this.cart.clear(this.owner(user, token));
  }

  @Post('coupon')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Apply a coupon to the cart (requires sign-in)' })
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
  @ApiOperation({ summary: 'Remove the coupon from the cart' })
  @ApiOkResponse({ type: CartDto })
  removeCoupon(@CurrentUser() user: AuthUser | undefined, @Headers('x-cart-token') token?: string): Promise<CartDto> {
    return this.cart.removeCoupon(this.owner(user, token));
  }

  @Post('merge')
  @Authenticated()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Merge a guest cart into the user cart',
    description: 'Adds quantities (capped by stock and the per-product maximum) and deletes the guest cart.',
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
  @ApiOperation({ summary: 'Available shipping methods' })
  @ApiOkResponse({ type: [ShippingMethodDto] })
  methods(): Promise<ShippingMethodDto[]> {
    return this.shipping.methods();
  }

  @Get('pickup-points')
  @ApiOperation({ summary: 'Pickup points (filterable by city or postal code)' })
  @ApiOkResponse({ type: [PickupPointDto] })
  pickupPoints(@Query() query: PickupPointQueryDto): Promise<PickupPointDto[]> {
    return this.shipping.pickupPoints(query);
  }
}
