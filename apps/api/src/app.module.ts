import { DynamicModule, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { AppConfig, loadConfig } from './config/app-config';
import { ConfigModule } from './config/config.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { AuthGuard } from './common/guards/auth.guard';
import { ConfigurableThrottlerGuard } from './common/guards/throttler.guard';
import { FaultInjectionInterceptor } from './modules/testing/faults/fault-injection.interceptor';
import { FaultsModule } from './modules/testing/faults/faults.module';
import { RequestContextMiddleware } from './common/request-context.middleware';
import { PrismaModule } from './prisma/prisma.module';
import { AdminModule } from './modules/admin/admin.module';
import { AuthModule } from './modules/auth/auth.module';
import { CartModule } from './modules/cart/cart.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { EngagementModule } from './modules/engagement/engagement.module';
import { HealthController } from './modules/health/health.controller';
import { JobsModule } from './modules/jobs/jobs.module';
import { MailModule } from './modules/mail/mail.module';
import { OrdersModule } from './modules/orders/orders.module';
import { TestingModule } from './modules/testing/testing.module';
import { UsersModule } from './modules/users/users.module';

@Module({})
export class AppModule implements NestModule {
  static register(config: AppConfig = loadConfig()): DynamicModule {
    const optional: DynamicModule['imports'] = [];
    // The testing API module is only *registered* when enabled: in demo/production its routes do not exist (404).
    if (config.testApi.enabled) optional.push(TestingModule);
    if (config.serveWebDir) {
      optional.push(
        ServeStaticModule.forRoot({
          rootPath: resolve(config.serveWebDir),
          exclude: ['/api/{*path}'],
          serveStaticOptions: { index: 'index.html', maxAge: '1h' },
        }),
      );
    }

    return {
      module: AppModule,
      imports: [
        ConfigModule,
        LoggerModule.forRoot({
          pinoHttp: {
            level: config.log.level,
            genReqId: (req, res) => {
              const incoming = req.headers['x-request-id'];
              const id = typeof incoming === 'string' && /^[\w.-]{1,128}$/.test(incoming) ? incoming : randomUUID();
              res.setHeader('X-Request-Id', id);
              return id;
            },
            customProps: (req) => ({ testRunId: req.headers['x-test-run-id'] }),
            autoLogging: { ignore: (req) => (req.url ?? '').startsWith('/api/health') || (req.url ?? '').startsWith('/api/media') },
            redact: ['req.headers.authorization', 'req.headers.cookie', 'req.headers["x-test-api-key"]', 'res.headers["set-cookie"]'],
            transport: config.log.pretty ? { target: 'pino-pretty', options: { singleLine: true, colorize: true } } : undefined,
          },
        }),
        ThrottlerModule.forRoot({ throttlers: [{ name: 'default', ttl: 60_000, limit: config.rateLimit.perMinute }] }),
        PrismaModule,
        MailModule,
        FaultsModule,
        AuthModule,
        UsersModule,
        CatalogModule,
        CartModule,
        OrdersModule,
        EngagementModule,
        AdminModule,
        JobsModule,
        ...optional,
      ],
      controllers: [HealthController],
      providers: [
        { provide: APP_FILTER, useClass: AllExceptionsFilter },
        { provide: APP_GUARD, useClass: ConfigurableThrottlerGuard },
        { provide: APP_GUARD, useClass: AuthGuard },
        { provide: APP_INTERCEPTOR, useClass: FaultInjectionInterceptor },
      ],
    };
  }

  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}
