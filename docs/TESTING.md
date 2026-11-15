# QA Automation guide

This guide explains everything you need to automate QA Commerce Lab (UI and API) **without reading the source code**: environments, reference data, testing API, scenarios, isolation, fault simulation and selector best practices.

> The testing API **only exists** in the `local` and `testing` environments. In the public demo (`APP_ENV=demo`) the module is not even registered: any `/api/test/*` route returns `404`.

## Table of contents

1. [Environments and URLs](#1-environments-and-urls)
2. [Reference data (deterministic seed)](#2-reference-data-deterministic-seed)
3. [Testing API](#3-testing-api)
4. [Ready-made scenarios](#4-ready-made-scenarios)
5. [Isolation and parallel runs](#5-isolation-and-parallel-runs)
6. [Reset, restore and cleanup](#6-reset-restore-and-cleanup)
7. [Controlled fault simulation](#7-controlled-fault-simulation)
8. [Simulated payments](#8-simulated-payments)
9. [E-mails, sessions and tokens](#9-e-mails-sessions-and-tokens)
10. [Selectors and accessibility](#10-selectors-and-accessibility)
11. [Programmatic login and session state](#11-programmatic-login-and-session-state)
12. [Running tests from GitHub Actions](#12-running-tests-from-github-actions)
13. [What the platform does NOT do (on purpose)](#13-what-the-platform-does-not-do-on-purpose)

---

## 1. Environments and URLs

| Environment | Purpose | Storefront | API / Swagger | Testing API | Global reset |
|---|---|---|---|---|---|
| `local` (Docker) | Development and debugging | http://localhost:3000 | http://localhost:3001/api · `/api/docs` | Yes (`X-Test-Api-Key: local-test-api-key`) | Yes |
| `local` (npm run dev) | SUT development | http://localhost:3000 | http://localhost:3001/api | Yes | Yes |
| `testing` (remote) | Automation suites | `https://<TESTING_DOMAIN>` | `https://<TESTING_DOMAIN>/api` | Yes (secret key) | Not by default (`ALLOW_GLOBAL_RESET=false`) |
| `demo` (remote) | Showcasing the project | `https://<DEMO_DOMAIN>` | `https://<DEMO_DOMAIN>/api` | **No** (404) | Optional nightly reset |

Remotely, the storefront and the API share the same origin (the *all-in-one* image serves both). Typical variables for your automation repository:

```bash
BASE_URL=https://testing.example.com
API_BASE_URL=https://testing.example.com/api
TEST_API_KEY=<secret>
```

`GET /api/info` tells you which environment you are on and which capabilities are enabled (`testingApi`, `globalReset`, `faultInjection`, `rateLimiting`...). It is useful as a *guard* when a suite starts:

```bash
curl -s $API_BASE_URL/info
```

### Storefront routes

| Page | Route |
|---|---|
| Home | `/` |
| Category | `/category/{slug}` (e.g. `/category/laptops`, `/category/graphics-cards`) |
| Search / all products | `/search?q=...` (also `/products`) |
| Deals | `/deals` |
| Product | `/product/{slug}` |
| Cart · Checkout · Result | `/cart` · `/checkout` · `/checkout/result/{orderId}` |
| Sign in · Register | `/login` · `/register` |
| Password recovery | `/forgot-password` · `/reset-password?token=...` |
| Customer area | `/account`, `/account/orders`, `/account/orders/{id}`, `/account/profile`, `/account/addresses`, `/account/security`, `/account/favorites`, `/account/reviews` |
| Admin panel | `/admin`, `/admin/products`, `/admin/products/new`, `/admin/products/{id}`, `/admin/orders`, `/admin/orders/{id}`, `/admin/users`, `/admin/coupons` |
| Information pages | `/info/shipping`, `/info/returns`, `/info/payments`, `/info/warranty`, `/info/contact`, `/info/about`, `/info/terms`, `/info/privacy` |
| Errors | `/403`, any unknown route → 404 page |

Catalog query parameters: `q`, `brand` (comma-separated slugs), `min`, `max` (euros), `inStock=true`, `onSale=true`, `minRating`, `featured=true`, `sort`, `page`. Order list filter: `/account/orders?status=SHIPPED`.

## 2. Reference data (deterministic seed)

The seed **always produces the same dataset**. After a global reset (`POST /api/test/reset` or `npm run db:reset`) the IDs are identical too. Dates are **relative** to the seed time (e.g. an expired coupon always expired "yesterday").

### Users

| E-mail | Password | Role | Status / data |
|---|---|---|---|
| `admin@qacommerce.test` | `Admin123!` | ADMIN | Store administrator |
| `customer@qacommerce.test` | `Customer123!` | CUSTOMER | Standard user: 1 address, no orders |
| `noorders@qacommerce.test` | `Customer123!` | CUSTOMER | No orders, no addresses, no favorites |
| `orders@qacommerce.test` | `Customer123!` | CUSTOMER | 9 orders, one per status (`QCL-SEED-0001` … `0009`), has already used `WELCOME10` |
| `favorites@qacommerce.test` | `Customer123!` | CUSTOMER | 6 favorites (including an out-of-stock and a discontinued product) |
| `addresses@qacommerce.test` | `Customer123!` | CUSTOMER | 4 addresses (the default one is "Work") |
| `disabled@qacommerce.test` | `Customer123!` | CUSTOMER | **Disabled**: login → `403 ACCOUNT_DISABLED` |
| `reviewer01…12@qacommerce.test` | `Customer123!` | CUSTOMER | Authors of the ~500 sample reviews |

Users prepared for specific test cases (same passwords; recreated identically by every seed/reset):

| E-mail | Password | Role | Ready for |
|---|---|---|---|
| `cart@qacommerce.test` | `Customer123!` | CUSTOMER | Cart with 3 in-stock products (QCL-LAP-007, QCL-MOU-004, 2 × QCL-ACC-003) and an address: **ready to check out** |
| `coupon@qacommerce.test` | `Customer123!` | CUSTOMER | Cart (QCL-AUD-001, QCL-KBD-005) with **`WELCOME10` already applied**; has never used it |
| `cartissues@qacommerce.test` | `Customer123!` | CUSTOMER | Cart with **every kind of issue**: out of stock (QCL-GPU-003), discontinued (QCL-DSK-010), 2 units of a single-unit product (QCL-PHN-003) and a €10 price drop (QCL-SSD-002) → `hasIssues = true`, checkout blocked |
| `returnable@qacommerce.test` | `Customer123!` | CUSTOMER | One order `QCL-SEED-0010` **delivered 3 days ago**: can request a return and write a *verified purchase* review of QCL-AUD-010 |
| `cancellable@qacommerce.test` | `Customer123!` | CUSTOMER | One **PAID** order `QCL-SEED-0011` placed today: can cancel it (refund + restock) |
| `fulladdresses@qacommerce.test` | `Customer123!` | CUSTOMER | **10 addresses** (the maximum): adding another returns `422 ADDRESS_LIMIT_REACHED` |
| `edge.case+qa@qacommerce.test` | `Customer123!` | CUSTOMER | **Edge-case data**: name `María José O'Connor-Núñez de la Fuente`, plus-addressed e-mail, `+34` phone, very long address and label with an apostrophe, marketing opt-in |
| `support@qacommerce.test` | `Admin123!` | ADMIN | **Second administrator**: test admin actions on another admin (disable it, remove its role) |

Orders of `orders@qacommerce.test`:

| No. | Status | Notes |
|---|---|---|
| QCL-SEED-0001 | DELIVERED | Delivered ~43 days ago → **outside** the return window; used `WELCOME10` |
| QCL-SEED-0002 | DELIVERED | Delivered ~4 days ago → **inside** the return window |
| QCL-SEED-0003 | SHIPPED | Express shipping, with a tracking number |
| QCL-SEED-0004 | PREPARING | |
| QCL-SEED-0005 | PAID | Can be cancelled by the customer |
| QCL-SEED-0006 | PENDING | Pending bank transfer (the admin can confirm the payment) |
| QCL-SEED-0007 | CANCELLED | Refunded |
| QCL-SEED-0008 | RETURN_REQUESTED | |
| QCL-SEED-0009 | RETURNED | Refunded |

> ⚠️ Reference users are **shared**. Use them for read-only tests or in dedicated environments. For tests that change state (e.g. checking out with `cart@`), restore them afterwards with `POST /api/test/seed`, or create your own data with the testing API or scenarios (sections 3-5) when suites run in parallel.

### Catalog

- 16 categories (2 levels: *PC Components* and *Peripherals* group subcategories), 39 real brands, **168 products** (164 active) with real model names. Prices, stock, ratings, reviews and images are fictional (the images are generic SVG illustrations generated by the API).
- Category slugs: `laptops`, `desktops`, `components` (→ `graphics-cards`, `processors`, `motherboards`, `memory`, `ssd-storage`), `monitors`, `peripherals` (→ `keyboards`, `mice`, `headphones`), `smartphones`, `tablets`, `accessories`.
- IDs per category: Laptops 1-12 · Desktops 13-24 · Graphics cards 25-36 · Processors 37-48 · Motherboards 49-60 · Memory 61-72 · SSD 73-84 · Monitors 85-96 · Keyboards 97-108 · Mice 109-120 · Headphones 121-132 · Smartphones 133-144 · Tablets 145-156 · Accessories 157-168.
- SKU: `QCL-<CAT>-<NNN>` (e.g. `QCL-LAP-001` = id 1 = *Apple MacBook Air 13" M3 16 GB 256 GB*, slug `apple-macbook-air-13-m3-16-gb-256-gb`).
- Always use the **SKU or the id** as the identifier in your tests: product names may be revised in future versions of the seed.

Products with special inventory (documented and stable):

| Situation | SKU (id) · product |
|---|---|
| Out of stock (stock 0) | QCL-GPU-003 (27) *Gigabyte GeForce RTX 4070 Super Windforce OC 12 GB* · QCL-LAP-006 (6) *Lenovo IdeaPad Slim 5 14AHP9 Ryzen 7* · QCL-CPU-010 (46) *AMD Ryzen 7 9800X3D* · QCL-MON-007 (91) *Samsung Odyssey Neo G8 32"* · QCL-PHN-010 (142) *Samsung Galaxy Z Fold6 512 GB* · QCL-TAB-006 (150) *Samsung Galaxy Tab S10 Ultra 256 GB* · QCL-AUD-008 (128) *SteelSeries Arctis Nova Pro Wireless* · QCL-KBD-010 (106) *Keychron Q1 Pro* |
| A single unit | QCL-GPU-006 (30) *ASUS ROG Astral GeForce RTX 5090 OC 32 GB* · QCL-LAP-004 (4) *ASUS Zenbook 14 OLED UX3405MA* · QCL-SSD-007 (79) *Crucial T705 2 TB* · QCL-PHN-003 (135) *Apple iPhone 16 Pro Max 512 GB* |
| Low stock (2-5) | QCL-GPU-005 (29) *MSI GeForce RTX 5080 Gaming Trio OC* · QCL-CPU-005 (41) *Intel Core Ultra 9 285K* · QCL-MON-003 (87) *LG UltraGear 27GS95QE* · QCL-DSK-003 (15) *Apple Mac Studio M4 Max* · QCL-TAB-012 (156) · QCL-MBD-001 (49) · QCL-RAM-008 (68) · QCL-AUD-002 (122) |
| Discontinued (`isActive=false`) | QCL-DSK-010 (22) *Lenovo IdeaCentre AIO 3 27* · QCL-RAM-004 (64) *Kingston FURY Beast DDR4 8 GB* · QCL-MOU-001 (109) *Logitech M90* · QCL-PHN-005 (137) *Samsung Galaxy A16 128 GB* |

`GET /api/test/info` returns the same information as JSON.

### Coupons

| Code | Rule | Expected result |
|---|---|---|
| `WELCOME10` | 10%, minimum order €50, 1 use per customer | Valid |
| `FREESHIP` | Free shipping, 5 uses per customer | Valid |
| `SAVE20` | €20 off, minimum €150 | `COUPON_MIN_SUBTOTAL_NOT_REACHED` below the minimum |
| `COMPONENTS15` | 15% on *PC Components* only (max. €100) | `COUPON_NOT_APPLICABLE` without components in the cart |
| `HEADPHONES5` | €5 off headphones, minimum €30 | Restricted to a category |
| `EXPIRED` | Expired yesterday | `COUPON_EXPIRED` |
| `COMINGSOON` | Starts in 30 days | `COUPON_NOT_STARTED` |
| `USEDUP` | Global limit reached (100/100) | `COUPON_USAGE_LIMIT_REACHED` |
| `INACTIVE` | Deactivated | `COUPON_INACTIVE` |
| `DOESNOTEXIST` (anything) | — | `COUPON_INVALID` |

Coupons require a signed-in user (`COUPON_REQUIRES_LOGIN` for guests).

### Shipping

| Code | Price | Free over | Delivery time |
|---|---|---|---|
| `STANDARD` | €4.99 | €99 (after discount) | 2-4 days |
| `EXPRESS` | €12.99 | never | 24 h |
| `PICKUP` | €1.99 | €49 | 3-5 days, requires `pickupPointId` |

## 3. Testing API

Base: `${API_BASE_URL}/test` · Required header: `X-Test-Api-Key: <key>` · Documented in Swagger under the **Testing** tag.

| Method | Route | Use |
|---|---|---|
| GET | `/test/info` | Capabilities, reference users, test cards, special inventory and scenarios |
| POST | `/test/reset` | **Global reset** (deletes everything and reloads the seed). Body `{ "confirm": "RESET" }`. Only if `ALLOW_GLOBAL_RESET=true` |
| POST | `/test/seed` | Restores the **reference data** to its initial state without deleting run data |
| GET | `/test/runs/{runId}` | Summary of what a run created |
| DELETE | `/test/runs/{runId}` | Cleans up a run (see section 6) |
| POST | `/test/users` | Creates a user (with optional address and tokens; configurable role/status) |
| POST | `/test/auth/token` | Issues tokens for a user without a password (configurable TTL) |
| POST | `/test/sessions/expire` | Expires (`expire`) or revokes (`revoke`) every session of a user |
| POST | `/test/password-reset-token` | Generates and **returns** a password reset token |
| POST | `/test/products` | Creates a product (price, stock, sale, status...) |
| PATCH | `/test/products/{id}` | Sets the stock, price, compare-at price or status of **any** product |
| POST | `/test/carts` | Prepares a user cart (`force: true` allows carts with issues) |
| POST | `/test/orders` | Creates an order directly in a status (`PENDING`…`RETURNED`) |
| POST | `/test/orders/{id}/expire-reservation` | Expires the reservation of a pending order and runs the job |
| POST | `/test/coupons` | Creates coupons (valid, expired, upcoming, exhausted...) |
| POST | `/test/payments/{id}/resolve` | Resolves a pending payment immediately (`APPROVED`/`DECLINED`) |
| POST | `/test/jobs/{name}/run` | Runs a job: `resolve-pending-payments`, `expire-reservations` |
| GET/POST | `/test/scenarios`, `/test/scenarios/{name}` | Lists / prepares scenarios (section 4) |
| GET | `/test/emails`, `/test/emails/latest` | Simulated mailbox (filters `to`, `runId`, `template`) |
| DELETE | `/test/emails` | Empties the mailbox (by `to` or `runId`) |
| GET/POST/DELETE | `/test/faults`, `/test/faults/{id}` | Fault simulation rules (section 7) |
| GET | `/test/audit` | Testing API operation log |

Test products default to the `accessories` category and the `anker` brand (override with `categorySlug` / `brandSlug`).

Examples:

```bash
KEY="X-Test-Api-Key: local-test-api-key"
API=http://localhost:3001/api

# Your own user with an address and tokens (5 s access token to test the refresh)
curl -s -X POST $API/test/users -H "$KEY" -H 'Content-Type: application/json' \
  -d '{"runId":"run-42","accessTtlSeconds":5}'

# Product with a single unit
curl -s -X POST $API/test/products -H "$KEY" -H 'Content-Type: application/json' \
  -d '{"runId":"run-42","stock":1,"priceCents":19999,"name":"Last unit"}'

# Order delivered 20 days ago
curl -s -X POST $API/test/orders -H "$KEY" -H 'Content-Type: application/json' \
  -d '{"runId":"run-42","email":"<email>","items":[{"sku":"QCL-ACC-001","quantity":1}],"status":"DELIVERED","daysAgo":20}'
```

Every creation response returns the `runId` used (if you do not send one, an `auto-xxxx` id is generated).

## 4. Ready-made scenarios

`POST /api/test/scenarios/{name}` with the body `{ "runId": "..." }` creates **new, isolated data** on every call (you can call the same scenario from several workers at once). The response includes credentials, tokens, IDs and everything you need to continue.

| Scenario | Description |
|---|---|
| `user-with-cart` | User with an address and a cart with 3 in-stock products |
| `checkout-ready` | User with an address and a cart ready to pay; includes the test cards |
| `payment-declined` | User with a ready cart and the test card that triggers a declined payment |
| `order-with-failed-payment` | PENDING order with a declined payment attempt (payment retry) |
| `out-of-stock-product` | Active product without stock |
| `last-unit-product` | Product with a single unit available |
| `discontinued-product` | Deactivated (discontinued) product |
| `concurrent-last-unit` | Product with 1 unit in the carts of two different users (checkout concurrency) |
| `cart-with-issues` | Cart with an out-of-stock product, a discontinued one, a quantity above stock and a price change |
| `pending-order` · `paid-order` · `preparing-order` · `shipped-order` · `delivered-order` · `cancelled-order` · `return-requested-order` · `returned-order` | User with an order in that status |
| `bank-transfer-pending-order` | PENDING order paid by bank transfer (the admin can confirm the payment) |
| `delivered-order-return-expired` | Order delivered 30 days ago (outside the return window) |
| `user-with-order-history` | User with 5 orders in different statuses |
| `expired-coupon` | Expired coupon and a user with a cart to try to apply it |
| `coupon-already-used` | User who already used a single-use coupon and has a new cart |
| `disabled-user` | Disabled user (login → 403 `ACCOUNT_DISABLED`) |
| `admin-user` | Administrator owned by the run (not shared) |
| `password-reset` | User with a valid password reset token (and the link) |
| `expired-session` | User whose tokens belong to an expired session (401 `SESSION_EXPIRED`) |
| `short-lived-token` | User with an access token that expires in 5 seconds |

```bash
curl -s -X POST $API/test/scenarios/checkout-ready -H "$KEY" -H 'Content-Type: application/json' -d '{"runId":"run-42"}'
```

## 5. Isolation and parallel runs

The strategy is based on a **run identifier** (`runId`, 3-64 characters `[A-Za-z0-9._-]`, e.g. `gh-1234-worker-3`).

1. **Tagging**: everything you create with the testing API is tagged with the `runId`. In addition, if you send the `X-Test-Run-Id: <runId>` header (only honoured in `local`/`testing`), users who register through the UI/API, their orders and the products/coupons an admin creates are tagged too.
2. **Catalog visibility**: products created by a run **only appear in listings, search, the home page and suggestions** for requests that send the same `X-Test-Run-Id`. That way other suites keep seeing exactly the reference catalog (counts and ordering do not change). Direct access by id/slug, the cart and the checkout always work.
3. **Simulated faults** scoped by `runId` or by user (section 7).
4. **Per-run cleanup**: `DELETE /api/test/runs/{runId}`.

How to send the header from the UI:

- Playwright: `browser.newContext({ extraHTTPHeaders: { 'X-Test-Run-Id': runId } })`.
- Any tool: the storefront reads `localStorage['qcl.testRunId']` and adds the header to all its API calls (a hook meant for automation; harmless outside testing).
- Cypress: `cy.intercept('/api/**', (req) => { req.headers['x-test-run-id'] = runId })` or `localStorage` in `onBeforeLoad`.

Recommendations for parallel runs:

- Each worker/test creates **its own** users, products and coupons (or uses scenarios) with a `runId` per run or per worker.
- Treat the reference data as **read-only** when running in parallel.
- If you include the `runId` in the e-mail of the users you register through the UI (`ana+<runId>@example.com`), the cleanup finds them even if you do not send the header.
- Do not use the global reset in shared environments.

**Known limitations**: isolation is logical (same database), not physical. Reference data (stock of reference products, global coupons) is shared: a suite that buys a reference product reduces its stock for the others until its run is cleaned up or the seed is restored. Fault rules live in the process memory: the testing environment must run **a single replica** of the API.

## 6. Reset, restore and cleanup

| Operation | Scope | Safe with concurrent suites |
|---|---|---|
| `DELETE /api/test/runs/{runId}` | Users, orders, products, coupons, e-mails and faults of the run. **Reverts** the effects on shared data: stock and sales of reference products, coupon usages, ratings | ✅ Yes |
| `POST /api/test/seed` | Restores the reference data (products, coupons, reference users and their orders/addresses/favorites) without touching runs | ⚠️ Affects anyone using reference data |
| `POST /api/test/reset` | `TRUNCATE` of everything + seed. Deterministic IDs | ❌ No (dedicated environments only; `ALLOW_GLOBAL_RESET`) |

Typical pattern (global setup / teardown):

```bash
# setup
curl -s $API/info | grep -q '"testingApi":true'
# teardown
curl -s -X DELETE $API/test/runs/$RUN_ID -H "$KEY"
```

From the command line (local): `npm run db:reset` (full reset) or `npm run db:seed` (restore reference data). In Docker: `docker compose exec api node dist/prisma/seed.js --reset`.

## 7. Controlled fault simulation

`POST /api/test/faults` registers a **scoped** and **temporary** rule. There are never random errors during normal operation.

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

| Field | Meaning |
|---|---|
| `runId` / `userId` / `global` | Scope: requests with that `X-Test-Run-Id` header, requests authenticated as that user, or all requests (only with `ALLOW_GLOBAL_FAULTS=true`) |
| `method`, `path` | Exact path or pattern: `*` = one segment, `**` = anything (e.g. `/api/orders/*/payments`, `/api/products/**`) |
| `action` | `error` (responds with `status`, 500 by default), `delay` (adds `delayMs` and continues), `timeout` (waits `delayMs`, 30 s by default, and responds 504) |
| `code`, `message` | Customise the error body (`FAULT_INJECTED` by default) |
| `times` | Number of affected requests (1 = transient failure that recovers on retry) |
| `ttlSeconds` | Rule expiry (600 by default, 3600 maximum) |

Affected responses carry the `X-Fault-Injected: <id>` header. The `/api/test/*` and `/api/health*` routes are never affected. Examples: 500/503 on the product listing (UI error states), 3 s latency on `/api/cart` (skeletons and spinners), a timeout on `/api/checkout/quote`, a custom 409 error...

Other deterministic mechanisms: test cards (section 8), expired sessions (section 9), `expire-reservation`, inventory with `PATCH /test/products/{id}`.

## 8. Simulated payments

Only these cards are accepted (any cardholder name, a future `MM/YY` date and a 3-digit CVC). A real card with a valid Luhn checksum returns `422 CARD_NOT_ALLOWED`.

| Number | Result |
|---|---|
| 4242 4242 4242 4242 | Approved |
| 5555 5555 5555 4444 | Approved (Mastercard) |
| 4000 0000 0000 0002 | Declined (`card_declined`) |
| 4000 0000 0000 9995 | Insufficient funds (`insufficient_funds`) |
| 4000 0000 0000 0069 | Card expired according to the issuer (`expired_card`) |
| 4000 0000 0000 0077 | Pending → **approved** after `PAYMENT_PENDING_DELAY_MS` (15 s by default) |
| 4000 0000 0000 0085 | Pending → **declined** after `PAYMENT_PENDING_DELAY_MS` |
| 4000 0000 0000 0119 | Processing error: **HTTP 502** `PAYMENT_PROCESSING_ERROR` (the order is created) |
| 4000 0000 0000 0408 | Gateway timeout: waits `PAYMENT_TIMEOUT_DELAY_MS` (8 s) and responds **HTTP 504** `PAYMENT_GATEWAY_TIMEOUT` |

Key behaviour for advanced tests:

- A **declined payment is not an HTTP error**: `POST /api/orders` → `201` with `order.paymentStatus = FAILED`; the order stays `PENDING`, reserved for `ORDER_RESERVATION_MINUTES` (30) and can be retried (`POST /api/orders/{id}/payments`).
- On 502/504 the order **already exists** (`details.orderId`). Repeating the request with the same `Idempotency-Key` returns the original order (`200`, `Idempotent-Replayed: true` header) instead of duplicating it.
- Pending payments are resolved by a job every `JOBS_INTERVAL_MS`; you can force it with `POST /api/test/payments/{id}/resolve` or `POST /api/test/jobs/resolve-pending-payments/run`.
- If the reservation expires without payment, the order is cancelled automatically and the stock released (`POST /api/test/orders/{id}/expire-reservation` forces it).
- A bank transfer leaves the order `PENDING`/`AWAITING_PAYMENT` for 72 h until an admin confirms it.

## 9. E-mails, sessions and tokens

**Simulated mailbox**: every e-mail (welcome, password recovery, confirmations and order status changes) is stored in the database.

```bash
curl -s "$API/test/emails/latest?to=ana@example.com&template=password-reset" -H "$KEY"
# metadata.token and metadata.link contain the reset token
```

Templates: `welcome`, `password-reset`, `password-changed`, `order-paid`, `bank-transfer-instructions`, `order-shipped`, `order-delivered`, `order-cancelled`, `return-requested`, `order-returned`. Locally you can view them in Mailpit (`docker compose --profile mail up` with `SMTP_HOST=mailpit`, UI at http://localhost:8025). The reset link points to `/reset-password?token=...`.

**Sessions and tokens**:

- JWT access token (HS256) valid for `ACCESS_TOKEN_TTL_SECONDS` (900 s). Session refresh token valid for `REFRESH_TOKEN_TTL_DAYS` (7 days), in the body and in the httpOnly cookie `qcl_rt` (path `/api/auth`).
- Every authenticated request validates the session in the database: sign-out, password change/reset and user deactivation invalidate the tokens **immediately**.
- Distinct 401 codes: `UNAUTHENTICATED`, `TOKEN_INVALID`, `TOKEN_EXPIRED`, `SESSION_REVOKED`, `SESSION_EXPIRED`, `REFRESH_TOKEN_INVALID`.
- For expiry tests: `POST /test/users {"accessTtlSeconds": 5}`, `POST /test/auth/token {"accessTtlSeconds": 3}`, `POST /test/sessions/expire {"email": "...", "mode": "expire"}` or the `expired-session` scenario.
- There is no account lockout, CAPTCHA, e-mail verification or rate limiting in `local`/`testing`.

## 10. Selectors and accessibility

Prefer, in this order:

1. **Roles and accessible names** (`getByRole('button', { name: 'Sign in' })`): semantic HTML, `aria-label` on icon buttons, `aria-current`, `aria-pressed`, `aria-invalid`, `role="alert"` on errors.
2. **Labels** (`getByLabel('Email', { exact: true })`): every field has a `<label for>`; the required asterisk is **outside** the label so the accessible name is exact.
3. **Stable `data-testid` attributes** on key components (never random).

Available `data-testid` values (selection):

| Area | data-testid |
|---|---|
| Header | `logo`, `search-input`, `search-submit`, `search-suggestions`, `search-suggestion`, `cart-link`, `cart-count`, `login-link`, `account-menu-trigger`, `account-menu`, `logout-button`, `admin-link`, `categories-menu-trigger`, `mobile-menu-trigger` |
| Home | `hero-carousel`, `hero-slide`, `hero-cta`, `promo-banner`, `deal-of-the-week`, `popular-categories`, `category-tile`, `brand-strip`, `home-deals`, `home-featured`, `home-new`, `home-bestsellers`, `home-toprated`, `trust-bar` |
| Catalog | `catalog-title`, `results-count`, `sort-select`, `filters`, `filter-brand-<slug>`, `filter-price-min/max/apply`, `filter-in-stock`, `filter-on-sale`, `filter-rating-<n>`, `active-filters`, `clear-filters`, `product-grid`, `pagination`, `no-results` |
| Product card | `product-card` (+ `data-product-id`, `data-sku`), `product-card-link`, `add-to-cart`, `favorite-toggle`, `discount-badge`, `price`, `compare-at-price`, `availability` (+ `data-availability`) |
| Product page | `product-detail`, `product-name`, `product-sku`, `key-specs`, `product-quantity(-increase/-decrease/-value)`, `product-add-to-cart`, `product-thumbnail`, `product-description`, `product-specs`, `reviews`, `rating-summary`, `review-form`, `review-item`, `write-review`, `related-products` |
| Cart | `cart-items`, `cart-item` (+ `data-sku`), `cart-item-quantity`, `cart-item-remove`, `cart-item-issue` (+ `data-issue`), `price-changed`, `coupon-input`, `apply-coupon`, `coupon-error`, `applied-coupon`, `summary-subtotal/discount/shipping/total`, `checkout-button`, `cart-empty` |
| Checkout | `checkout-step-<n>`, `address-option`, `shipping-<CODE>`, `pickup-point-select`, `payment-method-<METHOD>`, `card-number/holder/expiry/cvc`, `checkout-next`, `place-order`, `checkout-total`, `checkout-error` |
| Result / orders | `order-result` (+ `data-order-status`, `data-payment-status`), `order-result-title`, `order-number`, `retry-payment`, `order-row`, `order-detail`, `order-status`, `payment-status`, `cancel-order`, `request-return`, `confirm-dialog-confirm` |
| Customer area | `account-greeting`, `account-tile-orders`, `account-tile-favorites`, `account-tile-addresses`, `profile-form`, `address-card`, `new-address`, `change-password-form`, `session-item` |
| Admin | `admin-nav-dashboard/products/orders/users/coupons`, `kpis`, `kpi-sales`, `kpi-orders`, `kpi-to-ship`, `kpi-returns`, `kpi-users`, `kpi-products`, `kpi-out-of-stock`, `kpi-low-stock`, `admin-products-table`, `admin-product-row`, `product-form`, `product-save`, `stock-delta`, `stock-adjust`, `admin-order-row`, `admin-status-select`, `admin-status-submit`, `confirm-payment`, `admin-user-row`, `toggle-user-status`, `admin-coupon-row`, `coupon-form` |

Real asynchronous behaviour worth waiting for correctly: search suggestions (250 ms debounce), toasts (4 s), loading skeletons, payment result polling (every 3 s while `PROCESSING`), silent token refresh.

Money is displayed in English format with euros (`€1,198.99`) and dates as `14 Nov 2026`. The UI language is English; addresses, phone numbers and postal codes follow Spanish rules because the store only ships to Spain.

## 11. Programmatic login and session state

The SPA keeps the access token **in memory only** and restores the session on load through the httpOnly cookie `qcl_rt` (`POST /api/auth/refresh`) if `localStorage['qcl.hasSession'] === '1'`. To skip the login form:

- **Playwright**: call `page.request.post('/api/auth/login', { data })` (it shares cookies with the context), set `localStorage.setItem('qcl.hasSession','1')` and navigate; or save the `storageState` after a login and reuse it.
- **Cypress**: `cy.request('POST', '/api/auth/login', body)` sets the cookie; add `qcl.hasSession` to `localStorage` before visiting.
- **Selenium/WebdriverIO**: get the refresh token through the API and create the `qcl_rt` cookie (path `/api/auth`) on the store domain.
- **API (Postman, REST Assured...)**: use `Authorization: Bearer <accessToken>`; refresh with `POST /api/auth/refresh` and `{ "refreshToken": "..." }`.

Guest cart: the cart token is stored in `localStorage['qcl.cartToken']` and sent as `X-Cart-Token`; after login the SPA merges it with `POST /api/cart/merge`.

## 12. Running tests from GitHub Actions

Your `qa-commerce-automation` repository only needs the testing environment URL and the testing API key as secrets. Indicative configuration example (not part of this repository):

```yaml
env:
  BASE_URL: ${{ vars.BASE_URL }}            # https://testing.example.com
  API_BASE_URL: ${{ vars.API_BASE_URL }}    # https://testing.example.com/api
  TEST_API_KEY: ${{ secrets.TEST_API_KEY }}
  RUN_ID: gh-${{ github.run_id }}-${{ github.run_attempt }}
```

Before the suite: check `GET /api/health/ready` and `GET /api/info`. Afterwards (even on failure, `if: always()`): `DELETE /api/test/runs/$RUN_ID`. For parallel shards/workers, append the shard index to the `runId`.

Account for Internet latency: use somewhat longer *timeouts* than locally and avoid fixed waits.

## 13. What the platform does NOT do (on purpose)

- There are no difficulty levels, training modes or random selectors.
- There are no random errors: every failure is the result of a business rule or an explicit simulation.
- There is no CAPTCHA, lockout after failed attempts or e-mail verification.
- It does not include an automation framework, Page Objects or test fixtures: those belong in your automation repository.
