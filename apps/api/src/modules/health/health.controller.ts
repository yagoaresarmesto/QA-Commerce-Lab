import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { AppConfig } from '../../config/app-config';
import { Public } from '../../common/decorators/auth.decorators';
import { PrismaService } from '../../prisma/prisma.service';

export class HealthDto {
  status: 'ok' | 'error';
  uptimeSeconds: number;
  timestamp: string;
  checks?: Record<string, { status: 'ok' | 'error'; latencyMs?: number; error?: string }>;
}

export class InfoDto {
  name: string;
  version: string;
  commit: string | null;
  environment: string;
  features: {
    testingApi: boolean;
    globalReset: boolean;
    faultInjection: boolean;
    rateLimiting: boolean;
    swagger: boolean;
  };
  auth: { accessTokenTtlSeconds: number; refreshTokenTtlDays: number };
  payments: { pendingDelayMs: number; timeoutDelayMs: number };
  orders: { reservationMinutes: number; bankTransferReservationHours: number; returnWindowDays: number };
}

@ApiTags('Health')
@Public()
@Controller()
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
  ) {}

  @Get('health')
  @ApiOperation({ summary: 'Liveness: el proceso responde' })
  @ApiOkResponse({ type: HealthDto })
  liveness(): HealthDto {
    return { status: 'ok', uptimeSeconds: Math.round(process.uptime()), timestamp: new Date().toISOString() };
  }

  @Get('health/ready')
  @ApiOperation({ summary: 'Readiness: el proceso y la base de datos están disponibles' })
  @ApiOkResponse({ type: HealthDto })
  @ApiServiceUnavailableResponse({ type: HealthDto })
  async readiness(@Res({ passthrough: true }) res: Response): Promise<HealthDto> {
    const started = Date.now();
    let db: { status: 'ok' | 'error'; latencyMs?: number; error?: string };
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      db = { status: 'ok', latencyMs: Date.now() - started };
    } catch (err) {
      db = { status: 'error', error: (err as Error).message.slice(0, 200) };
    }
    const ok = db.status === 'ok';
    if (!ok) res.status(HttpStatus.SERVICE_UNAVAILABLE);
    return {
      status: ok ? 'ok' : 'error',
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
      checks: { database: db },
    };
  }

  @Get('info')
  @ApiOperation({
    summary: 'Información del entorno',
    description: 'Permite a la automatización saber contra qué entorno se ejecuta y qué capacidades de testing están activas.',
  })
  @ApiOkResponse({ type: InfoDto })
  info(): InfoDto {
    const c = this.config;
    return {
      name: 'QA Commerce Lab',
      version: c.version,
      commit: c.commit ?? null,
      environment: c.env,
      features: {
        testingApi: c.testApi.enabled,
        globalReset: c.testApi.allowGlobalReset,
        faultInjection: c.testApi.enabled,
        rateLimiting: c.rateLimit.enabled,
        swagger: c.swaggerEnabled,
      },
      auth: { accessTokenTtlSeconds: c.accessTokenTtlSeconds, refreshTokenTtlDays: c.refreshTokenTtlDays },
      payments: c.payments,
      orders: c.orders,
    };
  }
}
