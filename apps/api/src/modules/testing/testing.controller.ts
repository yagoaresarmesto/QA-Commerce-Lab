import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Ip, Param, ParseIntPipe, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { AppConfig } from '../../config/app-config';
import { Public } from '../../common/decorators/auth.decorators';
import { ErrorCode, badRequest, forbidden, notFound } from '../../common/errors';
import { TEST_RUN_ID_PATTERN } from '../../common/request-context';
import { PrismaService } from '../../prisma/prisma.service';
import { JOB_NAMES, JobName, JobsService } from '../jobs/jobs.service';
import { PaymentsService } from '../orders/payments.service';
import { OrdersService } from '../orders/orders.service';
import { toPaymentDto } from '../orders/order.mapper';
import { TEST_CARDS } from '../orders/payment-simulator';
import { REFERENCE_USERS, REVIEWERS, ADMIN_PASSWORD, CUSTOMER_PASSWORD } from '../../seed/data/people.data';
import { DISCONTINUED_SKUS, STOCK_OVERRIDES } from '../../seed/reference-seeder';
import { CleanupService } from './cleanup.service';
import {
  CreateFaultDto,
  CreateTestCouponDto,
  CreateTestOrderDto,
  CreateTestProductDto,
  CreateTestUserDto,
  EmailQueryDto,
  ExpireSessionsDto,
  PasswordResetTokenDto,
  PatchTestProductDto,
  PrepareCartDto,
  ResetDto,
  ResolvePaymentDto,
  ScenarioDto,
  TestTokenDto,
} from './dto/testing.dto';
import { FaultsService } from './faults/faults.service';
import { FixturesService, resolveRunId, DEFAULT_TEST_PASSWORD } from './fixtures.service';
import { ScenariosService } from './scenarios.service';
import { SeedService } from './seed.service';
import { TestApiGuard } from './test-api.guard';
import { TestAuditService } from './test-audit.service';

function assertRunId(runId: string): string {
  if (!TEST_RUN_ID_PATTERN.test(runId)) {
    throw badRequest(ErrorCode.VALIDATION_ERROR, 'runId no válido', [{ field: 'runId', message: '3-64 caracteres [A-Za-z0-9._-]' }]);
  }
  return runId;
}

@ApiTags('Testing')
@ApiSecurity('test-api-key')
@Public()
@UseGuards(TestApiGuard)
@Controller('test')
export class TestingController {
  constructor(
    private readonly config: AppConfig,
    private readonly prisma: PrismaService,
    private readonly seed: SeedService,
    private readonly fixtures: FixturesService,
    private readonly scenarios: ScenariosService,
    private readonly cleanupService: CleanupService,
    private readonly faults: FaultsService,
    private readonly payments: PaymentsService,
    private readonly orders: OrdersService,
    private readonly jobs: JobsService,
    private readonly audit: TestAuditService,
  ) {}

  @Get('info')
  @ApiOperation({ summary: 'Capacidades de la API de testing y datos de referencia' })
  info() {
    return {
      environment: this.config.env,
      globalResetAllowed: this.config.testApi.allowGlobalReset,
      globalFaultsAllowed: this.config.testApi.allowGlobalFaults,
      defaultTestPassword: DEFAULT_TEST_PASSWORD,
      referenceUsers: [...REFERENCE_USERS, ...REVIEWERS.slice(0, 1)].map((u) => ({
        email: u.email,
        password: u.role === 'ADMIN' ? ADMIN_PASSWORD : CUSTOMER_PASSWORD,
        role: u.role,
        status: u.status,
        description: u.description,
      })),
      testCards: TEST_CARDS,
      referenceInventory: { stockOverrides: STOCK_OVERRIDES, discontinuedSkus: DISCONTINUED_SKUS },
      scenarios: this.scenarios.list(),
      jobs: JOB_NAMES,
    };
  }

  // ─── Global state ───

  @Post('reset')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reset GLOBAL: borra TODOS los datos y recarga el dataset de referencia',
    description: 'Solo para entornos dedicados sin ejecuciones concurrentes (ALLOW_GLOBAL_RESET=true). IDs deterministas.',
  })
  async reset(@Body() _dto: ResetDto, @Ip() ip: string) {
    if (!this.config.testApi.allowGlobalReset) {
      throw forbidden(ErrorCode.GLOBAL_RESET_DISABLED, 'El reset global está deshabilitado en este entorno. Usa la limpieza por runId');
    }
    const summary = await this.seed.reset();
    this.faults.clear();
    await this.audit.log('reset', null, ip, summary);
    return { status: 'reset', summary };
  }

  @Post('seed')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Restaurar los datos de referencia',
    description:
      'Vuelve a dejar productos, cupones y usuarios de referencia en su estado inicial (stock, precios, contraseñas, pedidos...). ' +
      'No borra los datos creados por ejecuciones (runId).',
  })
  async restore(@Ip() ip: string) {
    const summary = await this.seed.seed();
    await this.audit.log('seed', null, ip, summary);
    return { status: 'seeded', summary };
  }

  // ─── Runs ───

  @Get('runs/:runId')
  @ApiOperation({ summary: 'Resumen de los datos creados por una ejecución' })
  runSummary(@Param('runId') runId: string) {
    return this.cleanupService.summary(assertRunId(runId));
  }

  @Delete('runs/:runId')
  @ApiOperation({
    summary: 'Limpiar los datos de una ejecución',
    description:
      'Elimina usuarios, pedidos, productos, cupones, emails y faults del runId (y usuarios cuyo email contiene el runId). ' +
      'Revierte stock, contadores de ventas, usos de cupones y valoraciones de los datos compartidos.',
  })
  async cleanup(@Param('runId') runId: string, @Ip() ip: string) {
    const removed = await this.cleanupService.cleanup(assertRunId(runId));
    await this.audit.log('cleanup', runId, ip, removed);
    return { status: 'cleaned', removed };
  }

  // ─── Fixtures ───

  @Post('users')
  @ApiOperation({ summary: 'Crear usuario de prueba (opcionalmente con dirección y tokens)' })
  async createUser(@Body() dto: CreateTestUserDto, @Ip() ip: string) {
    const res = await this.fixtures.createUser(dto);
    await this.audit.log('create-user', res.runId, ip, { userId: res.user.id });
    return res;
  }

  @Post('auth/token')
  @ApiOperation({ summary: 'Emitir tokens para un usuario sin contraseña (TTL configurable)' })
  async token(@Body() dto: TestTokenDto) {
    return this.fixtures.issueToken(dto, dto.accessTtlSeconds, dto.refreshTtlSeconds);
  }

  @Post('sessions/expire')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Caducar o revocar todas las sesiones de un usuario' })
  async expireSessions(@Body() dto: ExpireSessionsDto, @Ip() ip: string) {
    const res = await this.fixtures.expireSessions(dto, dto.mode);
    await this.audit.log('expire-sessions', null, ip, res);
    return res;
  }

  @Post('password-reset-token')
  @ApiOperation({ summary: 'Generar un token de recuperación de contraseña y devolverlo directamente' })
  passwordResetToken(@Body() dto: PasswordResetTokenDto) {
    return this.fixtures.passwordResetToken(dto.email);
  }

  @Post('products')
  @ApiOperation({ summary: 'Crear producto de prueba (solo visible en listados para su runId)' })
  async createProduct(@Body() dto: CreateTestProductDto, @Ip() ip: string) {
    const res = await this.fixtures.createProduct(dto);
    await this.audit.log('create-product', res.runId, ip, { productId: res.product.id });
    return res;
  }

  @Patch('products/:id')
  @ApiOperation({ summary: 'Fijar inventario, precio o estado de cualquier producto' })
  async patchProduct(@Param('id', ParseIntPipe) id: number, @Body() dto: PatchTestProductDto, @Ip() ip: string) {
    const product = await this.fixtures.patchProduct(id, dto);
    await this.audit.log('patch-product', product.testRunId, ip, { productId: id, ...dto });
    return product;
  }

  @Post('carts')
  @ApiOperation({ summary: 'Preparar el carrito de un usuario (force: true permite carritos con incidencias)' })
  prepareCart(@Body() dto: PrepareCartDto) {
    return this.fixtures.prepareCart(dto);
  }

  @Post('orders')
  @ApiOperation({ summary: 'Crear un pedido directamente en un estado concreto' })
  async createOrder(@Body() dto: CreateTestOrderDto, @Ip() ip: string) {
    const res = await this.fixtures.createOrder(dto);
    await this.audit.log('create-order', res.runId, ip, { orderId: res.order.id, status: dto.status });
    return res;
  }

  @Post('orders/:id/expire-reservation')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Caducar la reserva de un pedido pendiente y ejecutar el job de expiración' })
  async expireReservation(@Param('id', ParseIntPipe) id: number) {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) throw notFound(ErrorCode.ORDER_NOT_FOUND, 'Pedido no encontrado');
    await this.prisma.order.update({ where: { id }, data: { reservationExpiresAt: new Date(Date.now() - 1000) } });
    const job = await this.jobs.run('expire-reservations');
    return { job, order: await this.orders.getById(id) };
  }

  @Post('coupons')
  @ApiOperation({ summary: 'Crear cupón de prueba (válido, caducado, futuro, agotado...)' })
  async createCoupon(@Body() dto: CreateTestCouponDto, @Ip() ip: string) {
    const res = await this.fixtures.createCoupon(dto);
    await this.audit.log('create-coupon', res.runId, ip, { couponId: res.coupon.id });
    return res;
  }

  @Post('payments/:id/resolve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resolver inmediatamente un pago pendiente (APPROVED/DECLINED)' })
  async resolvePayment(@Param('id', ParseIntPipe) id: number, @Body() dto: ResolvePaymentDto) {
    const payment = await this.payments.resolvePending(id, dto.outcome);
    return { payment: toPaymentDto(payment), order: await this.orders.getById(payment.orderId) };
  }

  @Post('jobs/:name/run')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Ejecutar un job en segundo plano inmediatamente' })
  runJob(@Param('name') name: string) {
    if (!(JOB_NAMES as readonly string[]).includes(name)) {
      throw notFound(ErrorCode.NOT_FOUND, `Job desconocido. Disponibles: ${JOB_NAMES.join(', ')}`);
    }
    return this.jobs.run(name as JobName);
  }

  // ─── Scenarios ───

  @Get('scenarios')
  @ApiOperation({ summary: 'Listar escenarios preparados' })
  listScenarios() {
    return this.scenarios.list();
  }

  @Post('scenarios/:name')
  @ApiOperation({ summary: 'Preparar un escenario aislado (datos nuevos etiquetados con el runId)' })
  async runScenario(@Param('name') name: string, @Body() dto: ScenarioDto, @Ip() ip: string) {
    const res = await this.scenarios.run(name, dto.runId);
    await this.audit.log(`scenario:${name}`, res.runId, ip);
    return res;
  }

  // ─── Mail outbox ───

  @Get('emails')
  @ApiOperation({ summary: 'Consultar el buzón simulado (más recientes primero)' })
  emails(@Query() q: EmailQueryDto) {
    return this.prisma.emailMessage.findMany({
      where: this.emailWhere(q),
      orderBy: { id: 'desc' },
      take: q.limit ?? 50,
    });
  }

  @Get('emails/latest')
  @ApiOperation({ summary: 'Último email que cumple el filtro (404 si no hay)' })
  async latestEmail(@Query() q: EmailQueryDto) {
    const email = await this.prisma.emailMessage.findFirst({ where: this.emailWhere(q), orderBy: { id: 'desc' } });
    if (!email) throw notFound(ErrorCode.NOT_FOUND, 'No hay emails que cumplan el filtro');
    return email;
  }

  @Delete('emails')
  @ApiOperation({ summary: 'Vaciar el buzón (filtrable por destinatario o runId)' })
  async clearEmails(@Query() q: EmailQueryDto) {
    if (!q.to && !q.runId && !this.config.testApi.allowGlobalReset) {
      throw forbidden(ErrorCode.GLOBAL_RESET_DISABLED, 'Indica "to" o "runId": el borrado global está deshabilitado en este entorno');
    }
    const res = await this.prisma.emailMessage.deleteMany({ where: this.emailWhere(q) });
    return { deleted: res.count };
  }

  private emailWhere(q: EmailQueryDto): Prisma.EmailMessageWhereInput {
    return {
      ...(q.to ? { to: q.to.toLowerCase() } : {}),
      ...(q.runId ? { testRunId: q.runId } : {}),
      ...(q.template ? { template: q.template } : {}),
    };
  }

  // ─── Fault injection ───

  @Get('faults')
  @ApiOperation({ summary: 'Listar reglas de simulación de fallos activas' })
  listFaults(@Query('runId') runId?: string) {
    return this.faults.list({ runId });
  }

  @Post('faults')
  @ApiOperation({
    summary: 'Registrar una regla de fallo (500/503, latencia, timeout...)',
    description:
      'Siempre acotada: por runId (cabecera X-Test-Run-Id de las peticiones), por userId autenticado o global (solo con ALLOW_GLOBAL_FAULTS). ' +
      'Caduca tras ttlSeconds y puede limitarse a N peticiones (times) para simular fallos transitorios.',
  })
  async createFault(@Body() dto: CreateFaultDto, @Ip() ip: string) {
    if (dto.global && !this.config.testApi.allowGlobalFaults) {
      throw forbidden(ErrorCode.FAULT_SCOPE_REQUIRED, 'Las reglas globales están deshabilitadas en este entorno');
    }
    const runId = dto.global || dto.userId ? dto.runId : resolveRunId(dto.runId);
    if (!runId && !dto.userId && !dto.global) {
      throw badRequest(ErrorCode.FAULT_SCOPE_REQUIRED, 'Indica runId, userId o global');
    }
    const rule = this.faults.add({
      runId,
      userId: dto.userId,
      global: dto.global ?? false,
      method: dto.method,
      path: dto.path,
      action: dto.action,
      status: dto.status,
      code: dto.code,
      message: dto.message,
      delayMs: dto.delayMs,
      remaining: dto.times ?? null,
      expiresAt: new Date(Date.now() + (dto.ttlSeconds ?? 600) * 1000),
      description: dto.description,
    });
    await this.audit.log('create-fault', runId, ip, rule);
    return rule;
  }

  @Delete('faults/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar una regla de fallo' })
  deleteFault(@Param('id', ParseUUIDPipe) id: string): void {
    if (!this.faults.remove(id)) throw notFound(ErrorCode.NOT_FOUND, 'Regla no encontrada');
  }

  @Delete('faults')
  @ApiOperation({ summary: 'Eliminar las reglas de un runId (o todas si se permite)' })
  clearFaults(@Query('runId') runId?: string) {
    if (!runId && !this.config.testApi.allowGlobalFaults) {
      throw forbidden(ErrorCode.FAULT_SCOPE_REQUIRED, 'Indica runId');
    }
    return { deleted: this.faults.clear({ runId }) };
  }

  // ─── Audit ───

  @Get('audit')
  @ApiOperation({ summary: 'Registro de operaciones de la API de testing' })
  auditLog(@Query('runId') runId?: string, @Query('limit') limit?: string) {
    return this.audit.list(runId, limit ? Number(limit) : 100);
  }
}
