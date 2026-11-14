import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppConfig } from './config/app-config';

export function buildOpenApiDocument(app: INestApplication, config: AppConfig) {
  const builder = new DocumentBuilder()
    .setTitle('QA Commerce Lab API')
    .setVersion(config.version)
    .setDescription(
      [
        'REST API of **QA Commerce Lab**, a fictional electronics store designed as a *System Under Test* for test automation.',
        '',
        `Current environment: **${config.env}** · Testing API: **${config.testApi.enabled ? 'enabled' : 'disabled'}** · Rate limiting: **${config.rateLimit.enabled ? 'on' : 'off'}**`,
        '',
        '- Amounts in **euro cents** (integers), VAT included.',
        '- Authentication: `POST /api/auth/login` → use the `accessToken` with the **Authorize** button (Bearer).',
        '- Every error follows the same schema (`ErrorResponseDto`) with a stable `code`.',
        '- Useful headers: `Idempotency-Key` (orders and payments), `X-Cart-Token` (guest cart), `X-Request-Id`, `X-Test-Run-Id`.',
        '- OpenAPI specification: [/api/docs-json](/api/docs-json) · [/api/docs-yaml](/api/docs-yaml)',
      ].join('\n'),
    )
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token')
    .addCookieAuth('qcl_rt', { type: 'apiKey', in: 'cookie', name: 'qcl_rt' }, 'refresh-cookie')
    .addTag('Health', 'Service status and environment information')
    .addTag('Auth', 'Registration, login, sessions and password recovery')
    .addTag('Users', 'Profile, password, sessions and addresses of the authenticated user')
    .addTag('Catalog', 'Products, categories, brands and home page')
    .addTag('Cart', 'Persistent cart (user or guest) and coupons')
    .addTag('Checkout', 'Shipping methods, pickup points and order quote')
    .addTag('Orders', 'User orders, payments, cancellations and returns')
    .addTag('Favorites', 'Favorites list')
    .addTag('Reviews', 'Product reviews')
    .addTag('Admin', 'Administration panel (ADMIN role)');

  if (config.testApi.enabled) {
    builder
      .addApiKey({ type: 'apiKey', in: 'header', name: 'X-Test-Api-Key' }, 'test-api-key')
      .addTag('Testing', 'Test automation support (local/testing environments only). Requires X-Test-Api-Key');
  }
  return SwaggerModule.createDocument(app, builder.build(), {
    operationIdFactory: (controllerKey: string, methodKey: string) =>
      `${controllerKey.replace(/Controller$/, '')}_${methodKey}`,
  });
}

export function setupSwagger(app: INestApplication, config: AppConfig): void {
  const document = buildOpenApiDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    jsonDocumentUrl: 'api/docs-json',
    yamlDocumentUrl: 'api/docs-yaml',
    customSiteTitle: 'QA Commerce Lab · API Docs',
    swaggerOptions: { persistAuthorization: true, displayRequestDuration: true, docExpansion: 'none', filter: true },
  });
}
