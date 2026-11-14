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
        description: 'Usuario con dirección y un carrito con 3 productos en stock',
        run: async (runId) => {
          const u = await this.fx.createUser({ runId });
          const products = await Promise.all([20, 10, 5].map((stock, i) => this.fx.createProduct({ runId, stock, priceCents: 2999 + i * 1000 })));
          const cart = await this.fx.prepareCart({ userId: u.user.id, items: products.map((p) => ({ productId: p.product.id, quantity: 1 })) });
          return { ...u, products: products.map((p) => p.product), cart };
        },
      },
      {
        name: 'checkout-ready',
        description: 'Usuario con dirección y carrito listo para pagar; incluye las tarjetas de prueba',
        run: async (runId) => {
          const u = await this.fx.createUser({ runId });
          const p = await this.fx.createProduct({ runId, stock: 10, priceCents: 12999 });
          const cart = await this.fx.prepareCart({ userId: u.user.id, items: [{ productId: p.product.id, quantity: 1 }] });
          return { ...u, product: p.product, cart, cards: { approved: card('APPROVED'), declined: card('DECLINED'), insufficientFunds: card('INSUFFICIENT_FUNDS') } };
        },
      },
      {
        name: 'payment-declined',
        description: 'Usuario con carrito listo y la tarjeta de prueba que provoca un pago rechazado',
        run: async (runId) => {
          const u = await this.fx.createUser({ runId });
          const p = await this.fx.createProduct({ runId, stock: 10, priceCents: 5999 });
          const cart = await this.fx.prepareCart({ userId: u.user.id, items: [{ productId: p.product.id, quantity: 1 }] });
          return { ...u, product: p.product, cart, card: card('DECLINED') };
        },
      },
      {
        name: 'order-with-failed-payment',
        description: 'Pedido PENDING con un intento de pago rechazado (reintento de pago)',
        run: async (runId) => {
          const u = await this.fx.createUser({ runId });
          const p = await this.fx.createProduct({ runId, stock: 10 });
          const o = await this.fx.createOrder({ runId, userId: u.user.id, items: [{ productId: p.product.id, quantity: 1 }], status: OrderStatus.PENDING, failedPayment: true });
          return { ...u, product: p.product, order: o.order, retryCard: card('APPROVED') };
        },
      },
      {
        name: 'out-of-stock-product',
        description: 'Producto activo sin stock',
        run: async (runId) => ({ runId, product: (await this.fx.createProduct({ runId, stock: 0, name: `Producto agotado ${runId}` })).product }),
      },
      {
        name: 'last-unit-product',
        description: 'Producto con una única unidad disponible',
        run: async (runId) => ({ runId, product: (await this.fx.createProduct({ runId, stock: 1, name: `Última unidad ${runId}` })).product }),
      },
      {
        name: 'discontinued-product',
        description: 'Producto desactivado (descatalogado)',
        run: async (runId) => ({ runId, product: (await this.fx.createProduct({ runId, stock: 10, isActive: false })).product }),
      },
      {
        name: 'concurrent-last-unit',
        description: 'Producto con 1 unidad en el carrito de dos usuarios distintos (prueba de concurrencia en el checkout)',
        run: async (runId) => {
          const p = await this.fx.createProduct({ runId, stock: 1, priceCents: 19999 });
          const users = await Promise.all([this.fx.createUser({ runId }), this.fx.createUser({ runId })]);
          for (const u of users) await this.fx.prepareCart({ userId: u.user.id, items: [{ productId: p.product.id, quantity: 1 }] });
          return { runId, product: p.product, users, card: card('APPROVED') };
        },
      },
      {
        name: 'cart-with-issues',
        description: 'Carrito con un producto agotado, uno descatalogado, una cantidad superior al stock y un cambio de precio',
        run: async (runId) => {
          const u = await this.fx.createUser({ runId });
          const [ok, outOfStock, discontinued, scarce, priceChange] = await Promise.all([
            this.fx.createProduct({ runId, stock: 10, name: `Disponible ${runId}` }),
            this.fx.createProduct({ runId, stock: 5, name: `Se agotará ${runId}` }),
            this.fx.createProduct({ runId, stock: 5, name: `Se descatalogará ${runId}` }),
            this.fx.createProduct({ runId, stock: 5, name: `Stock escaso ${runId}` }),
            this.fx.createProduct({ runId, stock: 10, priceCents: 5000, name: `Cambio de precio ${runId}` }),
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
        description: `Usuario con un pedido en estado ${status}`,
        run: async (runId: string) => {
          const u = await this.fx.createUser({ runId });
          const p = await this.fx.createProduct({ runId, stock: 10, priceCents: 7999 });
          const o = await this.fx.createOrder({ runId, userId: u.user.id, items: [{ productId: p.product.id, quantity: 1 }], status });
          return { ...u, product: p.product, order: o.order };
        },
      })),
      {
        name: 'bank-transfer-pending-order',
        description: 'Pedido PENDING pagado por transferencia (el administrador puede confirmar el pago)',
        run: async (runId) => {
          const u = await this.fx.createUser({ runId });
          const p = await this.fx.createProduct({ runId, stock: 10 });
          const o = await this.fx.createOrder({ runId, userId: u.user.id, items: [{ productId: p.product.id, quantity: 1 }], status: OrderStatus.PENDING, paymentMethod: PaymentMethod.BANK_TRANSFER });
          return { ...u, order: o.order };
        },
      },
      {
        name: 'delivered-order-return-expired',
        description: 'Pedido entregado hace 30 días (fuera del plazo de devolución)',
        run: async (runId) => {
          const u = await this.fx.createUser({ runId });
          const p = await this.fx.createProduct({ runId, stock: 10 });
          const o = await this.fx.createOrder({ runId, userId: u.user.id, items: [{ productId: p.product.id, quantity: 1 }], status: OrderStatus.DELIVERED, daysAgo: 30 });
          return { ...u, order: o.order };
        },
      },
      {
        name: 'user-with-order-history',
        description: 'Usuario con 5 pedidos en distintos estados',
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
        description: 'Cupón caducado y usuario con carrito para intentar aplicarlo',
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
        description: 'Usuario que ya utilizó un cupón de un solo uso y tiene un carrito nuevo',
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
        description: 'Usuario desactivado (el login devuelve 403 ACCOUNT_DISABLED)',
        run: async (runId) => this.fx.createUser({ runId, status: UserStatus.DISABLED, login: false }),
      },
      {
        name: 'admin-user',
        description: 'Administrador propio de la ejecución (no compartido con otras suites)',
        run: async (runId) => this.fx.createUser({ runId, role: Role.ADMIN, withAddress: false }),
      },
      {
        name: 'password-reset',
        description: 'Usuario con un token de recuperación de contraseña válido',
        run: async (runId) => {
          const u = await this.fx.createUser({ runId, login: false });
          return { ...u, reset: await this.fx.passwordResetToken(u.credentials.email) };
        },
      },
      {
        name: 'expired-session',
        description: 'Usuario con tokens de una sesión ya caducada (access y refresh devuelven 401 SESSION_EXPIRED)',
        run: async (runId) => {
          const u = await this.fx.createUser({ runId });
          await this.fx.expireSessions({ userId: u.user.id }, 'expire');
          return u;
        },
      },
      {
        name: 'short-lived-token',
        description: 'Usuario con un access token que caduca en 5 segundos (renovación con refresh token)',
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
