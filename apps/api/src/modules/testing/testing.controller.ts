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
import { REFERENCE_USERS, REVIEWERS, SCENARIO_USERS, ADMIN_PASSWORD, CUSTOMER_PASSWORD } from '../../seed/data/people.data';
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
    throw badRequest(ErrorCode.VALIDATION_ERROR, 'Invalid runId', [{ field: 'runId', message: '3-64 characters [A-Za-z0-9._-]' }]);
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
  @ApiOperation({ summary: 'Testing API capabilities and reference data' })
  info() {
    return {
      environment: this.config.env,
      globalResetAllowed: this.config.testApi.allowGlobalReset,
      globalFaultsAllowed: this.config.testApi.allowGlobalFaults,
      defaultTestPassword: DEFAULT_TEST_PASSWORD,
      referenceUsers: [...REFERENCE_USERS, ...SCENARIO_USERS, ...REVIEWERS.slice(0, 1)].map((u) => ({
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
    summary: 'GLOBAL reset: deletes ALL data and reloads the reference dataset',
    description: 'Only for dedicated environments without concurrent runs (ALLOW_GLOBAL_RESET=true). Deterministic IDs.',
  })
  async reset(@Body() _dto: ResetDto, @Ip() ip: string) {
    if (!this.config.testApi.allowGlobalReset) {
      throw forbidden(ErrorCode.GLOBAL_RESET_DISABLED, 'Global reset is disabled in this environment. Use the per-runId cleanup instead');
    }
    const summary = await this.seed.reset();
    this.faults.clear();
    await this.audit.log('reset', null, ip, summary);
    return { status: 'reset', summary };
  }

  @Post('seed')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Restore the reference data',
    description:
      'Puts reference products, coupons and users back into their initial state (stock, prices, passwords, orders...). ' +
      'Does not delete data created by runs (runId).',
  })
  async restore(@Ip() ip: string) {
    const summary = await this.seed.seed();
    await this.audit.log('seed', null, ip, summary);
    return { status: 'seeded', summary };
  }

  // ─── Runs ───

  @Get('runs/:runId')
  @ApiOperation({ summary: 'Summary of the data created by a run' })
  runSummary(@Param('runId') runId: string) {
    return this.cleanupService.summary(assertRunId(runId));
  }

  @Delete('runs/:runId')
  @ApiOperation({
    summary: 'Clean up the data of a run',
    description:
      'Deletes the users, orders, products, coupons, e-mails and faults of the runId (and users whose e-mail contains the runId). ' +
      'Reverts stock, sales counters, coupon usages and ratings of the shared data.',
  })
  async cleanup(@Param('runId') runId: string, @Ip() ip: string) {
    const removed = await this.cleanupService.cleanup(assertRunId(runId));
    await this.audit.log('cleanup', runId, ip, removed);
    return { status: 'cleaned', removed };
  }

  // ─── Fixtures ───

  @Post('users')
  @ApiOperation({ summary: 'Create a test user (optionally with an address and tokens)' })
  async createUser(@Body() dto: CreateTestUserDto, @Ip() ip: string) {
    const res = await this.fixtures.createUser(dto);
    await this.audit.log('create-user', res.runId, ip, { userId: res.user.id });
    return res;
  }

  @Post('auth/token')
  @ApiOperation({ summary: 'Issue tokens for a user without a password (configurable TTL)' })
  async token(@Body() dto: TestTokenDto) {
    return this.fixtures.issueToken(dto, dto.accessTtlSeconds, dto.refreshTtlSeconds);
  }

  @Post('sessions/expire')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Expire or revoke every session of a user' })
  async expireSessions(@Body() dto: ExpireSessionsDto, @Ip() ip: string) {
    const res = await this.fixtures.expireSessions(dto, dto.mode);
    await this.audit.log('expire-sessions', null, ip, res);
    return res;
  }

  @Post('password-reset-token')
  @ApiOperation({ summary: 'Generate a password reset token and return it directly' })
  passwordResetToken(@Body() dto: PasswordResetTokenDto) {
    return this.fixtures.passwordResetToken(dto.email);
  }

  @Post('products')
  @ApiOperation({ summary: 'Create a test product (only visible in listings for its runId)' })
  async createProduct(@Body() dto: CreateTestProductDto, @Ip() ip: string) {
    const res = await this.fixtures.createProduct(dto);
    await this.audit.log('create-product', res.runId, ip, { productId: res.product.id });
    return res;
  }

  @Patch('products/:id')
  @ApiOperation({ summary: 'Set the stock, price or status of any product' })
  async patchProduct(@Param('id', ParseIntPipe) id: number, @Body() dto: PatchTestProductDto, @Ip() ip: string) {
    const product = await this.fixtures.patchProduct(id, dto);
    await this.audit.log('patch-product', product.testRunId, ip, { productId: id, ...dto });
    return product;
  }

  @Post('carts')
  @ApiOperation({ summary: 'Prepare a user cart (force: true allows carts with issues)' })
  prepareCart(@Body() dto: PrepareCartDto) {
    return this.fixtures.prepareCart(dto);
  }

  @Post('orders')
  @ApiOperation({ summary: 'Create an order directly in a given status' })
  async createOrder(@Body() dto: CreateTestOrderDto, @Ip() ip: string) {
    const res = await this.fixtures.createOrder(dto);
    await this.audit.log('create-order', res.runId, ip, { orderId: res.order.id, status: dto.status });
    return res;
  }

  @Post('orders/:id/expire-reservation')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Expire the reservation of a pending order and run the expiry job' })
  async expireReservation(@Param('id', ParseIntPipe) id: number) {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) throw notFound(ErrorCode.ORDER_NOT_FOUND, 'Order not found');
    await this.prisma.order.update({ where: { id }, data: { reservationExpiresAt: new Date(Date.now() - 1000) } });
    const job = await this.jobs.run('expire-reservations');
    return { job, order: await this.orders.getById(id) };
  }

  @Post('coupons')
  @ApiOperation({ summary: 'Create a test coupon (valid, expired, upcoming, exhausted...)' })
  async createCoupon(@Body() dto: CreateTestCouponDto, @Ip() ip: string) {
    const res = await this.fixtures.createCoupon(dto);
    await this.audit.log('create-coupon', res.runId, ip, { couponId: res.coupon.id });
    return res;
  }

  @Post('payments/:id/resolve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resolve a pending payment immediately (APPROVED/DECLINED)' })
  async resolvePayment(@Param('id', ParseIntPipe) id: number, @Body() dto: ResolvePaymentDto) {
    const payment = await this.payments.resolvePending(id, dto.outcome);
    return { payment: toPaymentDto(payment), order: await this.orders.getById(payment.orderId) };
  }

  @Post('jobs/:name/run')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Run a background job immediately' })
  runJob(@Param('name') name: string) {
    if (!(JOB_NAMES as readonly string[]).includes(name)) {
      throw notFound(ErrorCode.NOT_FOUND, `Job desconocido. Disponibles: ${JOB_NAMES.join(', ')}`);
    }
    return this.jobs.run(name as JobName);
  }

  // ─── Scenarios ───

  @Get('scenarios')
  @ApiOperation({ summary: 'List the prepared scenarios' })
  listScenarios() {
    return this.scenarios.list();
  }

  @Post('scenarios/:name')
  @ApiOperation({ summary: 'Prepare an isolated scenario (new data tagged with the runId)' })
  async runScenario(@Param('name') name: string, @Body() dto: ScenarioDto, @Ip() ip: string) {
    const res = await this.scenarios.run(name, dto.runId);
    await this.audit.log(`scenario:${name}`, res.runId, ip);
    return res;
  }

  // ─── Mail outbox ───

  @Get('emails')
  @ApiOperation({ summary: 'Read the simulated mailbox (most recent first)' })
  emails(@Query() q: EmailQueryDto) {
    return this.prisma.emailMessage.findMany({
      where: this.emailWhere(q),
      orderBy: { id: 'desc' },
      take: q.limit ?? 50,
    });
  }

  @Get('emails/latest')
  @ApiOperation({ summary: 'Latest e-mail matching the filter (404 if none)' })
  async latestEmail(@Query() q: EmailQueryDto) {
    const email = await this.prisma.emailMessage.findFirst({ where: this.emailWhere(q), orderBy: { id: 'desc' } });
    if (!email) throw notFound(ErrorCode.NOT_FOUND, 'No e-mails match the filter');
    return email;
  }

  @Delete('emails')
  @ApiOperation({ summary: 'Empty the mailbox (filterable by recipient or runId)' })
  async clearEmails(@Query() q: EmailQueryDto) {
    if (!q.to && !q.runId && !this.config.testApi.allowGlobalReset) {
      throw forbidden(ErrorCode.GLOBAL_RESET_DISABLED, 'Provide "to" or "runId": global deletion is disabled in this environment');
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
  @ApiOperation({ summary: 'List active fault simulation rules' })
  listFaults(@Query('runId') runId?: string) {
    return this.faults.list({ runId });
  }

  @Post('faults')
  @ApiOperation({
    summary: 'Register a fault rule (500/503, latency, timeout...)',
    description:
      'Always scoped: by runId (X-Test-Run-Id request header), by authenticated userId or global (only with ALLOW_GLOBAL_FAULTS). ' +
      'Expires after ttlSeconds and can be limited to N requests (times) to simulate transient failures.',
  })
  async createFault(@Body() dto: CreateFaultDto, @Ip() ip: string) {
    if (dto.global && !this.config.testApi.allowGlobalFaults) {
      throw forbidden(ErrorCode.FAULT_SCOPE_REQUIRED, 'Global rules are disabled in this environment');
    }
    const runId = dto.global || dto.userId ? dto.runId : resolveRunId(dto.runId);
    if (!runId && !dto.userId && !dto.global) {
      throw badRequest(ErrorCode.FAULT_SCOPE_REQUIRED, 'Provide runId, userId or global');
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
  @ApiOperation({ summary: 'Delete a fault rule' })
  deleteFault(@Param('id', ParseUUIDPipe) id: string): void {
    if (!this.faults.remove(id)) throw notFound(ErrorCode.NOT_FOUND, 'Rule not found');
  }

  @Delete('faults')
  @ApiOperation({ summary: 'Delete the rules of a runId (or all of them when allowed)' })
  clearFaults(@Query('runId') runId?: string) {
    if (!runId && !this.config.testApi.allowGlobalFaults) {
      throw forbidden(ErrorCode.FAULT_SCOPE_REQUIRED, 'Provide runId');
    }
    return { deleted: this.faults.clear({ runId }) };
  }

  // ─── Audit ───

  @Get('audit')
  @ApiOperation({ summary: 'Testing API operation log' })
  auditLog(@Query('runId') runId?: string, @Query('limit') limit?: string) {
    return this.audit.list(runId, limit ? Number(limit) : 100);
  }
}
