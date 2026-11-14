import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { pageMeta } from '../../common/dto/pagination.dto';
import { ErrorCode, conflict, notFound, unprocessable } from '../../common/errors';
import { RequestContext } from '../../common/request-context';
import { discountPercent } from '../../common/utils/money';
import { slugify } from '../../common/utils/text';
import { PrismaService, Tx } from '../../prisma/prisma.service';
import { buildSearchText, LOW_STOCK_THRESHOLD, normalizeSearch, toProductDetail } from '../catalog/catalog.mapper';
import { CATEGORY_KIND } from '../media/illustrations';
import { AdminProductDto, AdminProductListDto, AdminProductQueryDto, CreateProductDto, UpdateProductDto } from './dto/admin.dto';

const detailInclude = {
  brand: true,
  category: { include: { parent: true } },
  images: { orderBy: { position: 'asc' } },
} satisfies Prisma.ProductInclude;

export function illustrationUrl(categorySlug: string, color: string, variant: number, label: string): string {
  const kind = CATEGORY_KIND[categorySlug] ?? 'components';
  return `/api/media/products/${kind}.svg?c=${color}&v=${variant}&bg=0&label=${encodeURIComponent(label)}`;
}

@Injectable()
export class AdminCatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async list(q: AdminProductQueryDto): Promise<AdminProductListDto> {
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 20;
    const terms = q.q ? normalizeSearch(q.q).split(' ').filter(Boolean) : [];
    const where: Prisma.ProductWhereInput = {
      ...(terms.length ? { AND: terms.map((t) => ({ searchText: { contains: t } })) } : {}),
      ...(q.categoryId ? { OR: [{ categoryId: q.categoryId }, { category: { parentId: q.categoryId } }] } : {}),
      ...(q.status === 'active' ? { isActive: true } : q.status === 'inactive' ? { isActive: false } : {}),
      ...(q.stock === 'out'
        ? { stock: 0 }
        : q.stock === 'low'
          ? { stock: { gt: 0, lte: LOW_STOCK_THRESHOLD } }
          : q.stock === 'in'
            ? { stock: { gt: LOW_STOCK_THRESHOLD } }
            : {}),
    };
    const orderBy: Prisma.ProductOrderByWithRelationInput[] = {
      newest: [{ createdAt: 'desc' as const }, { id: 'desc' as const }],
      name: [{ name: 'asc' as const }, { id: 'asc' as const }],
      price_asc: [{ priceCents: 'asc' as const }, { id: 'asc' as const }],
      price_desc: [{ priceCents: 'desc' as const }, { id: 'asc' as const }],
      stock_asc: [{ stock: 'asc' as const }, { id: 'asc' as const }],
      stock_desc: [{ stock: 'desc' as const }, { id: 'asc' as const }],
      sales: [{ salesCount: 'desc' as const }, { id: 'asc' as const }],
    }[q.sort ?? 'newest'] ?? [{ id: 'asc' }];
    const [total, rows] = await Promise.all([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({ where, include: detailInclude, orderBy, skip: (page - 1) * pageSize, take: pageSize }),
    ]);
    return { data: rows.map((p) => this.toAdminDto(p)), meta: pageMeta(page, pageSize, total) };
  }

  async get(id: number): Promise<AdminProductDto> {
    const p = await this.prisma.product.findUnique({ where: { id }, include: detailInclude });
    if (!p) throw notFound(ErrorCode.PRODUCT_NOT_FOUND, 'Producto no encontrado');
    return this.toAdminDto(p);
  }

  private toAdminDto(p: Prisma.ProductGetPayload<{ include: typeof detailInclude }>): AdminProductDto {
    return { ...toProductDetail(p), isReference: p.isReference, testRunId: p.testRunId };
  }

  private async resolveRelations(db: Tx | PrismaService, brandId: number, categoryId: number) {
    const [brand, category] = await Promise.all([
      db.brand.findUnique({ where: { id: brandId } }),
      db.category.findUnique({ where: { id: categoryId }, include: { children: { select: { id: true } } } }),
    ]);
    if (!brand) throw notFound(ErrorCode.BRAND_NOT_FOUND, 'Marca no encontrada');
    if (!category) throw notFound(ErrorCode.CATEGORY_NOT_FOUND, 'Categoría no encontrada');
    if (category.children.length > 0) {
      throw unprocessable(ErrorCode.CATEGORY_NOT_ASSIGNABLE, 'Los productos deben asignarse a una subcategoría (categoría sin hijas)');
    }
    return { brand, category };
  }

  private assertPrices(price: number, compareAt: number | null | undefined): void {
    if (compareAt !== null && compareAt !== undefined && compareAt <= price) {
      throw unprocessable(ErrorCode.INVALID_PRICE, 'El precio anterior debe ser mayor que el precio actual', {
        priceCents: price,
        compareAtPriceCents: compareAt,
      });
    }
  }

  async create(dto: CreateProductDto, opts: { testRunId?: string | null; isReference?: boolean } = {}): Promise<AdminProductDto> {
    this.assertPrices(dto.priceCents, dto.compareAtPriceCents);
    const { brand, category } = await this.resolveRelations(this.prisma, dto.brandId, dto.categoryId);
    if (await this.prisma.product.findUnique({ where: { sku: dto.sku } })) {
      throw conflict(ErrorCode.SKU_ALREADY_EXISTS, `Ya existe un producto con el SKU ${dto.sku}`);
    }
    let slug = slugify(dto.name);
    if (await this.prisma.product.findUnique({ where: { slug } })) slug = `${slug}-${dto.sku.toLowerCase()}`;
    const color = (dto.imageColor ?? '6366f1').toLowerCase();
    const images = dto.imageUrls?.length
      ? dto.imageUrls
      : [0, 1].map((v) => illustrationUrl(category.slug, color, v, brand.name));
    const product = await this.prisma.product.create({
      data: {
        sku: dto.sku,
        slug,
        name: dto.name,
        brandId: brand.id,
        categoryId: category.id,
        shortDescription: dto.shortDescription,
        description: dto.description,
        priceCents: dto.priceCents,
        compareAtPriceCents: dto.compareAtPriceCents ?? null,
        discountPercent: discountPercent(dto.priceCents, dto.compareAtPriceCents),
        stock: dto.stock,
        isActive: dto.isActive ?? true,
        isFeatured: dto.isFeatured ?? false,
        specs: (dto.specs ?? []) as unknown as Prisma.InputJsonValue,
        searchText: buildSearchText([dto.name, brand.name, category.name, dto.sku]),
        isReference: opts.isReference ?? false,
        testRunId: opts.testRunId ?? RequestContext.testRunId() ?? null,
        images: { create: images.map((url, position) => ({ url, alt: `${dto.name} - imagen ${position + 1}`, position })) },
      },
      include: detailInclude,
    });
    return this.toAdminDto(product);
  }

  async update(id: number, dto: UpdateProductDto): Promise<AdminProductDto> {
    const current = await this.prisma.product.findUnique({ where: { id }, include: { brand: true, category: true } });
    if (!current) throw notFound(ErrorCode.PRODUCT_NOT_FOUND, 'Producto no encontrado');
    const price = dto.priceCents ?? current.priceCents;
    const compareAt = dto.compareAtPriceCents !== undefined ? dto.compareAtPriceCents : current.compareAtPriceCents;
    this.assertPrices(price, compareAt);
    const relations =
      dto.brandId || dto.categoryId
        ? await this.resolveRelations(this.prisma, dto.brandId ?? current.brandId, dto.categoryId ?? current.categoryId)
        : { brand: current.brand, category: current.category };
    const name = dto.name ?? current.name;
    const updated = await this.prisma.$transaction(async (tx) => {
      if (dto.imageUrls) {
        await tx.productImage.deleteMany({ where: { productId: id } });
        await tx.productImage.createMany({
          data: dto.imageUrls.map((url, position) => ({ productId: id, url, alt: `${name} - imagen ${position + 1}`, position })),
        });
      }
      return tx.product.update({
        where: { id },
        data: {
          name: dto.name,
          brandId: dto.brandId,
          categoryId: dto.categoryId,
          shortDescription: dto.shortDescription,
          description: dto.description,
          priceCents: dto.priceCents,
          compareAtPriceCents: dto.compareAtPriceCents,
          discountPercent: discountPercent(price, compareAt),
          stock: dto.stock,
          isActive: dto.isActive,
          isFeatured: dto.isFeatured,
          specs: dto.specs ? (dto.specs as unknown as Prisma.InputJsonValue) : undefined,
          searchText: buildSearchText([name, relations.brand.name, relations.category.name, current.sku]),
        },
        include: detailInclude,
      });
    });
    return this.toAdminDto(updated);
  }

  /** Atomic stock adjustment: safe under concurrent orders (never below zero). */
  async adjustStock(id: number, delta: number): Promise<AdminProductDto> {
    const res = await this.prisma.product.updateMany({
      where: { id, ...(delta < 0 ? { stock: { gte: -delta } } : {}) },
      data: { stock: { increment: delta } },
    });
    if (res.count === 0) {
      const p = await this.prisma.product.findUnique({ where: { id } });
      if (!p) throw notFound(ErrorCode.PRODUCT_NOT_FOUND, 'Producto no encontrado');
      throw conflict(ErrorCode.INSUFFICIENT_STOCK, 'El stock no puede quedar en negativo', { availableStock: p.stock, delta });
    }
    return this.get(id);
  }
}
