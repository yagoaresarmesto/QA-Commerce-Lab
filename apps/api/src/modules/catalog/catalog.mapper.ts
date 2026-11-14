import { Brand, Category, Prisma, Product, ProductImage } from '@prisma/client';
import { discountPercent } from '../../common/utils/money';
import {
  Availability,
  BrandRefDto,
  CategoryRefDto,
  ProductDetailDto,
  ProductSpecDto,
  ProductSummaryDto,
} from './dto/product.dto';

export const LOW_STOCK_THRESHOLD = 5;
export const NEW_PRODUCT_DAYS = 30;
export const MAX_QUANTITY_PER_PRODUCT = 10;

export const productSummaryInclude = {
  brand: true,
  category: true,
  images: { orderBy: { position: 'asc' }, take: 1 },
} satisfies Prisma.ProductInclude;

export type ProductWithRelations = Product & { brand: Brand; category: Category; images: ProductImage[] };

export function availabilityOf(p: Pick<Product, 'isActive' | 'stock'>): Availability {
  if (!p.isActive) return 'DISCONTINUED';
  if (p.stock <= 0) return 'OUT_OF_STOCK';
  if (p.stock <= LOW_STOCK_THRESHOLD) return 'LOW_STOCK';
  return 'IN_STOCK';
}

export function brandRef(b: Brand): BrandRefDto {
  return { id: b.id, slug: b.slug, name: b.name };
}

export function categoryRef(c: Category): CategoryRefDto {
  return { id: c.id, slug: c.slug, name: c.name };
}

export function fallbackImage(categorySlug: string): string {
  return `/api/media/products/${categorySlug}.svg`;
}

export function toProductSummary(p: ProductWithRelations): ProductSummaryDto {
  return {
    id: p.id,
    sku: p.sku,
    slug: p.slug,
    name: p.name,
    shortDescription: p.shortDescription,
    brand: brandRef(p.brand),
    category: categoryRef(p.category),
    priceCents: p.priceCents,
    compareAtPriceCents: p.compareAtPriceCents,
    discountPercent: discountPercent(p.priceCents, p.compareAtPriceCents),
    stock: p.stock,
    availability: availabilityOf(p),
    isActive: p.isActive,
    isFeatured: p.isFeatured,
    isNew: Date.now() - p.createdAt.getTime() < NEW_PRODUCT_DAYS * 86_400_000,
    imageUrl: p.images[0]?.url ?? fallbackImage(p.category.slug),
    ratingAvg: Math.round(p.ratingAvg * 10) / 10,
    ratingCount: p.ratingCount,
    salesCount: p.salesCount,
    createdAt: p.createdAt,
  };
}

export function toProductDetail(
  p: Product & { brand: Brand; category: Category & { parent: Category | null }; images: ProductImage[] },
): ProductDetailDto {
  const summary = toProductSummary(p);
  const specs = Array.isArray(p.specs) ? (p.specs as unknown as ProductSpecDto[]) : [];
  const path: CategoryRefDto[] = [];
  if (p.category.parent) path.push(categoryRef(p.category.parent));
  path.push(categoryRef(p.category));
  return {
    ...summary,
    description: p.description,
    specs,
    images: p.images.length
      ? p.images.map((i) => ({ url: i.url, alt: i.alt, position: i.position }))
      : [{ url: fallbackImage(p.category.slug), alt: p.name, position: 0 }],
    categoryPath: path,
    maxQuantityPerOrder: MAX_QUANTITY_PER_PRODUCT,
    updatedAt: p.updatedAt,
  };
}

/** Text indexed by the search engine (lower-case, without accents). */
export function buildSearchText(parts: Array<string | null | undefined>): string {
  return normalizeSearch(parts.filter(Boolean).join(' '));
}

export function normalizeSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}
