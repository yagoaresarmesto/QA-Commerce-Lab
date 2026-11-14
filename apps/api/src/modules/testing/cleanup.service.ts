import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { recomputeProductRating } from '../engagement/engagement.service';
import { SALES_COUNTED_STATUSES } from '../orders/order-state-machine';
import { FaultsService } from './faults/faults.service';

export interface RunSummary {
  runId: string;
  users: number;
  products: number;
  coupons: number;
  orders: number;
  emails: number;
  faults: number;
}

/**
 * Per-run isolation: everything an automation run created can be listed and deleted
 * without touching reference data or other runs. Side effects on shared data
 * (stock and sales counters of reference products, coupon usage, ratings) are reverted.
 */
@Injectable()
export class CleanupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly faults: FaultsService,
  ) {}

  private userWhere(runId: string): Prisma.UserWhereInput {
    return {
      isReference: false,
      OR: [{ testRunId: runId }, ...(runId.length >= 6 ? [{ email: { contains: runId.toLowerCase() } }] : [])],
    };
  }

  async summary(runId: string): Promise<RunSummary> {
    const users = await this.prisma.user.findMany({ where: this.userWhere(runId), select: { id: true } });
    const userIds = users.map((u) => u.id);
    const [products, coupons, orders, emails] = await Promise.all([
      this.prisma.product.count({ where: { testRunId: runId } }),
      this.prisma.coupon.count({ where: { testRunId: runId } }),
      this.prisma.order.count({ where: { OR: [{ testRunId: runId }, { userId: { in: userIds } }] } }),
      this.prisma.emailMessage.count({ where: { testRunId: runId } }),
    ]);
    return { runId, users: users.length, products, coupons, orders, emails, faults: this.faults.list({ runId }).length };
  }

  async cleanup(runId: string): Promise<RunSummary> {
    const before = await this.summary(runId);
    await this.prisma.$transaction(
      async (tx) => {
        const users = await tx.user.findMany({ where: this.userWhere(runId), select: { id: true, email: true } });
        const userIds = users.map((u) => u.id);
        const runProducts = await tx.product.findMany({ where: { testRunId: runId }, select: { id: true } });
        const runProductIds = new Set(runProducts.map((p) => p.id));
        const runCoupons = await tx.coupon.findMany({ where: { testRunId: runId }, select: { id: true } });
        const runCouponIds = new Set(runCoupons.map((c) => c.id));

        const orders = await tx.order.findMany({
          where: { isReference: false, OR: [{ testRunId: runId }, { userId: { in: userIds } }] },
          include: { items: true, couponRedemption: true },
        });

        // Revert side effects on shared (non-run) products and coupons
        for (const order of orders) {
          const counted = SALES_COUNTED_STATUSES.includes(order.status);
          for (const item of order.items) {
            if (!item.productId || runProductIds.has(item.productId)) continue;
            if (!order.stockReserved && !counted) continue;
            await tx.product.updateMany({
              where: { id: item.productId },
              data: {
                ...(order.stockReserved ? { stock: { increment: item.quantity } } : {}),
                ...(counted ? { salesCount: { decrement: item.quantity } } : {}),
              },
            });
          }
          if (order.couponRedemption && !runCouponIds.has(order.couponRedemption.couponId)) {
            await tx.coupon.updateMany({
              where: { id: order.couponRedemption.couponId, timesUsed: { gt: 0 } },
              data: { timesUsed: { decrement: 1 } },
            });
          }
        }

        // Reviews written by run users on shared products → ratings must be recomputed
        const reviewed = await tx.review.findMany({ where: { userId: { in: userIds } }, select: { productId: true }, distinct: ['productId'] });

        await tx.order.deleteMany({ where: { id: { in: orders.map((o) => o.id) } } });
        await tx.emailMessage.deleteMany({
          where: { OR: [{ testRunId: runId }, { to: { in: users.map((u) => u.email) } }] },
        });
        await tx.user.deleteMany({ where: { id: { in: userIds } } });
        await tx.product.deleteMany({ where: { id: { in: [...runProductIds] } } });
        await tx.coupon.deleteMany({ where: { id: { in: [...runCouponIds] } } });

        for (const { productId } of reviewed) {
          if (!runProductIds.has(productId)) await recomputeProductRating(tx, productId);
        }
      },
      { timeout: 60_000, maxWait: 10_000 },
    );
    this.faults.clear({ runId });
    return before;
  }
}
