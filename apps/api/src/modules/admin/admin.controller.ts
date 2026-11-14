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
  @ApiOperation({ summary: 'Métricas del panel de administración' })
  @ApiOkResponse({ type: DashboardDto })
  dashboard(): Promise<DashboardDto> {
    return this.sales.dashboard();
  }

  // ─── Products ───

  @Get('products')
  @ApiOperation({ summary: 'Listar productos (incluye desactivados)' })
  @ApiOkResponse({ type: AdminProductListDto })
  products(@Query() q: AdminProductQueryDto): Promise<AdminProductListDto> {
    return this.catalog.list(q);
  }

  @Get('products/:id')
  @ApiOperation({ summary: 'Detalle de producto' })
  @ApiOkResponse({ type: AdminProductDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  product(@Param('id', ParseIntPipe) id: number): Promise<AdminProductDto> {
    return this.catalog.get(id);
  }

  @Post('products')
  @ApiOperation({ summary: 'Crear producto' })
  @ApiCreatedResponse({ type: AdminProductDto })
  @ApiConflictResponse({ description: 'SKU_ALREADY_EXISTS', type: ErrorResponseDto })
  @ApiUnprocessableEntityResponse({ description: 'INVALID_PRICE | CATEGORY_NOT_ASSIGNABLE', type: ErrorResponseDto })
  createProduct(@Body() dto: CreateProductDto): Promise<AdminProductDto> {
    return this.catalog.create(dto);
  }

  @Patch('products/:id')
  @ApiOperation({
    summary: 'Editar producto',
    description: 'Permite cambiar precio, stock, categoría, estado (isActive=false desactiva el producto), etc.',
  })
  @ApiOkResponse({ type: AdminProductDto })
  @ApiUnprocessableEntityResponse({ description: 'INVALID_PRICE | CATEGORY_NOT_ASSIGNABLE', type: ErrorResponseDto })
  updateProduct(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateProductDto): Promise<AdminProductDto> {
    return this.catalog.update(id, dto);
  }

  @Post('products/:id/stock-adjustments')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Ajuste atómico de stock (+/-)', description: 'Seguro frente a pedidos concurrentes; nunca deja el stock en negativo.' })
  @ApiOkResponse({ type: AdminProductDto })
  @ApiConflictResponse({ description: 'INSUFFICIENT_STOCK', type: ErrorResponseDto })
  adjustStock(@Param('id', ParseIntPipe) id: number, @Body() dto: StockAdjustmentDto): Promise<AdminProductDto> {
    return this.catalog.adjustStock(id, dto.delta);
  }

  // ─── Orders ───

  @Get('orders')
  @ApiOperation({ summary: 'Listar pedidos (filtros por estado, pago, búsqueda y fechas)' })
  @ApiOkResponse({ type: AdminOrderListDto })
  orders(@Query() q: AdminOrderQueryDto): Promise<AdminOrderListDto> {
    return this.sales.listOrders(q);
  }

  @Get('orders/:id')
  @ApiOperation({ summary: 'Detalle de pedido con transiciones permitidas' })
  @ApiOkResponse({ type: AdminOrderDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  order(@Param('id', ParseIntPipe) id: number): Promise<AdminOrderDto> {
    return this.sales.getOrder(id);
  }

  @Patch('orders/:id/status')
  @ApiOperation({
    summary: 'Cambiar estado del pedido',
    description: 'PAID→PREPARING→SHIPPED→DELIVERED, cancelaciones (PENDING/PAID/PREPARING) y gestión de devoluciones.',
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
  @ApiOperation({ summary: 'Confirmar la recepción de una transferencia bancaria (pedido → PAID)' })
  @ApiOkResponse({ type: AdminOrderDto })
  @ApiConflictResponse({ description: 'ORDER_NOT_PAYABLE', type: ErrorResponseDto })
  confirmPayment(@CurrentUser() admin: AuthUser, @Param('id', ParseIntPipe) id: number): Promise<AdminOrderDto> {
    return this.sales.confirmPayment(id, admin.id);
  }

  // ─── Users ───

  @Get('users')
  @ApiOperation({ summary: 'Listar usuarios' })
  @ApiOkResponse({ type: AdminUserListDto })
  users(@Query() q: AdminUserQueryDto): Promise<AdminUserListDto> {
    return this.sales.listUsers(q);
  }

  @Get('users/:id')
  @ApiOperation({ summary: 'Detalle administrativo de usuario' })
  @ApiOkResponse({ type: AdminUserDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  user(@Param('id', ParseIntPipe) id: number): Promise<AdminUserDto> {
    return this.sales.getUser(id);
  }

  @Patch('users/:id')
  @ApiOperation({ summary: 'Cambiar estado (activar/desactivar) o rol de un usuario', description: 'Desactivar revoca todas sus sesiones.' })
  @ApiOkResponse({ type: AdminUserDto })
  @ApiUnprocessableEntityResponse({ description: 'CANNOT_MODIFY_OWN_ACCOUNT', type: ErrorResponseDto })
  updateUser(@CurrentUser() admin: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: AdminUpdateUserDto): Promise<AdminUserDto> {
    return this.sales.updateUser(id, admin.id, dto);
  }

  // ─── Coupons ───

  @Get('coupons')
  @ApiOperation({ summary: 'Listar cupones' })
  @ApiOkResponse({ type: [AdminCouponDto] })
  coupons(@Query() q: AdminCouponQueryDto): Promise<AdminCouponDto[]> {
    return this.sales.listCoupons(q);
  }

  @Get('coupons/:id')
  @ApiOperation({ summary: 'Detalle de cupón' })
  @ApiOkResponse({ type: AdminCouponDto })
  coupon(@Param('id', ParseIntPipe) id: number): Promise<AdminCouponDto> {
    return this.sales.getCoupon(id);
  }

  @Post('coupons')
  @ApiOperation({ summary: 'Crear cupón' })
  @ApiCreatedResponse({ type: AdminCouponDto })
  @ApiConflictResponse({ description: 'COUPON_CODE_EXISTS', type: ErrorResponseDto })
  createCoupon(@Body() dto: CreateCouponDto): Promise<AdminCouponDto> {
    return this.sales.createCoupon(dto);
  }

  @Patch('coupons/:id')
  @ApiOperation({ summary: 'Editar cupón (isActive=false lo desactiva)' })
  @ApiOkResponse({ type: AdminCouponDto })
  updateCoupon(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCouponDto): Promise<AdminCouponDto> {
    return this.sales.updateCoupon(id, dto);
  }
}
