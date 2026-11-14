import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthUser } from '../../common/auth-user';
import { CurrentUser, Roles } from '../../common/decorators/auth.decorators';
import { ErrorResponseDto } from '../../common/dto/error-response.dto';
import { AdminCatalogService } from './admin-catalog.service';
import { AdminSalesService } from './admin-sales.service';
import {
  AdminCouponDto,
  AdminCouponQueryDto,
  AdminOrderDto,
  AdminOrderListDto,
  AdminOrderQueryDto,
  AdminProductDto,
  AdminProductListDto,
  AdminProductQueryDto,
  AdminUpdateUserDto,
  AdminUserDto,
  AdminUserListDto,
  AdminUserQueryDto,
  CreateCouponDto,
  CreateProductDto,
  DashboardDto,
  StockAdjustmentDto,
  UpdateCouponDto,
  UpdateOrderStatusDto,
  UpdateProductDto,
} from './dto/admin.dto';

@ApiTags('Admin')
@Roles(Role.ADMIN)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly catalog: AdminCatalogService,
    private readonly sales: AdminSalesService,
  ) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Administration dashboard metrics' })
  @ApiOkResponse({ type: DashboardDto })
  dashboard(): Promise<DashboardDto> {
    return this.sales.dashboard();
  }

  // ─── Products ───

  @Get('products')
  @ApiOperation({ summary: 'List products (including deactivated ones)' })
  @ApiOkResponse({ type: AdminProductListDto })
  products(@Query() q: AdminProductQueryDto): Promise<AdminProductListDto> {
    return this.catalog.list(q);
  }

  @Get('products/:id')
  @ApiOperation({ summary: 'Product detail' })
  @ApiOkResponse({ type: AdminProductDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  product(@Param('id', ParseIntPipe) id: number): Promise<AdminProductDto> {
    return this.catalog.get(id);
  }

  @Post('products')
  @ApiOperation({ summary: 'Create a product' })
  @ApiCreatedResponse({ type: AdminProductDto })
  @ApiConflictResponse({ description: 'SKU_ALREADY_EXISTS', type: ErrorResponseDto })
  @ApiUnprocessableEntityResponse({ description: 'INVALID_PRICE | CATEGORY_NOT_ASSIGNABLE', type: ErrorResponseDto })
  createProduct(@Body() dto: CreateProductDto): Promise<AdminProductDto> {
    return this.catalog.create(dto);
  }

  @Patch('products/:id')
  @ApiOperation({
    summary: 'Update a product',
    description: 'Changes price, stock, category, status (isActive=false deactivates the product), etc.',
  })
  @ApiOkResponse({ type: AdminProductDto })
  @ApiUnprocessableEntityResponse({ description: 'INVALID_PRICE | CATEGORY_NOT_ASSIGNABLE', type: ErrorResponseDto })
  updateProduct(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateProductDto): Promise<AdminProductDto> {
    return this.catalog.update(id, dto);
  }

  @Post('products/:id/stock-adjustments')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Atomic stock adjustment (+/-)', description: 'Safe under concurrent orders; stock never goes below zero.' })
  @ApiOkResponse({ type: AdminProductDto })
  @ApiConflictResponse({ description: 'INSUFFICIENT_STOCK', type: ErrorResponseDto })
  adjustStock(@Param('id', ParseIntPipe) id: number, @Body() dto: StockAdjustmentDto): Promise<AdminProductDto> {
    return this.catalog.adjustStock(id, dto.delta);
  }

  // ─── Orders ───

  @Get('orders')
  @ApiOperation({ summary: 'List orders (filters by status, payment, search and dates)' })
  @ApiOkResponse({ type: AdminOrderListDto })
  orders(@Query() q: AdminOrderQueryDto): Promise<AdminOrderListDto> {
    return this.sales.listOrders(q);
  }

  @Get('orders/:id')
  @ApiOperation({ summary: 'Order detail with allowed transitions' })
  @ApiOkResponse({ type: AdminOrderDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  order(@Param('id', ParseIntPipe) id: number): Promise<AdminOrderDto> {
    return this.sales.getOrder(id);
  }

  @Patch('orders/:id/status')
  @ApiOperation({
    summary: 'Change the order status',
    description: 'PAID→PREPARING→SHIPPED→DELIVERED, cancellations (PENDING/PAID/PREPARING) and return handling.',
  })
  @ApiOkResponse({ type: AdminOrderDto })
  @ApiConflictResponse({ description: 'INVALID_STATUS_TRANSITION | ORDER_NOT_CANCELLABLE | PAYMENT_IN_PROGRESS', type: ErrorResponseDto })
  updateOrderStatus(
    @CurrentUser() admin: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateOrderStatusDto,
  ): Promise<AdminOrderDto> {
    return this.sales.updateOrderStatus(id, admin.id, dto);
  }

  @Post('orders/:id/confirm-payment')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm receipt of a bank transfer (order → PAID)' })
  @ApiOkResponse({ type: AdminOrderDto })
  @ApiConflictResponse({ description: 'ORDER_NOT_PAYABLE', type: ErrorResponseDto })
  confirmPayment(@CurrentUser() admin: AuthUser, @Param('id', ParseIntPipe) id: number): Promise<AdminOrderDto> {
    return this.sales.confirmPayment(id, admin.id);
  }

  // ─── Users ───

  @Get('users')
  @ApiOperation({ summary: 'List users' })
  @ApiOkResponse({ type: AdminUserListDto })
  users(@Query() q: AdminUserQueryDto): Promise<AdminUserListDto> {
    return this.sales.listUsers(q);
  }

  @Get('users/:id')
  @ApiOperation({ summary: 'Administrative user detail' })
  @ApiOkResponse({ type: AdminUserDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  user(@Param('id', ParseIntPipe) id: number): Promise<AdminUserDto> {
    return this.sales.getUser(id);
  }

  @Patch('users/:id')
  @ApiOperation({ summary: 'Change the status (enable/disable) or role of a user', description: 'Disabling revokes all of their sessions.' })
  @ApiOkResponse({ type: AdminUserDto })
  @ApiUnprocessableEntityResponse({ description: 'CANNOT_MODIFY_OWN_ACCOUNT', type: ErrorResponseDto })
  updateUser(@CurrentUser() admin: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: AdminUpdateUserDto): Promise<AdminUserDto> {
    return this.sales.updateUser(id, admin.id, dto);
  }

  // ─── Coupons ───

  @Get('coupons')
  @ApiOperation({ summary: 'List coupons' })
  @ApiOkResponse({ type: [AdminCouponDto] })
  coupons(@Query() q: AdminCouponQueryDto): Promise<AdminCouponDto[]> {
    return this.sales.listCoupons(q);
  }

  @Get('coupons/:id')
  @ApiOperation({ summary: 'Coupon detail' })
  @ApiOkResponse({ type: AdminCouponDto })
  coupon(@Param('id', ParseIntPipe) id: number): Promise<AdminCouponDto> {
    return this.sales.getCoupon(id);
  }

  @Post('coupons')
  @ApiOperation({ summary: 'Create a coupon' })
  @ApiCreatedResponse({ type: AdminCouponDto })
  @ApiConflictResponse({ description: 'COUPON_CODE_EXISTS', type: ErrorResponseDto })
  createCoupon(@Body() dto: CreateCouponDto): Promise<AdminCouponDto> {
    return this.sales.createCoupon(dto);
  }

  @Patch('coupons/:id')
  @ApiOperation({ summary: 'Update a coupon (isActive=false deactivates it)' })
  @ApiOkResponse({ type: AdminCouponDto })
  updateCoupon(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCouponDto): Promise<AdminCouponDto> {
    return this.sales.updateCoupon(id, dto);
  }
}
