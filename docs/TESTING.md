# Guía para QA Automation

Esta guía explica todo lo necesario para automatizar QA Commerce Lab (UI y API) **sin leer el código fuente**: entornos, datos de referencia, API de testing, escenarios, aislamiento, simulación de fallos y buenas prácticas de selectores.

> La API de testing **solo existe** en los entornos `local` y `testing`. En la demo pública (`APP_ENV=demo`) el módulo ni siquiera se registra: cualquier ruta `/api/test/*` devuelve `404`.

## Índice

1. [Entornos y URLs](#1-entornos-y-urls)
2. [Datos de referencia (seed determinista)](#2-datos-de-referencia-seed-determinista)
3. [API de testing](#3-api-de-testing)
4. [Escenarios preparados](#4-escenarios-preparados)
5. [Aislamiento y ejecución en paralelo](#5-aislamiento-y-ejecución-en-paralelo)
6. [Reset, restauración y limpieza](#6-reset-restauración-y-limpieza)
7. [Simulación controlada de fallos](#7-simulación-controlada-de-fallos)
8. [Pagos simulados](#8-pagos-simulados)
9. [Emails, sesiones y tokens](#9-emails-sesiones-y-tokens)
10. [Selectores y accesibilidad](#10-selectores-y-accesibilidad)
11. [Login programático y estado de sesión](#11-login-programático-y-estado-de-sesión)
12. [Ejecutar pruebas desde GitHub Actions](#12-ejecutar-pruebas-desde-github-actions)
13. [Qué NO hace la plataforma (a propósito)](#13-qué-no-hace-la-plataforma-a-propósito)

---

## 1. Entornos y URLs

| Entorno | Para qué | Storefront | API / Swagger | API de testing | Reset global |
|---|---|---|---|---|---|
| `local` (Docker) | Desarrollo y depuración | http://localhost:3000 | http://localhost:3001/api · `/api/docs` | Sí (`X-Test-Api-Key: local-test-api-key`) | Sí |
| `local` (npm run dev) | Desarrollo del SUT | http://localhost:3000 | http://localhost:3001/api | Sí | Sí |
| `testing` (remoto) | Suites de automatización | `https://<TESTING_DOMAIN>` | `https://<TESTING_DOMAIN>/api` | Sí (clave secreta) | No por defecto (`ALLOW_GLOBAL_RESET=false`) |
| `demo` (remoto) | Enseñar el proyecto | `https://<DEMO_DOMAIN>` | `https://<DEMO_DOMAIN>/api` | **No** (404) | Automático nocturno opcional |

En remoto, storefront y API comparten origen (la imagen *all-in-one* sirve ambos). Variables típicas para tu repositorio de automatización:

```bash
BASE_URL=https://testing.example.com
API_BASE_URL=https://testing.example.com/api
TEST_API_KEY=<secreto>
```

`GET /api/info` indica en qué entorno estás y qué capacidades están activas (`testingApi`, `globalReset`, `faultInjection`, `rateLimiting`...). Es útil como *guard* al arrancar una suite:

```bash
curl -s $API_BASE_URL/info
```

## 2. Datos de referencia (seed determinista)

El seed genera **siempre el mismo dataset**. Tras un reset global (`POST /api/test/reset` o `npm run db:reset`) los IDs también son idénticos. Las fechas son **relativas** al momento del seed (ej. un cupón caducado siempre caducó "ayer").

### Usuarios

| Email | Contraseña | Rol | Estado / datos |
|---|---|---|---|
| `admin@qacommerce.test` | `Admin123!` | ADMIN | Administrador de la tienda |
| `customer@qacommerce.test` | `Customer123!` | CUSTOMER | Usuario estándar: 1 dirección, sin pedidos |
| `noorders@qacommerce.test` | `Customer123!` | CUSTOMER | Sin pedidos, sin direcciones, sin favoritos |
| `orders@qacommerce.test` | `Customer123!` | CUSTOMER | 9 pedidos, uno por estado (`QCL-SEED-0001` … `0009`), ya usó `BIENVENIDA10` |
| `favorites@qacommerce.test` | `Customer123!` | CUSTOMER | 6 favoritos (incluye uno agotado y uno descatalogado) |
| `addresses@qacommerce.test` | `Customer123!` | CUSTOMER | 4 direcciones (la predeterminada es "Trabajo") |
| `disabled@qacommerce.test` | `Customer123!` | CUSTOMER | **Desactivado**: login → `403 ACCOUNT_DISABLED` |
| `reviewer01…12@qacommerce.test` | `Customer123!` | CUSTOMER | Autores de las ~500 reseñas de ejemplo |

Pedidos de `orders@qacommerce.test`:

| Nº | Estado | Notas |
|---|---|---|
| QCL-SEED-0001 | DELIVERED | Entregado hace ~43 días → **fuera** del plazo de devolución; usó `BIENVENIDA10` |
| QCL-SEED-0002 | DELIVERED | Entregado hace ~4 días → **dentro** del plazo de devolución |
| QCL-SEED-0003 | SHIPPED | Envío exprés, con número de seguimiento |
| QCL-SEED-0004 | PREPARING | |
| QCL-SEED-0005 | PAID | Cancelable por el cliente |
| QCL-SEED-0006 | PENDING | Transferencia pendiente (el admin puede confirmar el pago) |
| QCL-SEED-0007 | CANCELLED | Reembolsado |
| QCL-SEED-0008 | RETURN_REQUESTED | |
| QCL-SEED-0009 | RETURNED | Reembolsado |

> ⚠️ Los usuarios de referencia son **compartidos**. Úsalos para pruebas de solo lectura o en entornos dedicados. Para pruebas que modifican estado, crea tus propios datos (secciones 3-5).

### Catálogo

- 16 categorías (2 niveles: *Componentes de PC* y *Periféricos* agrupan subcategorías), 39 marcas reales, **168 productos** (164 activos) con nombres de modelos reales. Precios, stock, valoraciones, reseñas e imágenes son ficticios (las imágenes son ilustraciones SVG genéricas generadas por la API).
- IDs por categoría: Portátiles 1-12 · Sobremesa 13-24 · Gráficas 25-36 · Procesadores 37-48 · Placas 49-60 · RAM 61-72 · SSD 73-84 · Monitores 85-96 · Teclados 97-108 · Ratones 109-120 · Auriculares 121-132 · Smartphones 133-144 · Tablets 145-156 · Accesorios 157-168.
- SKU: `QCL-<CAT>-<NNN>` (ej. `QCL-LAP-001` = id 1 = *Apple MacBook Air 13" M3 16 GB 256 GB*, slug `apple-macbook-air-13-m3-16-gb-256-gb`).
- Usa siempre el **SKU o el id** como identificador en las pruebas: los nombres de producto pueden revisarse en futuras versiones del seed.

Productos con inventario especial (documentado y estable):

| Situación | SKU (id) · producto |
|---|---|
| Agotados (stock 0) | QCL-GPU-003 (27) *Gigabyte GeForce RTX 4070 Super Windforce OC 12 GB* · QCL-LAP-006 (6) *Lenovo IdeaPad Slim 5 14AHP9 Ryzen 7* · QCL-CPU-010 (46) *AMD Ryzen 7 9800X3D* · QCL-MON-007 (91) *Samsung Odyssey Neo G8 32"* · QCL-PHN-010 (142) *Samsung Galaxy Z Fold6 512 GB* · QCL-TAB-006 (150) *Samsung Galaxy Tab S10 Ultra 256 GB* · QCL-AUD-008 (128) *SteelSeries Arctis Nova Pro Wireless* · QCL-KBD-010 (106) *Keychron Q1 Pro* |
| Una sola unidad | QCL-GPU-006 (30) *ASUS ROG Astral GeForce RTX 5090 OC 32 GB* · QCL-LAP-004 (4) *ASUS Zenbook 14 OLED UX3405MA* · QCL-SSD-007 (79) *Crucial T705 2 TB* · QCL-PHN-003 (135) *Apple iPhone 16 Pro Max 512 GB* |
| Stock bajo (2-5) | QCL-GPU-005 (29) *MSI GeForce RTX 5080 Gaming Trio OC* · QCL-CPU-005 (41) *Intel Core Ultra 9 285K* · QCL-MON-003 (87) *LG UltraGear 27GS95QE* · QCL-DSK-003 (15) *Apple Mac Studio M4 Max* · QCL-TAB-012 (156) · QCL-MBD-001 (49) · QCL-RAM-008 (68) · QCL-AUD-002 (122) |
| Descatalogados (`isActive=false`) | QCL-DSK-010 (22) *Lenovo IdeaCentre AIO 3 27* · QCL-RAM-004 (64) *Kingston FURY Beast DDR4 8 GB* · QCL-MOU-001 (109) *Logitech M90* · QCL-PHN-005 (137) *Samsung Galaxy A16 128 GB* |

`GET /api/test/info` devuelve esta misma información en JSON.

### Cupones

| Código | Regla | Resultado esperado |
|---|---|---|
| `BIENVENIDA10` | 10%, pedido mínimo 50 €, 1 uso por cliente | Válido |
| `ENVIOGRATIS` | Envío gratis, 5 usos por cliente | Válido |
| `DESCUENTO20` | 20 € de descuento, mínimo 150 € | `COUPON_MIN_SUBTOTAL_NOT_REACHED` por debajo del mínimo |
| `COMPONENTES15` | 15% solo en *Componentes de PC* (máx. 100 €) | `COUPON_NOT_APPLICABLE` sin componentes en el carrito |
| `AURICULARES5` | 5 € en auriculares, mínimo 30 € | Restringido a categoría |
| `CADUCADO` | Caducó ayer | `COUPON_EXPIRED` |
| `PROXIMAMENTE` | Empieza dentro de 30 días | `COUPON_NOT_STARTED` |
| `AGOTADO` | Límite global alcanzado (100/100) | `COUPON_USAGE_LIMIT_REACHED` |
| `INACTIVO` | Desactivado | `COUPON_INACTIVE` |
| `NOEXISTE` (cualquiera) | — | `COUPON_INVALID` |

Los cupones requieren sesión (`COUPON_REQUIRES_LOGIN` para invitados).

### Envíos

| Código | Precio | Gratis desde | Plazo |
|---|---|---|---|
| `STANDARD` | 4,99 € | 99 € (tras descuento) | 2-4 días |
| `EXPRESS` | 12,99 € | nunca | 24 h |
| `PICKUP` | 1,99 € | 49 € | 3-5 días, requiere `pickupPointId` |

## 3. API de testing

Base: `${API_BASE_URL}/test` · Cabecera obligatoria: `X-Test-Api-Key: <clave>` · Documentada en Swagger bajo la etiqueta **Testing**.

| Método | Ruta | Uso |
|---|---|---|
| GET | `/test/info` | Capacidades, usuarios de referencia, tarjetas de prueba, inventario especial y escenarios |
| POST | `/test/reset` | **Reset global** (borra todo y recarga el seed). Body `{ "confirm": "RESET" }`. Solo si `ALLOW_GLOBAL_RESET=true` |
| POST | `/test/seed` | Restaura los **datos de referencia** a su estado inicial sin borrar datos de ejecuciones |
| GET | `/test/runs/{runId}` | Resumen de lo creado por una ejecución |
| DELETE | `/test/runs/{runId}` | Limpia una ejecución (ver sección 6) |
| POST | `/test/users` | Crea un usuario (con dirección y tokens opcionales; rol/estado configurables) |
| POST | `/test/auth/token` | Emite tokens para un usuario sin contraseña (TTL configurable) |
| POST | `/test/sessions/expire` | Caduca (`expire`) o revoca (`revoke`) todas las sesiones de un usuario |
| POST | `/test/password-reset-token` | Genera y **devuelve** un token de recuperación de contraseña |
| POST | `/test/products` | Crea un producto (precio, stock, oferta, estado...) |
| PATCH | `/test/products/{id}` | Fija stock, precio, precio anterior o estado de **cualquier** producto |
| POST | `/test/carts` | Prepara el carrito de un usuario (`force: true` permite incidencias) |
| POST | `/test/orders` | Crea un pedido directamente en un estado (`PENDING`…`RETURNED`) |
| POST | `/test/orders/{id}/expire-reservation` | Caduca la reserva de un pedido pendiente y ejecuta el job |
| POST | `/test/coupons` | Crea cupones (válidos, caducados, futuros, agotados...) |
| POST | `/test/payments/{id}/resolve` | Resuelve ya un pago pendiente (`APPROVED`/`DECLINED`) |
| POST | `/test/jobs/{name}/run` | Ejecuta un job: `resolve-pending-payments`, `expire-reservations` |
| GET/POST | `/test/scenarios`, `/test/scenarios/{name}` | Lista / prepara escenarios (sección 4) |
| GET | `/test/emails`, `/test/emails/latest` | Buzón simulado (filtros `to`, `runId`, `template`) |
| DELETE | `/test/emails` | Vacía el buzón (por `to` o `runId`) |
| GET/POST/DELETE | `/test/faults`, `/test/faults/{id}` | Reglas de simulación de fallos (sección 7) |
| GET | `/test/audit` | Registro de operaciones de la API de testing |

Ejemplos:

```bash
KEY="X-Test-Api-Key: local-test-api-key"
API=http://localhost:3001/api

# Usuario propio con dirección y tokens (access token de 5 s para probar la renovación)
curl -s -X POST $API/test/users -H "$KEY" -H 'Content-Type: application/json' \
  -d '{"runId":"run-42","accessTtlSeconds":5}'

# Producto con una única unidad
curl -s -X POST $API/test/products -H "$KEY" -H 'Content-Type: application/json' \
  -d '{"runId":"run-42","stock":1,"priceCents":19999,"name":"Última unidad"}'

# Pedido enviado hace 20 días (entregado y fuera de plazo de devolución si status=DELIVERED)
curl -s -X POST $API/test/orders -H "$KEY" -H 'Content-Type: application/json' \
  -d '{"runId":"run-42","email":"<email>","items":[{"sku":"QCL-ACC-001","quantity":1}],"status":"DELIVERED","daysAgo":20}'
```

Todas las respuestas de creación devuelven el `runId` usado (si no lo envías se genera uno `auto-xxxx`).

## 4. Escenarios preparados

`POST /api/test/scenarios/{name}` con body `{ "runId": "..." }` crea **datos nuevos y aislados** en cada llamada (puedes invocar el mismo escenario desde varios workers a la vez). La respuesta incluye credenciales, tokens, IDs y lo necesario para continuar.

| Escenario | Descripción |
|---|---|
| `user-with-cart` | Usuario con dirección y un carrito con 3 productos en stock |
| `checkout-ready` | Usuario con dirección y carrito listo para pagar; incluye las tarjetas de prueba |
| `payment-declined` | Usuario con carrito listo y la tarjeta de prueba que provoca un pago rechazado |
| `order-with-failed-payment` | Pedido PENDING con un intento de pago rechazado (reintento de pago) |
| `out-of-stock-product` | Producto activo sin stock |
| `last-unit-product` | Producto con una única unidad disponible |
| `discontinued-product` | Producto desactivado (descatalogado) |
| `concurrent-last-unit` | Producto con 1 unidad en el carrito de dos usuarios distintos (concurrencia en el checkout) |
| `cart-with-issues` | Carrito con un producto agotado, uno descatalogado, una cantidad superior al stock y un cambio de precio |
| `pending-order` · `paid-order` · `preparing-order` · `shipped-order` · `delivered-order` · `cancelled-order` · `return-requested-order` · `returned-order` | Usuario con un pedido en ese estado |
| `bank-transfer-pending-order` | Pedido PENDING por transferencia (el admin puede confirmar el pago) |
| `delivered-order-return-expired` | Pedido entregado hace 30 días (fuera del plazo de devolución) |
| `user-with-order-history` | Usuario con 5 pedidos en distintos estados |
| `expired-coupon` | Cupón caducado y usuario con carrito para intentar aplicarlo |
| `coupon-already-used` | Usuario que ya utilizó un cupón de un solo uso y tiene un carrito nuevo |
| `disabled-user` | Usuario desactivado (login → 403 `ACCOUNT_DISABLED`) |
| `admin-user` | Administrador propio de la ejecución (no compartido) |
| `password-reset` | Usuario con un token de recuperación válido (y el enlace) |
| `expired-session` | Usuario cuyos tokens pertenecen a una sesión caducada (401 `SESSION_EXPIRED`) |
| `short-lived-token` | Usuario con un access token que caduca en 5 segundos |

```bash
curl -s -X POST $API/test/scenarios/checkout-ready -H "$KEY" -H 'Content-Type: application/json' -d '{"runId":"run-42"}'
```

## 5. Aislamiento y ejecución en paralelo

La estrategia se basa en un **identificador de ejecución** (`runId`, 3-64 caracteres `[A-Za-z0-9._-]`, ej. `gh-1234-worker-3`).

1. **Etiquetado**: todo lo que creas con la API de testing queda etiquetado con el `runId`. Además, si envías la cabecera `X-Test-Run-Id: <runId>` (solo se respeta en `local`/`testing`), también se etiquetan los usuarios que se registran por la UI/API, sus pedidos y los productos/cupones que crea un admin.
2. **Visibilidad del catálogo**: los productos creados por una ejecución **solo aparecen en listados, búsqueda, home y sugerencias** para peticiones que envían su mismo `X-Test-Run-Id`. Así otras suites siguen viendo exactamente el catálogo de referencia (los conteos y órdenes no cambian). El acceso directo por id/slug, el carrito y el checkout funcionan siempre.
3. **Fallos simulados** acotados por `runId` o por usuario (sección 7).
4. **Limpieza por ejecución**: `DELETE /api/test/runs/{runId}`.

Cómo enviar la cabecera desde la UI:

- Playwright: `browser.newContext({ extraHTTPHeaders: { 'X-Test-Run-Id': runId } })`.
- Cualquier herramienta: el storefront lee `localStorage['qcl.testRunId']` y añade la cabecera a todas sus llamadas a la API (gancho pensado para automatización; inocuo fuera de testing).
- Cypress: `cy.intercept('/api/**', (req) => { req.headers['x-test-run-id'] = runId })` o `localStorage` en `onBeforeLoad`.

Recomendaciones para paralelizar:

- Cada worker/test crea **sus propios** usuarios, productos y cupones (o usa escenarios) con un `runId` por ejecución o por worker.
- Trata los datos de referencia como **solo lectura** cuando ejecutes en paralelo.
- Si incluyes el `runId` en el email de los usuarios que registras por la UI (`ana+<runId>@example.com`), la limpieza también los encuentra aunque no envíes la cabecera.
- No uses el reset global en entornos compartidos.

**Limitaciones conocidas**: el aislamiento es lógico (misma base de datos), no físico. Los datos de referencia (stock de productos de referencia, cupones globales) son compartidos: una suite que compra un producto de referencia reduce su stock para las demás hasta que se limpia su ejecución o se restaura el seed. Las reglas de fallos viven en memoria del proceso: el entorno de testing debe ejecutar **una sola réplica** de la API.

## 6. Reset, restauración y limpieza

| Operación | Alcance | Seguro con suites concurrentes |
|---|---|---|
| `DELETE /api/test/runs/{runId}` | Usuarios, pedidos, productos, cupones, emails y faults de la ejecución. **Revierte** los efectos sobre datos compartidos: stock y ventas de productos de referencia, usos de cupones, valoraciones | ✅ Sí |
| `POST /api/test/seed` | Restaura los datos de referencia (productos, cupones, usuarios de referencia y sus pedidos/direcciones/favoritos) sin tocar las ejecuciones | ⚠️ Afecta a quien use datos de referencia |
| `POST /api/test/reset` | `TRUNCATE` de todo + seed. IDs deterministas | ❌ No (solo entornos dedicados; `ALLOW_GLOBAL_RESET`) |

Patrón típico (global setup / teardown):

```bash
# setup
curl -s $API/info | grep -q '"testingApi":true'
# teardown
curl -s -X DELETE $API/test/runs/$RUN_ID -H "$KEY"
```

Desde la línea de comandos (local): `npm run db:reset` (reset completo) o `npm run db:seed` (restaurar referencia). En Docker: `docker compose exec api node dist/prisma/seed.js --reset`.

## 7. Simulación controlada de fallos

`POST /api/test/faults` registra una regla **acotada** y **temporal**. Nunca hay errores aleatorios en el funcionamiento normal.

```json
{
  "runId": "run-42",
  "method": "POST",
  "path": "/api/orders",
  "action": "error",
  "status": 503,
  "times": 1,
  "ttlSeconds": 300
}
```

| Campo | Significado |
|---|---|
| `runId` / `userId` / `global` | Ámbito: peticiones con esa cabecera `X-Test-Run-Id`, peticiones autenticadas como ese usuario o todas (solo con `ALLOW_GLOBAL_FAULTS=true`) |
| `method`, `path` | Ruta exacta o patrón: `*` = un segmento, `**` = cualquier cosa (ej. `/api/orders/*/payments`, `/api/products/**`) |
| `action` | `error` (responde `status`, por defecto 500), `delay` (añade `delayMs` y continúa), `timeout` (espera `delayMs`, por defecto 30 s, y responde 504) |
| `code`, `message` | Personalizan el cuerpo de error (por defecto `FAULT_INJECTED`) |
| `times` | Nº de peticiones afectadas (1 = fallo transitorio que se recupera al reintentar) |
| `ttlSeconds` | Caducidad de la regla (por defecto 600, máximo 3600) |

Las respuestas afectadas llevan la cabecera `X-Fault-Injected: <id>`. Las rutas `/api/test/*` y `/api/health*` nunca se ven afectadas. Ejemplos de uso: 500/503 en el listado de productos (estados de error de la UI), latencia de 3 s en `/api/cart` (skeletons y spinners), timeout en `/api/checkout/quote`, error 409 personalizado...

Otros mecanismos deterministas: tarjetas de prueba (sección 8), sesiones caducadas (sección 9), `expire-reservation`, inventario con `PATCH /test/products/{id}`.

## 8. Pagos simulados

Solo se aceptan estas tarjetas (cualquier titular, fecha futura `MM/AA` y CVC de 3 dígitos). Una tarjeta real con Luhn válido devuelve `422 CARD_NOT_ALLOWED`.

| Número | Resultado |
|---|---|
| 4242 4242 4242 4242 | Aprobado |
| 5555 5555 5555 4444 | Aprobado (Mastercard) |
| 4000 0000 0000 0002 | Rechazado (`card_declined`) |
| 4000 0000 0000 9995 | Fondos insuficientes (`insufficient_funds`) |
| 4000 0000 0000 0069 | Tarjeta caducada según el emisor (`expired_card`) |
| 4000 0000 0000 0077 | Pendiente → **aprobado** tras `PAYMENT_PENDING_DELAY_MS` (15 s por defecto) |
| 4000 0000 0000 0085 | Pendiente → **rechazado** tras `PAYMENT_PENDING_DELAY_MS` |
| 4000 0000 0000 0119 | Error de procesamiento: **HTTP 502** `PAYMENT_PROCESSING_ERROR` (el pedido se crea) |
| 4000 0000 0000 0408 | Timeout de la pasarela: espera `PAYMENT_TIMEOUT_DELAY_MS` (8 s) y responde **HTTP 504** `PAYMENT_GATEWAY_TIMEOUT` |

Comportamiento clave para pruebas avanzadas:

- Un pago **rechazado no es un error HTTP**: `POST /api/orders` → `201` con `order.paymentStatus = FAILED`; el pedido queda `PENDING`, reservado `ORDER_RESERVATION_MINUTES` (30) y se puede reintentar (`POST /api/orders/{id}/payments`).
- En 502/504 el pedido **ya existe** (`details.orderId`). Repetir la petición con la misma `Idempotency-Key` devuelve el pedido original (`200`, cabecera `Idempotent-Replayed: true`) en lugar de duplicarlo.
- Los pagos pendientes se resuelven con un job cada `JOBS_INTERVAL_MS`; puedes forzarlo con `POST /api/test/payments/{id}/resolve` o `POST /api/test/jobs/resolve-pending-payments/run`.
- Si la reserva caduca sin pago, el pedido se cancela automáticamente y el stock se libera (`POST /api/test/orders/{id}/expire-reservation` lo fuerza).
- La transferencia bancaria deja el pedido `PENDING`/`AWAITING_PAYMENT` 72 h hasta que un admin la confirma.

## 9. Emails, sesiones y tokens

**Buzón simulado**: todos los emails (bienvenida, recuperación de contraseña, confirmaciones y cambios de estado de pedidos) se guardan en base de datos.

```bash
curl -s "$API/test/emails/latest?to=ana@example.com&template=password-reset" -H "$KEY"
# metadata.token y metadata.link contienen el token de recuperación
```

Plantillas: `welcome`, `password-reset`, `password-changed`, `order-paid`, `bank-transfer-instructions`, `order-shipped`, `order-delivered`, `order-cancelled`, `return-requested`, `order-returned`. En local puedes verlos en Mailpit (`docker compose --profile mail up` con `SMTP_HOST=mailpit`, UI en http://localhost:8025).

**Sesiones y tokens**:

- Access token JWT (HS256) de `ACCESS_TOKEN_TTL_SECONDS` (900 s). Refresh token de sesión de `REFRESH_TOKEN_TTL_DAYS` (7 días), en el cuerpo y en la cookie httpOnly `qcl_rt` (path `/api/auth`).
- Cada petición autenticada valida la sesión en BD: logout, cambio/restablecimiento de contraseña y desactivación del usuario invalidan los tokens **inmediatamente**.
- Códigos 401 diferenciados: `UNAUTHENTICATED`, `TOKEN_INVALID`, `TOKEN_EXPIRED`, `SESSION_REVOKED`, `SESSION_EXPIRED`, `REFRESH_TOKEN_INVALID`.
- Para pruebas de caducidad: `POST /test/users {"accessTtlSeconds": 5}`, `POST /test/auth/token {"accessTtlSeconds": 3}`, `POST /test/sessions/expire {"email": "...", "mode": "expire"}` o el escenario `expired-session`.
- No hay bloqueo de cuentas, CAPTCHA, verificación de email ni rate limiting en `local`/`testing`.

## 10. Selectores y accesibilidad

Prioriza, por este orden:

1. **Roles y nombres accesibles** (`getByRole('button', { name: 'Iniciar sesión' })`): HTML semántico, `aria-label` en botones de icono, `aria-current`, `aria-pressed`, `aria-invalid`, `role="alert"` en errores.
2. **Labels** (`getByLabel('Email', { exact: true })`): todos los campos tienen `<label for>`; el asterisco de obligatorio está **fuera** del label para que el nombre accesible sea exacto.
3. **`data-testid` estables** en componentes clave (nunca aleatorios).

`data-testid` disponibles (selección):

| Zona | data-testid |
|---|---|
| Cabecera | `logo`, `search-input`, `search-submit`, `search-suggestions`, `search-suggestion`, `cart-link`, `cart-count`, `login-link`, `account-menu-trigger`, `account-menu`, `logout-button`, `admin-link`, `categories-menu-trigger`, `mobile-menu-trigger` |
| Catálogo | `catalog-title`, `results-count`, `sort-select`, `filters`, `filter-brand-<slug>`, `filter-price-min/max/apply`, `filter-in-stock`, `filter-on-sale`, `filter-rating-<n>`, `active-filters`, `clear-filters`, `product-grid`, `pagination`, `no-results` |
| Tarjeta de producto | `product-card` (+ `data-product-id`, `data-sku`), `product-card-link`, `add-to-cart`, `favorite-toggle`, `discount-badge`, `price`, `compare-at-price`, `availability` (+ `data-availability`) |
| Ficha | `product-detail`, `product-name`, `product-sku`, `product-quantity(-increase/-decrease/-value)`, `product-add-to-cart`, `product-specs`, `reviews`, `review-form`, `review-item`, `write-review` |
| Carrito | `cart-items`, `cart-item` (+ `data-sku`), `cart-item-quantity`, `cart-item-remove`, `cart-item-issue` (+ `data-issue`), `price-changed`, `coupon-input`, `apply-coupon`, `coupon-error`, `applied-coupon`, `summary-subtotal/discount/shipping/total`, `checkout-button`, `cart-empty` |
| Checkout | `checkout-step-<n>`, `address-option`, `shipping-<CODE>`, `pickup-point-select`, `payment-method-<METHOD>`, `card-number/holder/expiry/cvc`, `checkout-next`, `place-order`, `checkout-total`, `checkout-error` |
| Resultado / pedidos | `order-result` (+ `data-order-status`, `data-payment-status`), `order-result-title`, `order-number`, `retry-payment`, `order-row`, `order-detail`, `order-status`, `payment-status`, `cancel-order`, `request-return`, `confirm-dialog-confirm` |
| Admin | `admin-nav-*`, `kpis`, `admin-products-table`, `admin-product-row`, `product-form`, `product-save`, `stock-delta`, `stock-adjust`, `admin-order-row`, `admin-status-select`, `admin-status-submit`, `confirm-payment`, `admin-user-row`, `toggle-user-status`, `admin-coupon-row`, `coupon-form` |

Comportamientos asíncronos reales que conviene esperar correctamente: sugerencias de búsqueda (debounce 250 ms), toasts (4 s), skeletons de carga, polling del resultado del pago (cada 3 s mientras `PROCESSING`), renovación silenciosa del token.

## 11. Login programático y estado de sesión

La SPA guarda el access token **solo en memoria** y restaura la sesión al cargar mediante la cookie httpOnly `qcl_rt` (`POST /api/auth/refresh`) si `localStorage['qcl.hasSession'] === '1'`. Para saltarte el formulario de login:

- **Playwright**: haz `page.request.post('/api/auth/login', { data })` (comparte cookies con el contexto), escribe `localStorage.setItem('qcl.hasSession','1')` y navega; o guarda `storageState` tras un login y reutilízalo.
- **Cypress**: `cy.request('POST', '/api/auth/login', body)` establece la cookie; añade `qcl.hasSession` en `localStorage` antes de visitar.
- **Selenium/WebdriverIO**: obtén el refresh token por API y crea la cookie `qcl_rt` (path `/api/auth`) en el dominio de la tienda.
- **API (Postman, REST Assured...)**: usa `Authorization: Bearer <accessToken>`; renueva con `POST /api/auth/refresh` y `{ "refreshToken": "..." }`.

Carrito de invitado: el token del carrito se guarda en `localStorage['qcl.cartToken']` y se envía como `X-Cart-Token`; tras el login la SPA lo fusiona con `POST /api/cart/merge`.

## 12. Ejecutar pruebas desde GitHub Actions

Tu repositorio `qa-commerce-automation` solo necesita la URL del entorno de testing y la clave de la API de testing como secretos. Ejemplo orientativo de configuración (no forma parte de este repositorio):

```yaml
env:
  BASE_URL: ${{ vars.BASE_URL }}            # https://testing.example.com
  API_BASE_URL: ${{ vars.API_BASE_URL }}    # https://testing.example.com/api
  TEST_API_KEY: ${{ secrets.TEST_API_KEY }}
  RUN_ID: gh-${{ github.run_id }}-${{ github.run_attempt }}
```

Antes de la suite: comprobar `GET /api/health/ready` y `GET /api/info`. Después (incluso si falla, `if: always()`): `DELETE /api/test/runs/$RUN_ID`. Para shards/workers en paralelo, añade el índice del shard al `runId`.

Cuenta con la latencia de Internet: usa *timeouts* algo mayores que en local y evita esperas fijas.

## 13. Qué NO hace la plataforma (a propósito)

- No hay niveles de dificultad, modos de entrenamiento ni selectores aleatorios.
- No hay errores aleatorios: todo fallo es consecuencia de reglas de negocio o de una simulación explícita.
- No hay CAPTCHA, bloqueo por intentos fallidos ni verificación de email.
- No incluye framework de automatización, Page Objects ni fixtures de tus pruebas: eso pertenece a tu repositorio de automatización.
