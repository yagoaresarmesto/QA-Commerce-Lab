import './load-env';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { loadConfig } from './config/app-config';
import { createValidationPipe } from './common/validation';
import { setupSwagger } from './swagger';

async function bootstrap(): Promise<void> {
  const config = loadConfig();
  const app = await NestFactory.create<NestExpressApplication>(AppModule.register(config), { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(
    helmet({
      contentSecurityPolicy: config.serveWebDir
        ? {
            directives: {
              defaultSrc: ["'self'"],
              imgSrc: ["'self'", 'data:'],
              styleSrc: ["'self'", "'unsafe-inline'"],
              scriptSrc: ["'self'"],
              connectSrc: ["'self'"],
              fontSrc: ["'self'", 'data:'],
              // TLS is terminated by the reverse proxy / platform; never force-upgrade sub-requests.
              upgradeInsecureRequests: null,
            },
          }
        : false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(cookieParser());
  app.useBodyParser('json', { limit: '256kb' });
  app.enableCors({
    origin: config.corsOrigins.length ? config.corsOrigins : false,
    credentials: true,
    exposedHeaders: ['X-Request-Id', 'Idempotent-Replayed', 'X-Fault-Injected'],
  });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(createValidationPipe());
  app.enableShutdownHooks();

  if (config.swaggerEnabled) setupSwagger(app, config);

  await app.listen(config.port, '0.0.0.0');
  app.get(Logger).log(
    `QA Commerce Lab API listening on :${config.port} (env=${config.env}, testingApi=${config.testApi.enabled}, rateLimit=${config.rateLimit.enabled})`,
    'Bootstrap',
  );
}

void bootstrap();
