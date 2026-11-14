import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { pageMeta } from '../../common/dto/pagination.dto';
import { ErrorCode, badRequest, notFound } from '../../common/errors';
import { PrismaService } from '../../prisma/prisma.service';
import { catalogVisibilityScope } from './catalog-scope';
import { CategoriesService } from './categories.service';
import {
  fallbackImage,
  normalizeSearch,
  productSummaryInclude,
  toProductDetail,
  toProductSummary,
} from './catalog.mapper';
import {
  ProductDetailDto,
  ProductFacetsDto,
  ProductListQueryDto,
  ProductListResponseDto,
  ProductSort,
  ProductSummaryDto,
  SuggestionsResponseDto,
} from './dto/product.dto';

type Where = Prisma.ProductWhereInput;

export function orderByFor(sort: ProductSort | undefined): Prisma.ProductOrderByWithRelationInput[] {
  // `id asc` is always the final tie-breaker so pagination is stable and deterministic.
  switch (sort) {
    case 'price_asc':
      return [{ priceCents: 'asc' }, { id: 'asc' }];
    case 'price_desc':
      return [{ priceCents: 'desc' }, { id: 'asc' }];
    case 'popularity':
      return [{ salesCount: 'desc' }, { id: 'asc' }];
    case 'rating':
      return [{ ratingAvg: 'desc' }, { ratingCount: 'desc' }, { id: 'asc' }];
    case 'newest':
      return [{ createdAt: 'desc' }, { id: 'desc' }];
    case 'discount':
      return [{ discountPercent: 'desc' }, { id: 'asc' }];
    case 'name_asc':
      return [{ name: 'asc' }, { id: 'asc' }];
    case 'relevance':
    default:
      return [{ isFeatured: 'desc' }, { salesCount: 'desc' }, { id: 'asc' }];
  }
}

export function searchTerms(q: string | undefined): string[] {
  if (!q) return [];
  return normalizeSearch(q)
    .split(' ')
    .filter((t) => t.length > 0)
    .slice(0, 8);
}

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly categories: CategoriesService,
  ) {}

  async list(query: ProductListQueryDto): Promise<ProductListResponseDto> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 24;
    if (query.minPriceCents !== undefined && query.maxPriceCents !== undefined && query.minPriceCents > query.maxPriceCents) {
      throw badRequest(ErrorCode.VALIDATION_ERROR, 'El precio mínimo no puede ser mayor que el máximo', [
        { field: 'minPriceCents', message: 'minPriceCents debe ser menor o igual que maxPriceCents' },
      ]);
    }

    const categoryIds = query.category ? await this.categories.resolveIds(query.category) : undefined;
    const brandSlugs = query.brand
      ?.split(',')
      .map((b) => b.trim().toLowerCase())
      .filter(Boolean);

    const filters = {
      base: {
        isActive: true,
        ...catalogVisibilityScope(),
        ...(searchTerms(query.q).length ? { AND: searchTerms(query.q).map((t) => ({ searchText: { contains: t } })) } : {}),
      } as Where,
      category: (categoryIds ? { categoryId: { in: categoryIds } } : {}) as Where,
      brand: (brandSlugs?.length ? { brand: { slug: { in: brandSlugs } } } : {}) as Where,
      price: (query.minPriceCents !== undefined || query.maxPriceCents !== undefined
        ? { priceCents: { gte: query.minPriceCents, lte: query.maxPriceCents } }
        : {}) as Where,
      stock: (query.inStock ? { stock: { gt: 0 } } : {}) as Where,
      sale: (query.onSale ? { compareAtPriceCents: { not: null }, discountPercent: { gt: 0 } } : {}) as Where,
      featured: (query.featured ? { isFeatured: true } : {}) as Where,
      rating: (query.minRating ? { ratingAvg: { gte: query.minRating } } : {}) as Where,
    };
    type Key = keyof typeof filters;
    const whereExcept = (...excluded: Key[]): Where => ({
      AND: (Object.keys(filters) as Key[]).filter((k) => !excluded.includes(k)).map((k) => filters[k]),
    });
    const where = whereExcept();

    const [total, rows, facets] = await Promise.all([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        include: productSummaryInclude,
        orderBy: orderByFor(query.sort),
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.facets(where, whereExcept),
    ]);

    return { data: rows.map(toProductSummary), meta: pageMeta(page, pageSize, total), facets };
  }

  private async facets(where: Where, whereExcept: (...k: Array<'brand' | 'price' | 'stock' | 'sale'>) => Where): Promise<ProductFacetsDto> {
    const [brandGroups, categoryGroups, price, inStockCount, onSaleCount] = await Promise.all([
      this.prisma.product.groupBy({ by: ['brandId'], where: whereExcept('brand'), _count: { _all: true } }),
      this.prisma.product.groupBy({ by: ['categoryId'], where, _count: { _all: true } }),
      this.prisma.product.aggregate({ where: whereExcept('price'), _min: { priceCents: true }, _max: { priceCents: true } }),
      this.prisma.product.count({ where: { AND: [whereExcept('stock'), { stock: { gt: 0 } }] } }),
      this.prisma.product.count({ where: { AND: [whereExcept('sale'), { discountPercent: { gt: 0 } }] } }),
    ]);
    const [brands, categories] = await Promise.all([
      this.prisma.brand.findMany({ where: { id: { in: brandGroups.map((b) => b.brandId) } } }),
      this.prisma.category.findMany({ where: { id: { in: categoryGroups.map((c) => c.categoryId) } } }),
    ]);
    return {
      brands: brandGroups
        .map((g) => {
          const b = brands.find((x) => x.id === g.brandId)!;
          return { slug: b.slug, name: b.name, count: g._count._all };
        })
        .sort((a, b) => a.name.localeCompare(b.name)),
      categories: categoryGroups
        .map((g) => {
          const c = categories.find((x) => x.id === g.categoryId)!;
          return { slug: c.slug, name: c.name, count: g._count._all };
        })
        .sort((a, b) => a.name.localeCompare(b.name)),
      priceRange: { minCents: price._min.priceCents ?? 0, maxCents: price._max.priceCents ?? 0 },
      inStockCount,
      onSaleCount,
    };
  }

  async findOne(idOrSlug: string): Promise<ProductDetailDto> {
    const where: Where = /^\d+$/.test(idOrSlug) ? { id: Number(idOrSlug) } : { slug: idOrSlug };
    const product = await this.prisma.product.findFirst({
      where,
      include: { brand: true, category: { include: { parent: true } }, images: { orderBy: { position: 'asc' } } },
    });
    if (!product) throw notFound(ErrorCode.PRODUCT_NOT_FOUND, 'Producto no encontrado');
    return toProductDetail(product);
  }

  async related(idOrSlug: string, limit = 8): Promise<ProductSummaryDto[]> {
    const product = await this.findOne(idOrSlug);
    const rows = await this.prisma.product.findMany({
      where: { isActive: true, categoryId: product.category.id, id: { not: product.id }, ...catalogVisibilityScope() },
      include: productSummaryInclude,
      orderBy: [{ salesCount: 'desc' }, { id: 'asc' }],
      take: limit,
    });
    return rows.map(toProductSummary);
  }

  async listSummaries(where: Where, orderBy: Prisma.ProductOrderByWithRelationInput[], take: number): Promise<ProductSummaryDto[]> {
    const rows = await this.prisma.product.findMany({
      where: { AND: [{ isActive: true }, catalogVisibilityScope(), where] },
      include: productSummaryInclude,
      orderBy,
      take,
    });
    return rows.map(toProductSummary);
  }

  async suggestions(q: string): Promise<SuggestionsResponseDto> {
    const terms = searchTerms(q);
    const normalized = normalizeSearch(q);
    const [products, categories, brands] = await Promise.all([
      this.prisma.product.findMany({
        where: { isActive: true, ...catalogVisibilityScope(), AND: terms.map((t) => ({ searchText: { contains: t } })) },
        include: productSummaryInclude,
        orderBy: [{ salesCount: 'desc' }, { id: 'asc' }],
        take: 6,
      }),
      this.prisma.category.findMany({ orderBy: { position: 'asc' } }),
      this.prisma.brand.findMany({ orderBy: { name: 'asc' } }),
    ]);
    return {
      products: products.map((p) => ({
        id: p.id,
        slug: p.slug,
        name: p.name,
        brandName: p.brand.name,
        priceCents: p.priceCents,
        imageUrl: p.images[0]?.url ?? fallbackImage(p.category.slug),
      })),
      categories: categories
        .filter((c) => normalizeSearch(c.name).includes(normalized))
        .slice(0, 3)
        .map((c) => ({ id: c.id, slug: c.slug, name: c.name })),
      brands: brands
        .filter((b) => normalizeSearch(b.name).includes(normalized))
        .slice(0, 3)
        .map((b) => ({ id: b.id, slug: b.slug, name: b.name })),
    };
  }
}
