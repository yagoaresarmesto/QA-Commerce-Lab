import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppConfig } from './config/app-config';

export function buildOpenApiDocument(app: INestApplication, config: AppConfig) {
  const builder = new DocumentBuilder()
    .setTitle('QA Commerce Lab API')
    .setVersion(config.version)
    .setDescription(
      [
        'API REST de **QA Commerce Lab**, tienda de electrónica ficticia diseñada como *System Under Test* para automatización.',
        '',
        `Entorno actual: **${config.env}** · API de testing: **${config.testApi.enabled ? 'habilitada' : 'deshabilitada'}** · Rate limiting: **${config.rateLimit.enabled ? 'activo' : 'inactivo'}**`,
        '',
        '- Importes en **céntimos de euro** (enteros), IVA incluido.',
        '- Autenticación: `POST /api/auth/login` → usa `accessToken` con el botón **Authorize** (Bearer).',
        '- Todos los errores siguen el mismo esquema (`ErrorResponseDto`) con un `code` estable.',
        '- Cabeceras útiles: `Idempotency-Key` (pedidos y pagos), `X-Cart-Token` (carrito de invitado), `X-Request-Id`, `X-Test-Run-Id`.',
        '- Especificación OpenAPI: [/api/docs-json](/api/docs-json) · [/api/docs-yaml](/api/docs-yaml)',
      ].join('\n'),
    )
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token')
    .addCookieAuth('qcl_rt', { type: 'apiKey', in: 'cookie', name: 'qcl_rt' }, 'refresh-cookie')
    .addTag('Health', 'Estado del servicio e información del entorno')
    .addTag('Auth', 'Registro, login, sesiones y recuperación de contraseña')
    .addTag('Users', 'Perfil, contraseña, sesiones y direcciones del usuario autenticado')
    .addTag('Catalog', 'Productos, categorías, marcas y home')
    .addTag('Cart', 'Carrito persistente (usuario o invitado) y cupones')
    .addTag('Checkout', 'Métodos de envío, puntos de recogida y presupuesto del pedido')
    .addTag('Orders', 'Pedidos del usuario, pagos, cancelaciones y devoluciones')
    .addTag('Favorites', 'Lista de favoritos')
    .addTag('Reviews', 'Reseñas de productos')
    .addTag('Admin', 'Panel de administración (rol ADMIN)');

  if (config.testApi.enabled) {
    builder
      .addApiKey({ type: 'apiKey', in: 'header', name: 'X-Test-Api-Key' }, 'test-api-key')
      .addTag('Testing', 'Infraestructura para automatización (solo entornos local/testing). Requiere X-Test-Api-Key');
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
