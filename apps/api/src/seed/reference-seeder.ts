import {
  ActorType,
  BannerPlacement,
  CouponType,
  OrderPaymentStatus,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  PrismaClient,
  Role,
  UserStatus,
} from '@prisma/client';
import { hashPassword } from '../common/utils/crypto';
import { discountPercent, vatIncluded } from '../common/utils/money';
import { slugify } from '../common/utils/text';
import { buildSearchText } from '../modules/catalog/catalog.mapper';
import { CATEGORY_KIND } from '../modules/media/illustrations';
import { BANNERS, BRANDS, CATEGORIES, PICKUP_POINTS, PRODUCTS, SHIPPING_METHODS } from './data/catalog.data';
import {
  ADMIN_PASSWORD,
  COUPONS,
  CUSTOMER_PASSWORD,
  DEFAULT_ADDRESS_INDEX,
  FAVORITE_SKUS,
  REFERENCE_USERS,
  REVIEWERS,
  REVIEW_TEMPLATES,
  USER_ADDRESSES,
} from './data/people.data';

const DAY = 86_400_000;

export const SKU_PREFIX: Record<string, string> = {
  laptops: 'LAP',
  desktops: 'DSK',
  'graphics-cards': 'GPU',
  processors: 'CPU',
  motherboards: 'MBD',
  memory: 'RAM',
  'ssd-storage': 'SSD',
  monitors: 'MON',
  keyboards: 'KBD',
  mice: 'MOU',
  headphones: 'AUD',
  smartphones: 'PHN',
  tablets: 'TAB',
  accessories: 'ACC',
};

/** Documented special inventory states (see docs/TESTING.md) */
export const STOCK_OVERRIDES: Record<string, number> = {
  // out of stock
  'QCL-GPU-003': 0, 'QCL-LAP-006': 0, 'QCL-CPU-010': 0, 'QCL-MON-007': 0,
  'QCL-PHN-010': 0, 'QCL-TAB-006': 0, 'QCL-AUD-008': 0, 'QCL-KBD-010': 0,
  // a single unit left
  'QCL-GPU-006': 1, 'QCL-LAP-004': 1, 'QCL-SSD-007': 1, 'QCL-PHN-003': 1,
  // low stock (2-5)
  'QCL-GPU-005': 3, 'QCL-CPU-005': 2, 'QCL-MON-003': 4, 'QCL-DSK-003': 2,
  'QCL-TAB-012': 5, 'QCL-MBD-001': 3, 'QCL-RAM-008': 4, 'QCL-AUD-002': 5,
};

/** Discontinued products (isActive = false) */
export const DISCONTINUED_SKUS = ['QCL-DSK-010', 'QCL-RAM-004', 'QCL-MOU-001', 'QCL-PHN-005'];

export const FEATURED_SKUS = [
  'QCL-LAP-001', 'QCL-LAP-005', 'QCL-DSK-001', 'QCL-GPU-002', 'QCL-GPU-009', 'QCL-CPU-004', 'QCL-CPU-010', 'QCL-MBD-005',
  'QCL-RAM-002', 'QCL-SSD-004', 'QCL-MON-002', 'QCL-KBD-001', 'QCL-MOU-005', 'QCL-AUD-001', 'QCL-PHN-002', 'QCL-TAB-002',
];

/** Small deterministic PRNG (mulberry32) seeded from a string. */
export function rng(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SeedProduct {
  sku: string;
  slug: string;
  name: string;
  brand: string;
  categorySlug: string;
  categoryName: string;
  shortDescription: string;
  description: string;
  priceCents: number;
  compareAtPriceCents: number | null;
  stock: number;
  isActive: boolean;
  isFeatured: boolean;
  salesCount: number;
  ageDays: number;
  specs: Array<{ name: string; value: string }>;
  images: string[];
}

/** Builds the full, deterministic reference product list (same output on every call). */
export function buildSeedProducts(): SeedProduct[] {
  const out: SeedProduct[] = [];
  let index = 0;
  for (const cat of CATEGORIES) {
    const defs = PRODUCTS[cat.slug];
    if (!defs) continue;
    defs.forEach(([brand, name, price, short, specs], i) => {
      const sku = `QCL-${SKU_PREFIX[cat.slug]}-${String(i + 1).padStart(3, '0')}`;
      const r = rng(sku);
      const priceCents = price * 100 - 1;
      const onSale = r() < 0.34 || ['QCL-GPU-002', 'QCL-LAP-005', 'QCL-PHN-002', 'QCL-MON-002'].includes(sku);
      const pct = 5 + Math.floor(r() * 26);
      const compareAtPriceCents = onSale ? Math.round((price * (100 + pct)) / 100) * 100 - 1 : null;
      const stock = STOCK_OVERRIDES[sku] ?? 8 + Math.floor(r() * 140);
      const featured = FEATURED_SKUS.includes(sku);
      const color = BRANDS[brand];
      const kind = CATEGORY_KIND[cat.slug];
      const specList = Object.entries(specs).map(([n, v]) => ({ name: n, value: v }));
      const highlights = specList.slice(0, 4).map((s) => `${s.name}: ${s.value}`).join(', ');
      out.push({
        sku,
        slug: slugify(name),
        name,
        brand,
        categorySlug: cat.slug,
        categoryName: cat.name,
        shortDescription: short,
        description:
          `${name} by ${brand}. ${short}. ` +
          `Key features: ${highlights}. ` +
          `Brand-new product with a 3-year warranty, VAT included and free returns within 14 days.`,
        priceCents,
        compareAtPriceCents: compareAtPriceCents && compareAtPriceCents > priceCents ? compareAtPriceCents : null,
        stock,
        isActive: !DISCONTINUED_SKUS.includes(sku),
        isFeatured: featured,
        salesCount: Math.floor(r() * 380) + (featured ? 140 : 0),
        ageDays: (index * 7919) % 200,
        specs: specList,
        images: [0, 1, 2].map(
          (v) => `/api/media/products/${kind}.svg?c=${color}&v=${v}&bg=0&label=${encodeURIComponent(brand)}`,
        ),
      });
      index++;
    });
  }
  return out;
}

export interface SeedSummary {
  categories: number;
  brands: number;
  products: number;
  users: number;
  coupons: number;
  orders: number;
  reviews: number;
  durationMs: number;
}

/**
 * Seeds / restores the reference dataset with upserts keyed by natural keys
 * (slug, name, sku, code, email). On an empty database (after a global reset) the inserts
 * happen in a fixed order, so the generated IDs are always the same.
 * Data created by automation runs (testRunId) is left untouched.
 */
export class ReferenceSeeder {
  constructor(private readonly prisma: PrismaClient) {}

  async truncateAll(): Promise<void> {
    const tables = await this.prisma.$queryRaw<Array<{ tablename: string }>>`
      SELECT tablename FROM pg_tables WHERE schemaname = current_schema() AND tablename <> '_prisma_migrations'`;
    if (!tables.length) return;
    const list = tables.map((t) => `"${t.tablename}"`).join(', ');
    await this.prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
  }

  async reset(): Promise<SeedSummary> {
    await this.truncateAll();
    return this.seed();
  }

  async seed(now = new Date()): Promise<SeedSummary> {
    const started = Date.now();
    const at = (days: number, hours = 0) => new Date(now.getTime() + days * DAY + hours * 3_600_000);

    // ── Categories, brands, shipping, pickup points, banners
    const categoryIds = new Map<string, number>();
    for (const [position, c] of CATEGORIES.entries()) {
      const data = {
        name: c.name,
        description: c.description,
        icon: c.icon,
        position,
        parentId: c.parent ? categoryIds.get(c.parent)! : null,
      };
      const row = await this.prisma.category.upsert({ where: { slug: c.slug }, create: { slug: c.slug, ...data }, update: data });
      categoryIds.set(c.slug, row.id);
    }
    const brandIds = new Map<string, number>();
    for (const name of Object.keys(BRANDS)) {
      const row = await this.prisma.brand.upsert({ where: { name }, create: { name, slug: slugify(name) }, update: { slug: slugify(name) } });
      brandIds.set(name, row.id);
    }
    for (const [position, [code, name, description, priceCents, freeOverCents, minDays, maxDays, requiresPickupPoint]] of SHIPPING_METHODS.entries()) {
      const data = { name, description, priceCents, freeOverCents, minDays, maxDays, requiresPickupPoint, isActive: true, position };
      await this.prisma.shippingMethod.upsert({ where: { code }, create: { code, ...data }, update: data });
    }
    for (const [code, name, address, city, province, postalCode] of PICKUP_POINTS) {
      const data = { name, address, city, province, postalCode, openingHours: 'L-V 9:00-21:00 · S 10:00-14:00', isActive: true };
      await this.prisma.pickupPoint.upsert({ where: { code }, create: { code, ...data }, update: data });
    }
    await this.prisma.banner.deleteMany({});
    await this.prisma.banner.createMany({
      data: BANNERS.map(([placement, title, subtitle, ctaLabel, ctaHref, theme, imageKind], position) => ({
        placement: placement as BannerPlacement,
        title,
        subtitle,
        ctaLabel,
        ctaHref,
        theme,
        imageKind,
        position,
      })),
    });

    // ── Products
    const products = buildSeedProducts();
    const productIds = new Map<string, number>();
    for (const p of products) {
      const data = {
        slug: p.slug,
        name: p.name,
        shortDescription: p.shortDescription,
        description: p.description,
        brandId: brandIds.get(p.brand)!,
        categoryId: categoryIds.get(p.categorySlug)!,
        priceCents: p.priceCents,
        compareAtPriceCents: p.compareAtPriceCents,
        discountPercent: discountPercent(p.priceCents, p.compareAtPriceCents),
        stock: p.stock,
        isActive: p.isActive,
        isFeatured: p.isFeatured,
        specs: p.specs as unknown as Prisma.InputJsonValue,
        searchText: buildSearchText([p.name, p.brand, p.categoryName, p.sku]),
        salesCount: p.salesCount,
        isReference: true,
        testRunId: null,
        createdAt: at(-p.ageDays, -(p.sku.charCodeAt(p.sku.length - 1) % 12)),
      };
      const row = await this.prisma.product.upsert({ where: { sku: p.sku }, create: { sku: p.sku, ...data }, update: data });
      productIds.set(p.sku, row.id);
      await this.prisma.productImage.deleteMany({ where: { productId: row.id } });
      await this.prisma.productImage.createMany({
        data: p.images.map((url, position) => ({ productId: row.id, url, alt: `${p.name} - imagen ${position + 1}`, position })),
      });
    }

    // Brands no longer present in the reference catalog and without products are removed
    await this.prisma.brand.deleteMany({ where: { name: { notIn: Object.keys(BRANDS) }, products: { none: {} } } });

    // ── Coupons
    for (const [code, description, type, value, minSubtotalCents, maxDiscountCents, categorySlug, startsOffset, expiresOffset, usageLimit, perUserLimit, isActive] of COUPONS) {
      const data = {
        description,
        type: type as CouponType,
        value,
        minSubtotalCents,
        maxDiscountCents,
        categoryId: categorySlug ? categoryIds.get(categorySlug)! : null,
        startsAt: startsOffset === null ? null : at(startsOffset),
        expiresAt: expiresOffset === null ? null : at(expiresOffset),
        usageLimit,
        perUserLimit,
        isActive,
        isReference: true,
        testRunId: null,
      };
      await this.prisma.coupon.upsert({ where: { code }, create: { code, timesUsed: 0, ...data }, update: data });
    }

    // ── Reference users (their data is wiped and recreated)
    const [adminHash, customerHash] = await Promise.all([hashPassword(ADMIN_PASSWORD), hashPassword(CUSTOMER_PASSWORD)]);
    const userIds = new Map<string, number>();
    for (const [i, u] of [...REFERENCE_USERS, ...REVIEWERS].entries()) {
      const data = {
        firstName: u.firstName,
        lastName: u.lastName,
        phone: u.phone ?? null,
        role: u.role as Role,
        status: u.status as UserStatus,
        passwordHash: u.role === 'ADMIN' ? adminHash : customerHash,
        marketingOptIn: false,
        isReference: true,
        testRunId: null,
        lastLoginAt: null,
        createdAt: at(-400 + i * 3),
      };
      const row = await this.prisma.user.upsert({ where: { email: u.email }, create: { email: u.email, ...data }, update: data });
      userIds.set(u.key, row.id);
    }
    const refIds = [...userIds.values()];
    await this.prisma.$transaction([
      this.prisma.order.deleteMany({ where: { userId: { in: refIds } } }),
      this.prisma.session.deleteMany({ where: { userId: { in: refIds } } }),
      this.prisma.passwordResetToken.deleteMany({ where: { userId: { in: refIds } } }),
      this.prisma.address.deleteMany({ where: { userId: { in: refIds } } }),
      this.prisma.cart.deleteMany({ where: { userId: { in: refIds } } }),
      this.prisma.favorite.deleteMany({ where: { userId: { in: refIds } } }),
      this.prisma.review.deleteMany({ where: { userId: { in: refIds } } }),
    ]);

    for (const [key, list] of Object.entries(USER_ADDRESSES)) {
      for (const [i, [label, fullName, phone, line1, line2, city, province, postalCode]] of list.entries()) {
        await this.prisma.address.create({
          data: {
            userId: userIds.get(key)!,
            label,
            fullName,
            phone,
            line1,
            line2,
            city,
            province,
            postalCode,
            country: 'ES',
            isDefault: DEFAULT_ADDRESS_INDEX[key] === i,
            createdAt: at(-300 + i),
          },
        });
      }
    }
    for (const [i, sku] of FAVORITE_SKUS.entries()) {
      await this.prisma.favorite.create({
        data: { userId: userIds.get('favorites')!, productId: productIds.get(sku)!, createdAt: at(-20 + i) },
      });
    }

    const orders = await this.seedOrders(userIds.get('orders')!, productIds, at);
    const reviews = await this.seedReviews(products, productIds, REVIEWERS.map((r) => userIds.get(r.key)!), now);

    // ── Derived counters that must stay consistent with existing (run-scoped) data
    for (const [code, , , , , , , , , , , , artificial] of COUPONS) {
      const coupon = await this.prisma.coupon.findUniqueOrThrow({ where: { code } });
      const redemptions = await this.prisma.couponRedemption.count({ where: { couponId: coupon.id } });
      await this.prisma.coupon.update({ where: { id: coupon.id }, data: { timesUsed: artificial + redemptions } });
    }
    for (const p of products) {
      const extra = await this.prisma.orderItem.aggregate({
        where: {
          productId: productIds.get(p.sku)!,
          order: { isReference: false, status: { in: [OrderStatus.PAID, OrderStatus.PREPARING, OrderStatus.SHIPPED, OrderStatus.DELIVERED, OrderStatus.RETURN_REQUESTED] } },
        },
        _sum: { quantity: true },
      });
      if (extra._sum.quantity) {
        await this.prisma.product.update({
          where: { id: productIds.get(p.sku)! },
          data: { salesCount: p.salesCount + extra._sum.quantity },
        });
      }
    }
    await this.prisma.$executeRaw`
      UPDATE "Product" p SET "ratingAvg" = COALESCE(r.avg, 0), "ratingCount" = COALESCE(r.cnt, 0)
      FROM (SELECT p2.id, AVG(rv.rating)::float AS avg, COUNT(rv.id)::int AS cnt
            FROM "Product" p2 LEFT JOIN "Review" rv ON rv."productId" = p2.id GROUP BY p2.id) r
      WHERE r.id = p.id`;

    return {
      categories: CATEGORIES.length,
      brands: brandIds.size,
      products: products.length,
      users: userIds.size,
      coupons: COUPONS.length,
      orders,
      reviews,
      durationMs: Date.now() - started,
    };
  }

  private async seedReviews(products: ReturnType<typeof buildSeedProducts>, productIds: Map<string, number>, reviewerIds: number[], now: Date): Promise<number> {
    const rows: Prisma.ReviewCreateManyInput[] = [];
    products.forEach((p, index) => {
      const r = rng(`reviews:${p.sku}`);
      const count = index % 9 === 4 ? 0 : 1 + Math.floor(r() * 6);
      const quality = 3.1 + r() * 1.9;
      for (let k = 0; k < count; k++) {
        const rating = Math.max(1, Math.min(5, Math.round(quality + (r() - 0.5) * 2.2)));
        const templates = REVIEW_TEMPLATES[rating];
        const [title, comment] = templates[Math.floor(r() * templates.length)];
        const created = new Date(now.getTime() - Math.floor(r() * Math.max(1, p.ageDays)) * DAY - (k + 1) * 3_600_000);
        rows.push({
          userId: reviewerIds[(index + k * 5) % reviewerIds.length],
          productId: productIds.get(p.sku)!,
          rating,
          title,
          comment,
          isVerifiedPurchase: r() < 0.65,
          createdAt: created,
          updatedAt: created,
        });
      }
    });
    await this.prisma.review.createMany({ data: rows });
    return rows.length;
  }

  /** Orders of orders@qacommerce.test covering every status (deterministic timeline). */
  private async seedOrders(userId: number, productIds: Map<string, number>, at: (d: number, h?: number) => Date): Promise<number> {
    const address = await this.prisma.address.findFirstOrThrow({ where: { userId, isDefault: true } });
    const standard = await this.prisma.shippingMethod.findUniqueOrThrow({ where: { code: 'STANDARD' } });
    const express = await this.prisma.shippingMethod.findUniqueOrThrow({ where: { code: 'EXPRESS' } });
    const welcome = await this.prisma.coupon.findUniqueOrThrow({ where: { code: 'WELCOME10' } });
    type Spec = {
      n: number;
      status: OrderStatus;
      items: Array<[string, number]>;
      createdDaysAgo: number;
      method?: 'STANDARD' | 'EXPRESS';
      payment?: 'CARD' | 'BANK_TRANSFER';
      coupon?: boolean;
    };
    const specs: Spec[] = [
      { n: 1, status: OrderStatus.DELIVERED, items: [['QCL-LAP-007', 1], ['QCL-MOU-002', 1]], createdDaysAgo: 45, coupon: true },
      { n: 2, status: OrderStatus.DELIVERED, items: [['QCL-AUD-003', 1]], createdDaysAgo: 6 },
      { n: 3, status: OrderStatus.SHIPPED, items: [['QCL-MON-008', 1], ['QCL-ACC-003', 2]], createdDaysAgo: 3, method: 'EXPRESS' },
      { n: 4, status: OrderStatus.PREPARING, items: [['QCL-SSD-002', 2]], createdDaysAgo: 2 },
      { n: 5, status: OrderStatus.PAID, items: [['QCL-KBD-001', 1]], createdDaysAgo: 1 },
      { n: 6, status: OrderStatus.PENDING, items: [['QCL-TAB-001', 1]], createdDaysAgo: 0, payment: 'BANK_TRANSFER' },
      { n: 7, status: OrderStatus.CANCELLED, items: [['QCL-PHN-004', 1]], createdDaysAgo: 20 },
      { n: 8, status: OrderStatus.RETURN_REQUESTED, items: [['QCL-AUD-006', 1]], createdDaysAgo: 9 },
      { n: 9, status: OrderStatus.RETURNED, items: [['QCL-ACC-008', 1]], createdDaysAgo: 30 },
    ];
    const products = await this.prisma.product.findMany({
      where: { sku: { in: specs.flatMap((s) => s.items.map(([sku]) => sku)) } },
      include: { brand: true, images: { orderBy: { position: 'asc' }, take: 1 } },
    });
    for (const s of specs) {
      const method = s.method === 'EXPRESS' ? express : standard;
      const lines = s.items.map(([sku, qty]) => {
        const p = products.find((x) => x.sku === sku)!;
        return { p, qty, total: p.priceCents * qty };
      });
      const subtotal = lines.reduce((acc, l) => acc + l.total, 0);
      const discount = s.coupon ? Math.round(subtotal * 0.1) : 0;
      const shipping = method.freeOverCents !== null && subtotal - discount >= method.freeOverCents ? 0 : method.priceCents;
      const total = subtotal - discount + shipping;
      const created = at(-s.createdDaysAgo, -2);
      const step = (h: number) => new Date(created.getTime() + h * 3_600_000);
      const reached = (target: OrderStatus) => {
        const flow: OrderStatus[] = [OrderStatus.PAID, OrderStatus.PREPARING, OrderStatus.SHIPPED, OrderStatus.DELIVERED, OrderStatus.RETURN_REQUESTED, OrderStatus.RETURNED];
        if (s.status === OrderStatus.CANCELLED) return target === OrderStatus.PAID;
        return flow.indexOf(target) <= flow.indexOf(s.status) && flow.indexOf(s.status) >= 0;
      };
      const history: Prisma.OrderStatusHistoryCreateWithoutOrderInput[] = [
        { fromStatus: null, toStatus: OrderStatus.PENDING, actorType: ActorType.CUSTOMER, actorUserId: userId, note: 'Order created', createdAt: created },
      ];
      let prev: OrderStatus = OrderStatus.PENDING;
      const push = (to: OrderStatus, h: number, actor: ActorType, note?: string) => {
        history.push({ fromStatus: prev, toStatus: to, actorType: actor, note: note ?? null, createdAt: step(h) });
        prev = to;
      };
      const paid = reached(OrderStatus.PAID);
      if (paid) push(OrderStatus.PAID, 0.1, ActorType.SYSTEM, 'Card payment VISA ****4242');
      if (reached(OrderStatus.PREPARING)) push(OrderStatus.PREPARING, 5, ActorType.ADMIN);
      if (reached(OrderStatus.SHIPPED)) push(OrderStatus.SHIPPED, 20, ActorType.ADMIN);
      if (reached(OrderStatus.DELIVERED)) push(OrderStatus.DELIVERED, 44, ActorType.ADMIN);
      if (reached(OrderStatus.RETURN_REQUESTED)) push(OrderStatus.RETURN_REQUESTED, 70, ActorType.CUSTOMER, 'The product does not meet my expectations');
      if (reached(OrderStatus.RETURNED)) push(OrderStatus.RETURNED, 120, ActorType.ADMIN);
      if (s.status === OrderStatus.CANCELLED) push(OrderStatus.CANCELLED, 3, ActorType.CUSTOMER, 'I found a better option');

      const refunded = s.status === OrderStatus.CANCELLED || s.status === OrderStatus.RETURNED;
      const isTransfer = s.payment === 'BANK_TRANSFER';
      const order = await this.prisma.order.create({
        data: {
          orderNumber: `QCL-SEED-${String(s.n).padStart(4, '0')}`,
          userId,
          status: s.status,
          paymentStatus: isTransfer ? OrderPaymentStatus.AWAITING_PAYMENT : refunded ? OrderPaymentStatus.REFUNDED : OrderPaymentStatus.PAID,
          paymentMethod: isTransfer ? PaymentMethod.BANK_TRANSFER : PaymentMethod.CARD,
          shippingMethodId: method.id,
          shippingMethodCode: method.code,
          shippingMethodName: method.name,
          shippingAddress: {
            fullName: address.fullName,
            phone: address.phone,
            line1: address.line1,
            line2: address.line2,
            city: address.city,
            province: address.province,
            postalCode: address.postalCode,
            country: address.country,
          },
          subtotalCents: subtotal,
          discountCents: discount,
          shippingCents: shipping,
          taxCents: vatIncluded(total),
          totalCents: total,
          couponId: s.coupon ? welcome.id : null,
          couponCode: s.coupon ? welcome.code : null,
          trackingNumber: reached(OrderStatus.SHIPPED) ? `TRKSEED${String(s.n).padStart(5, '0')}` : null,
          reservationExpiresAt: isTransfer ? at(3) : null,
          paidAt: paid ? step(0.1) : null,
          preparingAt: reached(OrderStatus.PREPARING) ? step(5) : null,
          shippedAt: reached(OrderStatus.SHIPPED) ? step(20) : null,
          deliveredAt: reached(OrderStatus.DELIVERED) ? step(44) : null,
          returnRequestedAt: reached(OrderStatus.RETURN_REQUESTED) ? step(70) : null,
          returnReason: reached(OrderStatus.RETURN_REQUESTED) ? 'The product does not meet my expectations' : null,
          returnedAt: reached(OrderStatus.RETURNED) ? step(120) : null,
          cancelledAt: s.status === OrderStatus.CANCELLED ? step(3) : null,
          cancelReason: s.status === OrderStatus.CANCELLED ? 'I found a better option' : null,
          isReference: true,
          stockReserved: !refunded,
          createdAt: created,
          items: {
            create: lines.map((l) => ({
              productId: l.p.id,
              sku: l.p.sku,
              name: l.p.name,
              brandName: l.p.brand.name,
              imageUrl: l.p.images[0]?.url ?? null,
              unitPriceCents: l.p.priceCents,
              compareAtPriceCents: l.p.compareAtPriceCents,
              quantity: l.qty,
              lineTotalCents: l.total,
            })),
          },
          history: { create: history },
          payments: {
            create: isTransfer
              ? [{ method: PaymentMethod.BANK_TRANSFER, status: PaymentStatus.PENDING, amountCents: total, scenario: 'BANK_TRANSFER', providerReference: `TRF-SEED-${s.n}`, createdAt: created }]
              : [{
                  method: PaymentMethod.CARD,
                  status: refunded ? PaymentStatus.REFUNDED : PaymentStatus.APPROVED,
                  amountCents: total,
                  scenario: 'APPROVED',
                  cardBrand: 'VISA',
                  cardLast4: '4242',
                  cardHolder: 'JAVIER RUIZ',
                  providerReference: `PAY-SEED-${s.n}`,
                  createdAt: created,
                  resolvedAt: step(0.1),
                  refundedAt: refunded ? step(s.status === OrderStatus.RETURNED ? 120 : 3) : null,
                }],
          },
        },
      });
      if (s.coupon) await this.prisma.couponRedemption.create({ data: { couponId: welcome.id, userId, orderId: order.id, createdAt: created } });
    }
    return specs.length;
  }
}
