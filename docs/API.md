# API documentation

The REST API is the **same one** the storefront uses: there are no decorative endpoints. The complete, always up-to-date reference is the OpenAPI specification generated from the code:

| Resource | Local | Remote |
|---|---|---|
| Swagger UI | http://localhost:3001/api/docs | `https://<domain>/api/docs` |
| OpenAPI JSON | http://localhost:3001/api/docs-json | `https://<domain>/api/docs-json` |
| OpenAPI YAML | http://localhost:3001/api/docs-yaml | `https://<domain>/api/docs-yaml` |

In Swagger UI click **Authorize** and paste the `accessToken` returned by `POST /api/auth/login` (`access-token` scheme). In testing environments the `test-api-key` scheme also appears for the **Testing** tag.

## Conventions

- Prefix: `/api`. JSON in requests and responses (`Content-Type: application/json`).
- **Amounts**: integers in **euro cents**, VAT included (`priceCents: 79899` = €798.99).
- **Dates**: ISO 8601 in UTC.
- **IDs**: auto-increment integers for domain entities (deterministic after a reset); UUIDs for sessions and guest cart tokens.
- **Pagination**: `page` (from 1) and `pageSize` parameters; response `{ data: [...], meta: { page, pageSize, total, totalPages, hasNextPage, hasPreviousPage } }`. Ordering always includes an `id` tie-breaker, so pagination is stable.
- **Validation**: unknown fields are rejected (`property x should not exist`), strings are trimmed and each field returns **a single** error message.
- **Correlation**: every response includes `X-Request-Id` (the one you send is honoured).
- **Language**: messages are in English.

## Authentication

| Step | Request |
|---|---|
| Registration | `POST /api/auth/register` → `201` with tokens (no e-mail verification) |
| Login | `POST /api/auth/login` → `200 { accessToken, refreshToken, tokenType, expiresIn, refreshTokenExpiresAt, user }` |
| Use | Header `Authorization: Bearer <accessToken>` |
| Refresh | `POST /api/auth/refresh` with `{ "refreshToken": "..." }` or the `qcl_rt` cookie |
| Logout | `POST /api/auth/logout` (revokes the session of the token or of the refresh token) → `204` |

Roles: **guest** (no token), **CUSTOMER** and **ADMIN**. The `/api/admin/*` routes require ADMIN (`403 FORBIDDEN` for customers). Accessing another user's resources (orders, addresses) returns `404` so their existence is not revealed; modifying another user's review returns `403 NOT_RESOURCE_OWNER`.

## Special headers

| Header | Direction | Use |
|---|---|---|
| `Authorization: Bearer` | → | Access token |
| `X-Cart-Token` | → | Guest cart (UUID returned as `token` by `POST /api/cart/items`) |
| `Idempotency-Key` | → | `POST /api/orders` and `POST /api/orders/{id}/payments` (8-100 characters `[A-Za-z0-9_.:-]`) |
| `Idempotent-Replayed: true` | ← | The response is the replay of a previous idempotent request (`200`) |
| `X-Test-Run-Id` | → | Tagging/isolation of automation data (`local`/`testing` only) |
| `X-Test-Api-Key` | → | Testing API key |
| `X-Request-Id` | ↔ | Correlation with the logs |
| `X-Fault-Injected` | ← | The response was altered by a fault simulation rule |

## Error format

Every error response uses the same schema (`ErrorResponseDto`):

```json
{
  "statusCode": 409,
  "error": "Conflict",
  "code": "INSUFFICIENT_STOCK",
  "message": "Only 2 units left",
  "details": { "availableStock": 2, "requested": 3 },
  "path": "/api/cart/items",
  "method": "POST",
  "timestamp": "2026-11-14T18:00:00.000Z",
  "requestId": "6f1c..."
}
```

Validation errors (`400 VALIDATION_ERROR`): `details` is a list `[{ "field": "email", "message": "The e-mail format is not valid" }]` (nested fields use dots: `card.cvc`).

**Assert on `statusCode` and `code`**, not on `message` (human-readable text meant for the end user that may be reworded).

## HTTP status codes

| Code | When |
|---|---|
| 200 | Successful query or action (including idempotent replays) |
| 201 | Resource created (registration, order, address, review, favorite, payment...) |
| 202 | Request accepted (`forgot-password`, always, so accounts are not revealed) |
| 204 | Action without a body (logout, delete address/favorite/review, password reset) |
| 400 | Invalid data, malformed JSON (`INVALID_JSON`), invalid/expired/used reset token |
| 401 | Not authenticated or invalid token/session (distinct codes) |
| 403 | No permission, disabled account, not the owner, testing operation not allowed in the environment |
| 404 | Resource that does not exist or belongs to someone else; unknown route (`ROUTE_NOT_FOUND`) |
| 409 | State conflict: insufficient stock, duplicates, status transition not allowed, price changed, payment in progress |
| 413 | Body too large (256 KB limit) |
| 422 | Business rule not met: coupons, empty cart or cart with issues, invalid card, limits |
| 429 | Only when rate limiting is enabled (public demo) |
| 500 | Unexpected (or simulated) error |
| 502 / 504 | Error / timeout of the simulated payment gateway (the order already exists) |
| 503 | Database unavailable (or simulated failure) |

## Error catalog (`code`)

| Area | Codes |
|---|---|
| Generic | `VALIDATION_ERROR`, `INVALID_JSON`, `PAYLOAD_TOO_LARGE`, `NOT_FOUND`, `ROUTE_NOT_FOUND`, `CONFLICT`, `RATE_LIMITED`, `INTERNAL_ERROR`, `SERVICE_UNAVAILABLE`, `FAULT_INJECTED`, `GATEWAY_TIMEOUT` |
| Authentication | `UNAUTHENTICATED`, `TOKEN_INVALID`, `TOKEN_EXPIRED`, `SESSION_REVOKED`, `SESSION_EXPIRED`, `REFRESH_TOKEN_INVALID`, `INVALID_CREDENTIALS`, `ACCOUNT_DISABLED`, `FORBIDDEN`, `EMAIL_ALREADY_REGISTERED`, `CURRENT_PASSWORD_INCORRECT`, `PASSWORD_REUSED`, `RESET_TOKEN_INVALID`, `RESET_TOKEN_EXPIRED`, `RESET_TOKEN_USED` |
| Users | `USER_NOT_FOUND`, `ADDRESS_NOT_FOUND`, `ADDRESS_LIMIT_REACHED`, `CANNOT_MODIFY_OWN_ACCOUNT` |
| Catalog | `PRODUCT_NOT_FOUND`, `CATEGORY_NOT_FOUND`, `BRAND_NOT_FOUND`, `SKU_ALREADY_EXISTS`, `CATEGORY_NOT_ASSIGNABLE`, `INVALID_PRICE` |
| Cart | `CART_NOT_FOUND`, `CART_ITEM_NOT_FOUND`, `CART_EMPTY`, `CART_HAS_ISSUES`, `PRODUCT_UNAVAILABLE`, `OUT_OF_STOCK`, `INSUFFICIENT_STOCK`, `MAX_QUANTITY_EXCEEDED` |
| Coupons | `COUPON_INVALID`, `COUPON_INACTIVE`, `COUPON_EXPIRED`, `COUPON_NOT_STARTED`, `COUPON_USAGE_LIMIT_REACHED`, `COUPON_ALREADY_USED`, `COUPON_MIN_SUBTOTAL_NOT_REACHED`, `COUPON_NOT_APPLICABLE`, `COUPON_REQUIRES_LOGIN`, `COUPON_CODE_EXISTS` |
| Checkout and orders | `SHIPPING_METHOD_NOT_FOUND`, `PICKUP_POINT_REQUIRED`, `PICKUP_POINT_NOT_FOUND`, `PRICE_CHANGED`, `IDEMPOTENCY_KEY_REUSED`, `ORDER_NOT_FOUND`, `INVALID_STATUS_TRANSITION`, `ORDER_NOT_CANCELLABLE`, `ORDER_NOT_RETURNABLE`, `RETURN_WINDOW_EXPIRED`, `ORDER_NOT_PAYABLE`, `PAYMENT_IN_PROGRESS` |
| Payments | `CARD_INVALID`, `CARD_NOT_ALLOWED`, `CARD_EXPIRED`, `CARD_DETAILS_REQUIRED`, `PAYMENT_PROCESSING_ERROR`, `PAYMENT_GATEWAY_TIMEOUT`, `PAYMENT_NOT_FOUND` |
| Favorites and reviews | `FAVORITE_ALREADY_EXISTS`, `FAVORITE_NOT_FOUND`, `REVIEW_ALREADY_EXISTS`, `REVIEW_NOT_FOUND`, `NOT_RESOURCE_OWNER` |
| Testing API | `TEST_API_KEY_INVALID`, `GLOBAL_RESET_DISABLED`, `SCENARIO_NOT_FOUND`, `FAULT_SCOPE_REQUIRED` |

## Endpoints

Generated from the OpenAPI specification. 🔒 = accepts or requires `Authorization: Bearer` (on `/api/cart/*` it is optional: without a token the guest cart is used; on `/api/auth/refresh` it is the `qcl_rt` cookie).

### Admin

| Method | Route | Description | Token |
|---|---|---|---|
| GET | `/api/admin/dashboard` | Administration dashboard metrics | 🔒 |
| GET | `/api/admin/products` | List products (including deactivated ones) | 🔒 |
| POST | `/api/admin/products` | Create a product | 🔒 |
| GET | `/api/admin/products/{id}` | Product detail | 🔒 |
| PATCH | `/api/admin/products/{id}` | Update a product | 🔒 |
| POST | `/api/admin/products/{id}/stock-adjustments` | Atomic stock adjustment (+/-) | 🔒 |
| GET | `/api/admin/orders` | List orders (filters by status, payment, search and dates) | 🔒 |
| GET | `/api/admin/orders/{id}` | Order detail with allowed transitions | 🔒 |
| PATCH | `/api/admin/orders/{id}/status` | Change the order status | 🔒 |
| POST | `/api/admin/orders/{id}/confirm-payment` | Confirm receipt of a bank transfer (order → PAID) | 🔒 |
| GET | `/api/admin/users` | List users | 🔒 |
| GET | `/api/admin/users/{id}` | Administrative user detail | 🔒 |
| PATCH | `/api/admin/users/{id}` | Change the status (enable/disable) or role of a user | 🔒 |
| GET | `/api/admin/coupons` | List coupons | 🔒 |
| POST | `/api/admin/coupons` | Create a coupon | 🔒 |
| GET | `/api/admin/coupons/{id}` | Coupon detail | 🔒 |
| PATCH | `/api/admin/coupons/{id}` | Update a coupon (isActive=false deactivates it) | 🔒 |

### Auth

| Method | Route | Description | Token |
|---|---|---|---|
| POST | `/api/auth/register` | Register a new user |  |
| POST | `/api/auth/login` | Sign in |  |
| POST | `/api/auth/refresh` | Refresh the access token | 🔒 |
| POST | `/api/auth/logout` | Sign out | 🔒 |
| POST | `/api/auth/forgot-password` | Request a password reset |  |
| GET | `/api/auth/reset-password/validate` | Check whether a password reset token is valid |  |
| POST | `/api/auth/reset-password` | Reset the password with the token received by e-mail |  |

### Cart

| Method | Route | Description | Token |
|---|---|---|---|
| GET | `/api/cart` | Get the cart | 🔒 |
| DELETE | `/api/cart` | Empty the cart (also removes the coupon) | 🔒 |
| POST | `/api/cart/items` | Add a product to the cart | 🔒 |
| PATCH | `/api/cart/items/{itemId}` | Change the quantity of a cart line | 🔒 |
| DELETE | `/api/cart/items/{itemId}` | Remove a cart line (returns the updated cart) | 🔒 |
| POST | `/api/cart/coupon` | Apply a coupon to the cart (requires sign-in) | 🔒 |
| DELETE | `/api/cart/coupon` | Remove the coupon from the cart | 🔒 |
| POST | `/api/cart/merge` | Merge a guest cart into the user cart | 🔒 |

### Catalog

| Method | Route | Description | Token |
|---|---|---|---|
| GET | `/api/home` | Home page content (banners, featured products, deals, new arrivals...) |  |
| GET | `/api/products` | List/search products |  |
| GET | `/api/products/suggestions` | Search suggestions (autocomplete) |  |
| GET | `/api/products/{idOrSlug}` | Product detail by id or slug |  |
| GET | `/api/products/{idOrSlug}/related` | Related products (same category, best sellers) |  |
| GET | `/api/categories` | Category tree with the number of active products |  |
| GET | `/api/categories/{slug}` | Category detail |  |
| GET | `/api/brands` | Brands (optionally filtered by category) |  |

### Checkout

| Method | Route | Description | Token |
|---|---|---|---|
| GET | `/api/shipping/methods` | Available shipping methods |  |
| GET | `/api/shipping/pickup-points` | Pickup points (filterable by city or postal code) |  |
| POST | `/api/checkout/quote` | Order quote | 🔒 |

### Favorites

| Method | Route | Description | Token |
|---|---|---|---|
| GET | `/api/favorites` | List the user favorites | 🔒 |
| POST | `/api/favorites` | Add a product to favorites | 🔒 |
| DELETE | `/api/favorites/{productId}` | Remove a product from favorites | 🔒 |

### Health

| Method | Route | Description | Token |
|---|---|---|---|
| GET | `/api/health` | Liveness: the process responds |  |
| GET | `/api/health/ready` | Readiness: the process and the database are available |  |
| GET | `/api/info` | Environment information |  |

### Orders

| Method | Route | Description | Token |
|---|---|---|---|
| POST | `/api/orders` | Create an order (checkout) and process the payment | 🔒 |
| GET | `/api/orders` | User order history (most recent first) | 🔒 |
| GET | `/api/orders/{idOrNumber}` | Detail of one of your orders (by id or order number) | 🔒 |
| POST | `/api/orders/{idOrNumber}/payments` | Retry the payment of a pending order | 🔒 |
| POST | `/api/orders/{idOrNumber}/cancel` | Cancel an order | 🔒 |
| POST | `/api/orders/{idOrNumber}/return` | Request a return | 🔒 |

### Reviews

| Method | Route | Description | Token |
|---|---|---|---|
| GET | `/api/products/{productId}/reviews` | Product reviews (paginated, with rating summary) |  |
| POST | `/api/products/{productId}/reviews` | Post a review | 🔒 |
| GET | `/api/users/me/reviews` | Reviews posted by the authenticated user | 🔒 |
| PATCH | `/api/reviews/{id}` | Edit your own review | 🔒 |
| DELETE | `/api/reviews/{id}` | Delete a review (author or administrator) | 🔒 |

### Testing

| Method | Route | Description | Token |
|---|---|---|---|
| GET | `/api/test/info` | Testing API capabilities and reference data | 🔒 |
| POST | `/api/test/reset` | GLOBAL reset: deletes ALL data and reloads the reference dataset | 🔒 |
| POST | `/api/test/seed` | Restore the reference data | 🔒 |
| GET | `/api/test/runs/{runId}` | Summary of the data created by a run | 🔒 |
| DELETE | `/api/test/runs/{runId}` | Clean up the data of a run | 🔒 |
| POST | `/api/test/users` | Create a test user (optionally with an address and tokens) | 🔒 |
| POST | `/api/test/auth/token` | Issue tokens for a user without a password (configurable TTL) | 🔒 |
| POST | `/api/test/sessions/expire` | Expire or revoke every session of a user | 🔒 |
| POST | `/api/test/password-reset-token` | Generate a password reset token and return it directly | 🔒 |
| POST | `/api/test/products` | Create a test product (only visible in listings for its runId) | 🔒 |
| PATCH | `/api/test/products/{id}` | Set the stock, price or status of any product | 🔒 |
| POST | `/api/test/carts` | Prepare a user cart (force: true allows carts with issues) | 🔒 |
| POST | `/api/test/orders` | Create an order directly in a given status | 🔒 |
| POST | `/api/test/orders/{id}/expire-reservation` | Expire the reservation of a pending order and run the expiry job | 🔒 |
| POST | `/api/test/coupons` | Create a test coupon (valid, expired, upcoming, exhausted...) | 🔒 |
| POST | `/api/test/payments/{id}/resolve` | Resolve a pending payment immediately (APPROVED/DECLINED) | 🔒 |
| POST | `/api/test/jobs/{name}/run` | Run a background job immediately | 🔒 |
| GET | `/api/test/scenarios` | List the prepared scenarios | 🔒 |
| POST | `/api/test/scenarios/{name}` | Prepare an isolated scenario (new data tagged with the runId) | 🔒 |
| GET | `/api/test/emails` | Read the simulated mailbox (most recent first) | 🔒 |
| DELETE | `/api/test/emails` | Empty the mailbox (filterable by recipient or runId) | 🔒 |
| GET | `/api/test/emails/latest` | Latest e-mail matching the filter (404 if none) | 🔒 |
| GET | `/api/test/faults` | List active fault simulation rules | 🔒 |
| POST | `/api/test/faults` | Register a fault rule (500/503, latency, timeout...) | 🔒 |
| DELETE | `/api/test/faults` | Delete the rules of a runId (or all of them when allowed) | 🔒 |
| DELETE | `/api/test/faults/{id}` | Delete a fault rule | 🔒 |
| GET | `/api/test/audit` | Testing API operation log | 🔒 |

### Users

| Method | Route | Description | Token |
|---|---|---|---|
| GET | `/api/users/me` | Get the authenticated user profile | 🔒 |
| PATCH | `/api/users/me` | Update personal details | 🔒 |
| POST | `/api/users/me/password` | Change the password | 🔒 |
| GET | `/api/users/me/sessions` | List active sessions | 🔒 |
| POST | `/api/users/me/sessions/revoke-others` | Sign out every session except the current one | 🔒 |
| DELETE | `/api/users/me/sessions/{sessionId}` | Sign out a specific session | 🔒 |
| GET | `/api/users/me/addresses` | List addresses (default first) | 🔒 |
| POST | `/api/users/me/addresses` | Create an address | 🔒 |
| GET | `/api/users/me/addresses/{id}` | Get an address | 🔒 |
| PATCH | `/api/users/me/addresses/{id}` | Update an address | 🔒 |
| DELETE | `/api/users/me/addresses/{id}` | Delete an address | 🔒 |
| POST | `/api/users/me/addresses/{id}/default` | Set an address as default | 🔒 |

## Examples

```bash
API=http://localhost:3001/api

# In-stock laptops from 2 brands, cheapest first
curl -s "$API/products?category=laptops&brand=asus,lenovo&inStock=true&sort=price_asc&page=1&pageSize=12"

# Login and token usage
TOKEN=$(curl -s -X POST $API/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"customer@qacommerce.test","password":"Customer123!"}' | jq -r .accessToken)
curl -s $API/users/me -H "Authorization: Bearer $TOKEN"

# Cart, coupon and quote
curl -s -X POST $API/cart/items -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"productId":1,"quantity":1}'
curl -s -X POST $API/cart/coupon -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"code":"WELCOME10"}'
ADDRESS=$(curl -s $API/users/me/addresses -H "Authorization: Bearer $TOKEN" | jq '.[0].id')
curl -s -X POST $API/checkout/quote -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"addressId\":$ADDRESS,\"shippingMethodCode\":\"STANDARD\"}"

# Idempotent order with a test card
curl -s -X POST $API/orders -H "Authorization: Bearer $TOKEN" -H 'Idempotency-Key: demo-order-0001' -H 'Content-Type: application/json' \
  -d "{\"addressId\":$ADDRESS,\"shippingMethodCode\":\"STANDARD\",\"paymentMethod\":\"CARD\",\"card\":{\"number\":\"4242424242424242\",\"holderName\":\"CARLOS PEREZ\",\"expMonth\":12,\"expYear\":2030,\"cvc\":\"123\"}}"
```

## Health checks

| Route | Use |
|---|---|
| `GET /api/health` | Liveness (the process responds) |
| `GET /api/health/ready` | Readiness: includes a database check (`503` if it does not respond) |
| `GET /api/info` | Environment, version, commit and enabled capabilities |
