import { Injectable } from '@nestjs/common';
import { OrderStatus, PaymentMethod, Role, UserStatus } from '@prisma/client';
import { ErrorCode, notFound } from '../../common/errors';
import { TEST_CARDS } from '../orders/payment-simulator';
import { FixturesService, resolveRunId } from './fixtures.service';

export interface ScenarioDefinition {
  name: string;
  description: string;
  run: (runId: string) => Promise<Record<string, unknown>>;
}

const card = (scenario: string) => {
  const c = TEST_CARDS.find((t) => t.scenario === scenario)!;
  return { number: c.number, holderName: 'TEST USER', expMonth: 12, expYear: new Date().getFullYear() + 3, cvc: '123' };
};

/**
 * Ready-made, isolated scenarios. Each call creates *new* data tagged with the run id,
 * so the same scenario can run in parallel workers without collisions.
 */
@Injectable()
export class ScenariosService {
  private readonly scenarios: ScenarioDefinition[];

  constructor(private readonly fx: FixturesService) {
    this.scenarios = [
      {
        name: 'user-with-cart',
        description: 'User with an address and a cart with 3 in-stock products',
        run: async (runId) => {
          const u = await this.fx.createUser({ runId });
          const products = await Promise.all([20, 10, 5].map((stock, i) => this.fx.createProduct({ runId, stock, priceCents: 2999 + i * 1000 })));
          const cart = await this.fx.prepareCart({ userId: u.user.id, items: products.map((p) => ({ productId: p.product.id, quantity: 1 })) });
          return { ...u, products: products.map((p) => p.product), cart };
        },
      },
      {
        name: 'checkout-ready',
        description: 'User with an address and a cart ready to pay; includes the test cards',
        run: async (runId) => {
          const u = await this.fx.createUser({ runId });
          const p = await this.fx.createProduct({ runId, stock: 10, priceCents: 12999 });
          const cart = await this.fx.prepareCart({ userId: u.user.id, items: [{ productId: p.product.id, quantity: 1 }] });
          return { ...u, product: p.product, cart, cards: { approved: card('APPROVED'), declined: card('DECLINED'), insufficientFunds: card('INSUFFICIENT_FUNDS') } };
        },
      },
      {
        name: 'payment-declined',
        description: 'User with a ready cart and the test card that triggers a declined payment',
        run: async (runId) => {
          const u = await this.fx.createUser({ runId });
          const p = await this.fx.createProduct({ runId, stock: 10, priceCents: 5999 });
          const cart = await this.fx.prepareCart({ userId: u.user.id, items: [{ productId: p.product.id, quantity: 1 }] });
          return { ...u, product: p.product, cart, card: card('DECLINED') };
        },
      },
      {
        name: 'order-with-failed-payment',
        description: 'PENDING order with a declined payment attempt (payment retry)',
        run: async (runId) => {
          const u = await this.fx.createUser({ runId });
          const p = await this.fx.createProduct({ runId, stock: 10 });
          const o = await this.fx.createOrder({ runId, userId: u.user.id, items: [{ productId: p.product.id, quantity: 1 }], status: OrderStatus.PENDING, failedPayment: true });
          return { ...u, product: p.product, order: o.order, retryCard: card('APPROVED') };
        },
      },
      {
        name: 'out-of-stock-product',
        description: 'Active product without stock',
        run: async (runId) => ({ runId, product: (await this.fx.createProduct({ runId, stock: 0, name: `Out of stock ${runId}` })).product }),
      },
      {
        name: 'last-unit-product',
        description: 'Product with a single unit available',
        run: async (runId) => ({ runId, product: (await this.fx.createProduct({ runId, stock: 1, name: `Last unit ${runId}` })).product }),
      },
      {
        name: 'discontinued-product',
        description: 'Deactivated (discontinued) product',
        run: async (runId) => ({ runId, product: (await this.fx.createProduct({ runId, stock: 10, isActive: false })).product }),
      },
      {
        name: 'concurrent-last-unit',
        description: 'Product with 1 unit in the carts of two different users (checkout concurrency test)',
        run: async (runId) => {
          const p = await this.fx.createProduct({ runId, stock: 1, priceCents: 19999 });
          const users = await Promise.all([this.fx.createUser({ runId }), this.fx.createUser({ runId })]);
          for (const u of users) await this.fx.prepareCart({ userId: u.user.id, items: [{ productId: p.product.id, quantity: 1 }] });
          return { runId, product: p.product, users, card: card('APPROVED') };
        },
      },
      {
        name: 'cart-with-issues',
        description: 'Cart with an out-of-stock product, a discontinued one, a quantity above stock and a price change',
        run: async (runId) => {
          const u = await this.fx.createUser({ runId });
          const [ok, outOfStock, discontinued, scarce, priceChange] = await Promise.all([
            this.fx.createProduct({ runId, stock: 10, name: `Available ${runId}` }),
            this.fx.createProduct({ runId, stock: 5, name: `Will sell out ${runId}` }),
            this.fx.createProduct({ runId, stock: 5, name: `Will be discontinued ${runId}` }),
            this.fx.createProduct({ runId, stock: 5, name: `Low stock ${runId}` }),
            this.fx.createProduct({ runId, stock: 10, priceCents: 5000, name: `Price change ${runId}` }),
          ]);
          await this.fx.prepareCart({
            userId: u.user.id,
            items: [ok, outOfStock, discontinued, scarce, priceChange].map((p, i) => ({ productId: p.product.id, quantity: i === 3 ? 4 : 1 })),
          });
          await this.fx.patchProduct(outOfStock.product.id, { stock: 0 });
          await this.fx.patchProduct(discontinued.product.id, { isActive: false });
          await this.fx.patchProduct(scarce.product.id, { stock: 2 });
          await this.fx.patchProduct(priceChange.product.id, { priceCents: 6500 });
          const cart = await this.fx.prepareCart({ userId: u.user.id, items: [], replace: false });
          return { ...u, cart };
        },
      },
      ...(['PENDING', 'PAID', 'PREPARING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'RETURN_REQUESTED', 'RETURNED'] as OrderStatus[]).map((status) => ({
        name: `${status.toLowerCase().replace('_', '-')}-order`,
        description: `User with an order in ${status} status`,
        run: async (runId: string) => {
          const u = await this.fx.createUser({ runId });
          const p = await this.fx.createProduct({ runId, stock: 10, priceCents: 7999 });
          const o = await this.fx.createOrder({ runId, userId: u.user.id, items: [{ productId: p.product.id, quantity: 1 }], status });
          return { ...u, product: p.product, order: o.order };
        },
      })),
      {
        name: 'bank-transfer-pending-order',
        description: 'PENDING order paid by bank transfer (the administrator can confirm the payment)',
        run: async (runId) => {
          const u = await this.fx.createUser({ runId });
          const p = await this.fx.createProduct({ runId, stock: 10 });
          const o = await this.fx.createOrder({ runId, userId: u.user.id, items: [{ productId: p.product.id, quantity: 1 }], status: OrderStatus.PENDING, paymentMethod: PaymentMethod.BANK_TRANSFER });
          return { ...u, order: o.order };
        },
      },
      {
        name: 'delivered-order-return-expired',
        description: 'Order delivered 30 days ago (outside the return window)',
        run: async (runId) => {
          const u = await this.fx.createUser({ runId });
          const p = await this.fx.createProduct({ runId, stock: 10 });
          const o = await this.fx.createOrder({ runId, userId: u.user.id, items: [{ productId: p.product.id, quantity: 1 }], status: OrderStatus.DELIVERED, daysAgo: 30 });
          return { ...u, order: o.order };
        },
      },
      {
        name: 'user-with-order-history',
        description: 'User with 5 orders in different statuses',
        run: async (runId) => {
          const u = await this.fx.createUser({ runId });
          const p = await this.fx.createProduct({ runId, stock: 50 });
          const orders = [];
          for (const [status, daysAgo] of [[OrderStatus.DELIVERED, 40], [OrderStatus.DELIVERED, 5], [OrderStatus.SHIPPED, 2], [OrderStatus.PAID, 1], [OrderStatus.CANCELLED, 10]] as const) {
            orders.push((await this.fx.createOrder({ runId, userId: u.user.id, items: [{ productId: p.product.id, quantity: 1 }], status, daysAgo })).order);
          }
          return { ...u, orders };
        },
      },
      {
        name: 'expired-coupon',
        description: 'Expired coupon and a user with a cart to try to apply it',
        run: async (runId) => {
          const u = await this.fx.createUser({ runId });
          const p = await this.fx.createProduct({ runId, stock: 10, priceCents: 9999 });
          await this.fx.prepareCart({ userId: u.user.id, items: [{ productId: p.product.id, quantity: 1 }] });
          const c = await this.fx.createCoupon({ runId, value: 10, startsInDays: -30, expiresInDays: -1 });
          return { ...u, coupon: c.coupon };
        },
      },
      {
        name: 'coupon-already-used',
        description: 'User who already used a single-use coupon and has a new cart',
        run: async (runId) => {
          const u = await this.fx.createUser({ runId });
          const p = await this.fx.createProduct({ runId, stock: 10, priceCents: 9999 });
          const c = await this.fx.createCoupon({ runId, value: 10, perUserLimit: 1 });
          await this.fx.createOrder({ runId, userId: u.user.id, items: [{ productId: p.product.id, quantity: 1 }], status: OrderStatus.DELIVERED, couponCode: c.coupon.code });
          await this.fx.prepareCart({ userId: u.user.id, items: [{ productId: p.product.id, quantity: 1 }] });
          return { ...u, coupon: c.coupon };
        },
      },
      {
        name: 'disabled-user',
        description: 'Disabled user (login returns 403 ACCOUNT_DISABLED)',
        run: async (runId) => this.fx.createUser({ runId, status: UserStatus.DISABLED, login: false }),
      },
      {
        name: 'admin-user',
        description: 'Administrator owned by the run (not shared with other suites)',
        run: async (runId) => this.fx.createUser({ runId, role: Role.ADMIN, withAddress: false }),
      },
      {
        name: 'password-reset',
        description: 'User with a valid password reset token',
        run: async (runId) => {
          const u = await this.fx.createUser({ runId, login: false });
          return { ...u, reset: await this.fx.passwordResetToken(u.credentials.email) };
        },
      },
      {
        name: 'expired-session',
        description: 'User with tokens of an already expired session (access and refresh return 401 SESSION_EXPIRED)',
        run: async (runId) => {
          const u = await this.fx.createUser({ runId });
          await this.fx.expireSessions({ userId: u.user.id }, 'expire');
          return u;
        },
      },
      {
        name: 'short-lived-token',
        description: 'User with an access token that expires in 5 seconds (refresh token renewal)',
        run: async (runId) => this.fx.createUser({ runId, accessTtlSeconds: 5 }),
      },
    ];
  }

  list() {
    return this.scenarios.map(({ name, description }) => ({ name, description }));
  }

  async run(name: string, runId?: string) {
    const scenario = this.scenarios.find((s) => s.name === name);
    if (!scenario) {
      throw notFound(ErrorCode.SCENARIO_NOT_FOUND, `El escenario "${name}" no existe`, { available: this.scenarios.map((s) => s.name) });
    }
    const id = resolveRunId(runId);
    const data = await scenario.run(id);
    return { scenario: name, runId: id, data };
  }
}
