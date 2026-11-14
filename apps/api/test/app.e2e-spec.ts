/**
 * Technical integration checks of the SUT itself (CI smoke). They run against a real
 * PostgreSQL database (DATABASE_URL) and are intentionally few: this is NOT the automation
 * framework of the lab, just a guard that the critical paths of the application work.
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { loadConfig } from '../src/config/app-config';
import { createValidationPipe } from '../src/common/validation';
import { ReferenceSeeder } from '../src/seed/reference-seeder';

const KEY = { 'X-Test-Api-Key': 'local-test-api-key' };
const CARD = { number: '4242424242424242', holderName: 'CI', expMonth: 12, expYear: new Date().getFullYear() + 2, cvc: '123' };

describe('QA Commerce Lab API (integration)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.APP_ENV = 'local';
    process.env.JOBS_ENABLED = 'false';
    process.env.LOG_LEVEL = 'silent';
    process.env.PAYMENT_TIMEOUT_DELAY_MS = '50';
    const prisma = new PrismaClient();
    await new ReferenceSeeder(prisma).reset();
    await prisma.$disconnect();

    const moduleRef = await Test.createTestingModule({ imports: [AppModule.register(loadConfig())] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api');
    app.useGlobalPipes(createValidationPipe());
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('reports readiness', async () => {
    const res = await request(app.getHttpServer()).get('/api/health/ready').expect(200);
    expect(res.body.checks.database.status).toBe('ok');
  });

  it('seeds a deterministic catalog of at least 150 active products', async () => {
    const res = await request(app.getHttpServer()).get('/api/products?pageSize=1').expect(200);
    expect(res.body.meta.total).toBeGreaterThanOrEqual(150);
    const first = await request(app.getHttpServer()).get('/api/products/1').expect(200);
    expect(first.body.sku).toBe('QCL-LAP-001');
  });

  it('filters, sorts and paginates on the server', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/products?category=componentes&sort=price_asc&inStock=true&pageSize=10')
      .expect(200);
    const prices = res.body.data.map((p: { priceCents: number }) => p.priceCents);
    expect([...prices].sort((a, b) => a - b)).toEqual(prices);
    expect(res.body.data.every((p: { stock: number }) => p.stock > 0)).toBe(true);
  });

  it('returns the documented error envelope', async () => {
    const res = await request(app.getHttpServer()).post('/api/auth/login').send({ email: 'nope' }).expect(400);
    expect(res.body).toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' });
    expect(Array.isArray(res.body.details)).toBe(true);
  });

  it('protects the testing API with the technical key', async () => {
    await request(app.getHttpServer()).get('/api/test/info').expect(401);
    await request(app.getHttpServer()).get('/api/test/info').set(KEY).expect(200);
  });

  it('completes a purchase end to end and keeps inventory consistent', async () => {
    const scenario = await request(app.getHttpServer())
      .post('/api/test/scenarios/checkout-ready')
      .set(KEY)
      .send({ runId: 'ci-e2e' })
      .expect(201);
    const { tokens, address, product } = scenario.body.data;
    const auth = { Authorization: `Bearer ${tokens.accessToken}` };

    const quote = await request(app.getHttpServer())
      .post('/api/checkout/quote')
      .set(auth)
      .send({ addressId: address.id, shippingMethodCode: 'STANDARD' })
      .expect(200);

    const order = await request(app.getHttpServer())
      .post('/api/orders')
      .set(auth)
      .set('Idempotency-Key', 'ci-e2e-order-0001')
      .send({ addressId: address.id, shippingMethodCode: 'STANDARD', paymentMethod: 'CARD', card: CARD, expectedTotalCents: quote.body.totalCents })
      .expect(201);
    expect(order.body.order.status).toBe('PAID');

    const replay = await request(app.getHttpServer())
      .post('/api/orders')
      .set(auth)
      .set('Idempotency-Key', 'ci-e2e-order-0001')
      .send({ addressId: address.id, shippingMethodCode: 'STANDARD', paymentMethod: 'CARD', card: CARD, expectedTotalCents: quote.body.totalCents })
      .expect(200);
    expect(replay.body.order.id).toBe(order.body.order.id);

    const after = await request(app.getHttpServer()).get(`/api/products/${product.id}`).expect(200);
    expect(after.body.stock).toBe(product.stock - 1);

    await request(app.getHttpServer()).post(`/api/orders/${order.body.order.id}/cancel`).set(auth).send({}).expect(200);
    const restored = await request(app.getHttpServer()).get(`/api/products/${product.id}`).expect(200);
    expect(restored.body.stock).toBe(product.stock);
  });

  it('never sells more than the available stock under concurrency', async () => {
    const scenario = await request(app.getHttpServer())
      .post('/api/test/scenarios/concurrent-last-unit')
      .set(KEY)
      .send({ runId: 'ci-e2e' })
      .expect(201);
    const { users, product } = scenario.body.data;
    const results = await Promise.all(
      users.map((u: { tokens: { accessToken: string }; address: { id: number } }) =>
        request(app.getHttpServer())
          .post('/api/orders')
          .set({ Authorization: `Bearer ${u.tokens.accessToken}` })
          .send({ addressId: u.address.id, shippingMethodCode: 'STANDARD', paymentMethod: 'CARD', card: CARD }),
      ),
    );
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    const p = await request(app.getHttpServer()).get(`/api/products/${product.id}`).expect(200);
    expect(p.body.stock).toBe(0);
  });

  it('cleans up a run without touching reference data', async () => {
    const before = await request(app.getHttpServer()).get('/api/products?pageSize=1').expect(200);
    await request(app.getHttpServer()).delete('/api/test/runs/ci-e2e').set(KEY).expect(200);
    const summary = await request(app.getHttpServer()).get('/api/test/runs/ci-e2e').set(KEY).expect(200);
    expect(summary.body).toMatchObject({ users: 0, products: 0, orders: 0 });
    const after = await request(app.getHttpServer()).get('/api/products?pageSize=1').expect(200);
    expect(after.body.meta.total).toBe(before.body.meta.total);
  });
});
