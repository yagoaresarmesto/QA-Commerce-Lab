# Documentación de la API

La API REST es la **misma** que usa el storefront: no hay endpoints decorativos. La referencia completa y siempre actualizada es la especificación OpenAPI generada desde el código:

| Recurso | Local | Remoto |
|---|---|---|
| Swagger UI | http://localhost:3001/api/docs | `https://<dominio>/api/docs` |
| OpenAPI JSON | http://localhost:3001/api/docs-json | `https://<dominio>/api/docs-json` |
| OpenAPI YAML | http://localhost:3001/api/docs-yaml | `https://<dominio>/api/docs-yaml` |

En Swagger UI pulsa **Authorize** y pega el `accessToken` obtenido en `POST /api/auth/login` (esquema `access-token`). En entornos de testing aparece también el esquema `test-api-key` para la etiqueta **Testing**.

## Convenciones

- Prefijo: `/api`. JSON en peticiones y respuestas (`Content-Type: application/json`).
- **Importes**: enteros en **céntimos de euro**, IVA incluido (`priceCents: 79899` = 798,99 €).
- **Fechas**: ISO 8601 en UTC.
- **IDs**: enteros autoincrementales para entidades de dominio (deterministas tras un reset); UUID para sesiones y tokens de carrito de invitado.
- **Paginación**: parámetros `page` (desde 1) y `pageSize`; respuesta `{ data: [...], meta: { page, pageSize, total, totalPages, hasNextPage, hasPreviousPage } }`. El orden siempre incluye un desempate por `id`, de modo que la paginación es estable.
- **Validación**: los campos desconocidos se rechazan (`property x should not exist`), los strings se recortan (`trim`) y cada campo devuelve **un único** mensaje de error.
- **Correlación**: todas las respuestas incluyen `X-Request-Id` (se respeta el que envíes).

## Autenticación

| Paso | Petición |
|---|---|
| Registro | `POST /api/auth/register` → `201` con tokens (sin verificación de email) |
| Login | `POST /api/auth/login` → `200 { accessToken, refreshToken, tokenType, expiresIn, refreshTokenExpiresAt, user }` |
| Uso | Cabecera `Authorization: Bearer <accessToken>` |
| Renovación | `POST /api/auth/refresh` con `{ "refreshToken": "..." }` o la cookie `qcl_rt` |
| Logout | `POST /api/auth/logout` (revoca la sesión del token o del refresh token) → `204` |

Roles: **invitado** (sin token), **CUSTOMER** y **ADMIN**. Las rutas `/api/admin/*` exigen ADMIN (`403 FORBIDDEN` para clientes). Acceder a recursos de otro usuario (pedidos, direcciones) devuelve `404` para no revelar su existencia; modificar la reseña de otro devuelve `403 NOT_RESOURCE_OWNER`.

## Cabeceras especiales

| Cabecera | Dirección | Uso |
|---|---|---|
| `Authorization: Bearer` | → | Access token |
| `X-Cart-Token` | → | Carrito de invitado (UUID devuelto como `token` por `POST /api/cart/items`) |
| `Idempotency-Key` | → | `POST /api/orders` y `POST /api/orders/{id}/payments` (8-100 caracteres `[A-Za-z0-9_.:-]`) |
| `Idempotent-Replayed: true` | ← | La respuesta es la repetición de una petición idempotente anterior (`200`) |
| `X-Test-Run-Id` | → | Etiqueta/aislamiento de datos de automatización (solo `local`/`testing`) |
| `X-Test-Api-Key` | → | Clave de la API de testing |
| `X-Request-Id` | ↔ | Correlación con los logs |
| `X-Fault-Injected` | ← | La respuesta fue alterada por una regla de simulación de fallos |

## Formato de error

Todas las respuestas de error usan el mismo esquema (`ErrorResponseDto`):

```json
{
  "statusCode": 409,
  "error": "Conflict",
  "code": "INSUFFICIENT_STOCK",
  "message": "Solo quedan 2 unidades disponibles",
  "details": { "availableStock": 2, "requested": 3 },
  "path": "/api/cart/items",
  "method": "POST",
  "timestamp": "2026-11-14T18:00:00.000Z",
  "requestId": "6f1c..."
}
```

Errores de validación (`400 VALIDATION_ERROR`): `details` es una lista `[{ "field": "email", "message": "El email no tiene un formato válido" }]` (campos anidados con punto: `card.cvc`).

**Asierta sobre `statusCode` y `code`**, no sobre `message` (texto en castellano pensado para el usuario final).

## Códigos HTTP

| Código | Cuándo |
|---|---|
| 200 | Consulta o acción correcta (incluye repeticiones idempotentes) |
| 201 | Recurso creado (registro, pedido, dirección, reseña, favorito, pago...) |
| 202 | Solicitud aceptada (`forgot-password`, siempre, para no revelar cuentas) |
| 204 | Acción sin cuerpo (logout, borrar dirección/favorito/reseña, reset de contraseña) |
| 400 | Datos no válidos, JSON mal formado (`INVALID_JSON`), token de recuperación inválido/caducado/usado |
| 401 | Sin autenticar o token/sesión no válidos (códigos diferenciados) |
| 403 | Sin permisos, cuenta desactivada, no propietario, operación de testing no permitida en el entorno |
| 404 | Recurso inexistente o ajeno; ruta inexistente (`ROUTE_NOT_FOUND`) |
| 409 | Conflicto de estado: stock insuficiente, duplicados, transición de estado no permitida, precio cambiado, pago en curso |
| 413 | Cuerpo demasiado grande (límite 256 KB) |
| 422 | Regla de negocio no cumplida: cupones, carrito vacío o con incidencias, tarjeta no válida, límites |
| 429 | Solo si el rate limiting está habilitado (demo pública) |
| 500 | Error inesperado (o simulado) |
| 502 / 504 | Error / timeout de la pasarela de pagos simulada (el pedido ya existe) |
| 503 | Base de datos no disponible (o fallo simulado) |

## Catálogo de errores (`code`)

| Ámbito | Códigos |
|---|---|
| Genéricos | `VALIDATION_ERROR`, `INVALID_JSON`, `PAYLOAD_TOO_LARGE`, `NOT_FOUND`, `ROUTE_NOT_FOUND`, `CONFLICT`, `RATE_LIMITED`, `INTERNAL_ERROR`, `SERVICE_UNAVAILABLE`, `FAULT_INJECTED`, `GATEWAY_TIMEOUT` |
| Autenticación | `UNAUTHENTICATED`, `TOKEN_INVALID`, `TOKEN_EXPIRED`, `SESSION_REVOKED`, `SESSION_EXPIRED`, `REFRESH_TOKEN_INVALID`, `INVALID_CREDENTIALS`, `ACCOUNT_DISABLED`, `FORBIDDEN`, `EMAIL_ALREADY_REGISTERED`, `CURRENT_PASSWORD_INCORRECT`, `PASSWORD_REUSED`, `RESET_TOKEN_INVALID`, `RESET_TOKEN_EXPIRED`, `RESET_TOKEN_USED` |
| Usuarios | `USER_NOT_FOUND`, `ADDRESS_NOT_FOUND`, `ADDRESS_LIMIT_REACHED`, `CANNOT_MODIFY_OWN_ACCOUNT` |
| Catálogo | `PRODUCT_NOT_FOUND`, `CATEGORY_NOT_FOUND`, `BRAND_NOT_FOUND`, `SKU_ALREADY_EXISTS`, `CATEGORY_NOT_ASSIGNABLE`, `INVALID_PRICE` |
| Carrito | `CART_NOT_FOUND`, `CART_ITEM_NOT_FOUND`, `CART_EMPTY`, `CART_HAS_ISSUES`, `PRODUCT_UNAVAILABLE`, `OUT_OF_STOCK`, `INSUFFICIENT_STOCK`, `MAX_QUANTITY_EXCEEDED` |
| Cupones | `COUPON_INVALID`, `COUPON_INACTIVE`, `COUPON_EXPIRED`, `COUPON_NOT_STARTED`, `COUPON_USAGE_LIMIT_REACHED`, `COUPON_ALREADY_USED`, `COUPON_MIN_SUBTOTAL_NOT_REACHED`, `COUPON_NOT_APPLICABLE`, `COUPON_REQUIRES_LOGIN`, `COUPON_CODE_EXISTS` |
| Checkout y pedidos | `SHIPPING_METHOD_NOT_FOUND`, `PICKUP_POINT_REQUIRED`, `PICKUP_POINT_NOT_FOUND`, `PRICE_CHANGED`, `IDEMPOTENCY_KEY_REUSED`, `ORDER_NOT_FOUND`, `INVALID_STATUS_TRANSITION`, `ORDER_NOT_CANCELLABLE`, `ORDER_NOT_RETURNABLE`, `RETURN_WINDOW_EXPIRED`, `ORDER_NOT_PAYABLE`, `PAYMENT_IN_PROGRESS` |
| Pagos | `CARD_INVALID`, `CARD_NOT_ALLOWED`, `CARD_EXPIRED`, `CARD_DETAILS_REQUIRED`, `PAYMENT_PROCESSING_ERROR`, `PAYMENT_GATEWAY_TIMEOUT`, `PAYMENT_NOT_FOUND` |
| Favoritos y reseñas | `FAVORITE_ALREADY_EXISTS`, `FAVORITE_NOT_FOUND`, `REVIEW_ALREADY_EXISTS`, `REVIEW_NOT_FOUND`, `NOT_RESOURCE_OWNER` |
| API de testing | `TEST_API_KEY_INVALID`, `GLOBAL_RESET_DISABLED`, `SCENARIO_NOT_FOUND`, `FAULT_SCOPE_REQUIRED` |

## Endpoints

Generado a partir de la especificación OpenAPI. 🔒 = acepta o exige `Authorization: Bearer` (en `/api/cart/*` es opcional: sin token se usa el carrito de invitado; en `/api/auth/refresh` es la cookie `qcl_rt`).

### Admin

| Método | Ruta | Descripción | Token |
|---|---|---|---|
| GET | `/api/admin/dashboard` | Métricas del panel de administración | 🔒 |
| GET | `/api/admin/products` | Listar productos (incluye desactivados) | 🔒 |
| POST | `/api/admin/products` | Crear producto | 🔒 |
| GET | `/api/admin/products/{id}` | Detalle de producto | 🔒 |
| PATCH | `/api/admin/products/{id}` | Editar producto | 🔒 |
| POST | `/api/admin/products/{id}/stock-adjustments` | Ajuste atómico de stock (+/-) | 🔒 |
| GET | `/api/admin/orders` | Listar pedidos (filtros por estado, pago, búsqueda y fechas) | 🔒 |
| GET | `/api/admin/orders/{id}` | Detalle de pedido con transiciones permitidas | 🔒 |
| PATCH | `/api/admin/orders/{id}/status` | Cambiar estado del pedido | 🔒 |
| POST | `/api/admin/orders/{id}/confirm-payment` | Confirmar la recepción de una transferencia bancaria (pedido → PAID) | 🔒 |
| GET | `/api/admin/users` | Listar usuarios | 🔒 |
| GET | `/api/admin/users/{id}` | Detalle administrativo de usuario | 🔒 |
| PATCH | `/api/admin/users/{id}` | Cambiar estado (activar/desactivar) o rol de un usuario | 🔒 |
| GET | `/api/admin/coupons` | Listar cupones | 🔒 |
| POST | `/api/admin/coupons` | Crear cupón | 🔒 |
| GET | `/api/admin/coupons/{id}` | Detalle de cupón | 🔒 |
| PATCH | `/api/admin/coupons/{id}` | Editar cupón (isActive=false lo desactiva) | 🔒 |

### Auth

| Método | Ruta | Descripción | Token |
|---|---|---|---|
| POST | `/api/auth/register` | Registrar un nuevo usuario |  |
| POST | `/api/auth/login` | Iniciar sesión |  |
| POST | `/api/auth/refresh` | Renovar el access token | 🔒 |
| POST | `/api/auth/logout` | Cerrar sesión | 🔒 |
| POST | `/api/auth/forgot-password` | Solicitar recuperación de contraseña |  |
| GET | `/api/auth/reset-password/validate` | Comprobar si un token de recuperación es válido |  |
| POST | `/api/auth/reset-password` | Restablecer la contraseña con el token recibido por email |  |

### Cart

| Método | Ruta | Descripción | Token |
|---|---|---|---|
| GET | `/api/cart` | Consultar el carrito | 🔒 |
| DELETE | `/api/cart` | Vaciar el carrito (también quita el cupón) | 🔒 |
| POST | `/api/cart/items` | Añadir producto al carrito | 🔒 |
| PATCH | `/api/cart/items/{itemId}` | Cambiar la cantidad de una línea del carrito | 🔒 |
| DELETE | `/api/cart/items/{itemId}` | Eliminar una línea del carrito (devuelve el carrito actualizado) | 🔒 |
| POST | `/api/cart/coupon` | Aplicar cupón al carrito (requiere sesión) | 🔒 |
| DELETE | `/api/cart/coupon` | Quitar el cupón del carrito | 🔒 |
| POST | `/api/cart/merge` | Fusionar un carrito de invitado con el del usuario | 🔒 |

### Catalog

| Método | Ruta | Descripción | Token |
|---|---|---|---|
| GET | `/api/home` | Contenido de la página principal (banners, destacados, ofertas, novedades...) |  |
| GET | `/api/products` | Listar/buscar productos |  |
| GET | `/api/products/suggestions` | Sugerencias de búsqueda (autocompletado) |  |
| GET | `/api/products/{idOrSlug}` | Detalle de producto por id o slug |  |
| GET | `/api/products/{idOrSlug}/related` | Productos relacionados (misma categoría, más vendidos) |  |
| GET | `/api/categories` | Árbol de categorías con número de productos activos |  |
| GET | `/api/categories/{slug}` | Detalle de categoría |  |
| GET | `/api/brands` | Marcas (opcionalmente filtradas por categoría) |  |

### Checkout

| Método | Ruta | Descripción | Token |
|---|---|---|---|
| GET | `/api/shipping/methods` | Métodos de envío disponibles |  |
| GET | `/api/shipping/pickup-points` | Puntos de recogida (filtrables por ciudad o código postal) |  |
| POST | `/api/checkout/quote` | Presupuesto del pedido | 🔒 |

### Favorites

| Método | Ruta | Descripción | Token |
|---|---|---|---|
| GET | `/api/favorites` | Listar favoritos del usuario | 🔒 |
| POST | `/api/favorites` | Añadir producto a favoritos | 🔒 |
| DELETE | `/api/favorites/{productId}` | Quitar producto de favoritos | 🔒 |

### Health

| Método | Ruta | Descripción | Token |
|---|---|---|---|
| GET | `/api/health` | Liveness: el proceso responde |  |
| GET | `/api/health/ready` | Readiness: el proceso y la base de datos están disponibles |  |
| GET | `/api/info` | Información del entorno |  |

### Orders

| Método | Ruta | Descripción | Token |
|---|---|---|---|
| POST | `/api/orders` | Crear pedido (checkout) y procesar el pago | 🔒 |
| GET | `/api/orders` | Historial de pedidos del usuario (más recientes primero) | 🔒 |
| GET | `/api/orders/{idOrNumber}` | Detalle de un pedido propio (por id o número de pedido) | 🔒 |
| POST | `/api/orders/{idOrNumber}/payments` | Reintentar el pago de un pedido pendiente | 🔒 |
| POST | `/api/orders/{idOrNumber}/cancel` | Cancelar pedido | 🔒 |
| POST | `/api/orders/{idOrNumber}/return` | Solicitar devolución | 🔒 |

### Reviews

| Método | Ruta | Descripción | Token |
|---|---|---|---|
| GET | `/api/products/{productId}/reviews` | Reseñas de un producto (paginadas, con resumen de valoraciones) |  |
| POST | `/api/products/{productId}/reviews` | Publicar una reseña | 🔒 |
| GET | `/api/users/me/reviews` | Reseñas publicadas por el usuario autenticado | 🔒 |
| PATCH | `/api/reviews/{id}` | Editar una reseña propia | 🔒 |
| DELETE | `/api/reviews/{id}` | Eliminar una reseña (autor o administrador) | 🔒 |

### Testing

| Método | Ruta | Descripción | Token |
|---|---|---|---|
| GET | `/api/test/info` | Capacidades de la API de testing y datos de referencia | 🔒 |
| POST | `/api/test/reset` | Reset GLOBAL: borra TODOS los datos y recarga el dataset de referencia | 🔒 |
| POST | `/api/test/seed` | Restaurar los datos de referencia | 🔒 |
| GET | `/api/test/runs/{runId}` | Resumen de los datos creados por una ejecución | 🔒 |
| DELETE | `/api/test/runs/{runId}` | Limpiar los datos de una ejecución | 🔒 |
| POST | `/api/test/users` | Crear usuario de prueba (opcionalmente con dirección y tokens) | 🔒 |
| POST | `/api/test/auth/token` | Emitir tokens para un usuario sin contraseña (TTL configurable) | 🔒 |
| POST | `/api/test/sessions/expire` | Caducar o revocar todas las sesiones de un usuario | 🔒 |
| POST | `/api/test/password-reset-token` | Generar un token de recuperación de contraseña y devolverlo directamente | 🔒 |
| POST | `/api/test/products` | Crear producto de prueba (solo visible en listados para su runId) | 🔒 |
| PATCH | `/api/test/products/{id}` | Fijar inventario, precio o estado de cualquier producto | 🔒 |
| POST | `/api/test/carts` | Preparar el carrito de un usuario (force: true permite carritos con incidencias) | 🔒 |
| POST | `/api/test/orders` | Crear un pedido directamente en un estado concreto | 🔒 |
| POST | `/api/test/orders/{id}/expire-reservation` | Caducar la reserva de un pedido pendiente y ejecutar el job de expiración | 🔒 |
| POST | `/api/test/coupons` | Crear cupón de prueba (válido, caducado, futuro, agotado...) | 🔒 |
| POST | `/api/test/payments/{id}/resolve` | Resolver inmediatamente un pago pendiente (APPROVED/DECLINED) | 🔒 |
| POST | `/api/test/jobs/{name}/run` | Ejecutar un job en segundo plano inmediatamente | 🔒 |
| GET | `/api/test/scenarios` | Listar escenarios preparados | 🔒 |
| POST | `/api/test/scenarios/{name}` | Preparar un escenario aislado (datos nuevos etiquetados con el runId) | 🔒 |
| GET | `/api/test/emails` | Consultar el buzón simulado (más recientes primero) | 🔒 |
| DELETE | `/api/test/emails` | Vaciar el buzón (filtrable por destinatario o runId) | 🔒 |
| GET | `/api/test/emails/latest` | Último email que cumple el filtro (404 si no hay) | 🔒 |
| GET | `/api/test/faults` | Listar reglas de simulación de fallos activas | 🔒 |
| POST | `/api/test/faults` | Registrar una regla de fallo (500/503, latencia, timeout...) | 🔒 |
| DELETE | `/api/test/faults` | Eliminar las reglas de un runId (o todas si se permite) | 🔒 |
| DELETE | `/api/test/faults/{id}` | Eliminar una regla de fallo | 🔒 |
| GET | `/api/test/audit` | Registro de operaciones de la API de testing | 🔒 |

### Users

| Método | Ruta | Descripción | Token |
|---|---|---|---|
| GET | `/api/users/me` | Obtener el perfil del usuario autenticado | 🔒 |
| PATCH | `/api/users/me` | Actualizar datos personales | 🔒 |
| POST | `/api/users/me/password` | Cambiar la contraseña | 🔒 |
| GET | `/api/users/me/sessions` | Listar sesiones activas | 🔒 |
| POST | `/api/users/me/sessions/revoke-others` | Cerrar todas las sesiones excepto la actual | 🔒 |
| DELETE | `/api/users/me/sessions/{sessionId}` | Cerrar una sesión concreta | 🔒 |
| GET | `/api/users/me/addresses` | Listar direcciones (la predeterminada primero) | 🔒 |
| POST | `/api/users/me/addresses` | Crear dirección | 🔒 |
| GET | `/api/users/me/addresses/{id}` | Obtener una dirección | 🔒 |
| PATCH | `/api/users/me/addresses/{id}` | Editar dirección | 🔒 |
| DELETE | `/api/users/me/addresses/{id}` | Eliminar dirección | 🔒 |
| POST | `/api/users/me/addresses/{id}/default` | Marcar dirección como predeterminada | 🔒 |

## Ejemplos

```bash
API=http://localhost:3001/api

# Buscar portátiles en stock de 2 marcas, del más barato al más caro
curl -s "$API/products?category=portatiles&brand=nebula,arcadia&inStock=true&sort=price_asc&page=1&pageSize=12"

# Login y uso del token
TOKEN=$(curl -s -X POST $API/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"customer@qacommerce.test","password":"Customer123!"}' | jq -r .accessToken)
curl -s $API/users/me -H "Authorization: Bearer $TOKEN"

# Carrito, cupón y presupuesto
curl -s -X POST $API/cart/items -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"productId":1,"quantity":1}'
curl -s -X POST $API/cart/coupon -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"code":"BIENVENIDA10"}'
ADDRESS=$(curl -s $API/users/me/addresses -H "Authorization: Bearer $TOKEN" | jq '.[0].id')
curl -s -X POST $API/checkout/quote -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"addressId\":$ADDRESS,\"shippingMethodCode\":\"STANDARD\"}"

# Pedido idempotente con tarjeta de prueba
curl -s -X POST $API/orders -H "Authorization: Bearer $TOKEN" -H 'Idempotency-Key: demo-order-0001' -H 'Content-Type: application/json' \
  -d "{\"addressId\":$ADDRESS,\"shippingMethodCode\":\"STANDARD\",\"paymentMethod\":\"CARD\",\"card\":{\"number\":\"4242424242424242\",\"holderName\":\"CARLOS PEREZ\",\"expMonth\":12,\"expYear\":2030,\"cvc\":\"123\"}}"
```

## Health checks

| Ruta | Uso |
|---|---|
| `GET /api/health` | Liveness (el proceso responde) |
| `GET /api/health/ready` | Readiness: incluye comprobación de base de datos (`503` si no responde) |
| `GET /api/info` | Entorno, versión, commit y capacidades activas |
