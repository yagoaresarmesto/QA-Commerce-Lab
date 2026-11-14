import { Injectable } from '@nestjs/common';
import { Category } from '@prisma/client';
import { ErrorCode, notFound } from '../../common/errors';
import { PrismaService } from '../../prisma/prisma.service';
import { catalogVisibilityScope } from './catalog-scope';
import { BrandWithCountDto, CategoryDetailDto, CategoryNodeDto } from './dto/category.dto';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async findBySlugOrThrow(slug: string): Promise<Category & { children: Category[]; parent: Category | null }> {
    const category = await this.prisma.category.findUnique({
      where: { slug },
      include: { children: { orderBy: [{ position: 'asc' }, { id: 'asc' }] }, parent: true },
    });
    if (!category) throw notFound(ErrorCode.CATEGORY_NOT_FOUND, `La categoría "${slug}" no existe`);
    return category;
  }

  /** Category id plus all descendant ids (the tree has two levels). */
  async resolveIds(slug: string): Promise<number[]> {
    const category = await this.findBySlugOrThrow(slug);
    return [category.id, ...category.children.map((c) => c.id)];
  }

  async descendantIds(categoryId: number): Promise<number[]> {
    const children = await this.prisma.category.findMany({ where: { parentId: categoryId }, select: { id: true } });
    return [categoryId, ...children.map((c) => c.id)];
  }

  async tree(): Promise<CategoryNodeDto[]> {
    const [categories, counts] = await Promise.all([
      this.prisma.category.findMany({ orderBy: [{ position: 'asc' }, { id: 'asc' }] }),
      this.prisma.product.groupBy({
        by: ['categoryId'],
        where: { isActive: true, ...catalogVisibilityScope() },
        _count: { _all: true },
      }),
    ]);
    const countBy = new Map(counts.map((c) => [c.categoryId, c._count._all]));
    const toNode = (c: Category): CategoryNodeDto => {
      const children = categories.filter((x) => x.parentId === c.id).map(toNode);
      const own = countBy.get(c.id) ?? 0;
      return {
        id: c.id,
        slug: c.slug,
        name: c.name,
        description: c.description,
        icon: c.icon,
        position: c.position,
        productCount: own + children.reduce((acc, ch) => acc + ch.productCount, 0),
        children,
      };
    };
    return categories.filter((c) => c.parentId === null).map(toNode);
  }

  async detail(slug: string): Promise<CategoryDetailDto> {
    const category = await this.findBySlugOrThrow(slug);
    const tree = await this.tree();
    const flat = tree.flatMap((n) => [n, ...n.children]);
    const node = flat.find((n) => n.id === category.id)!;
    return {
      ...node,
      parent: category.parent ? { id: category.parent.id, slug: category.parent.slug, name: category.parent.name } : null,
    };
  }

  async brands(categorySlug?: string): Promise<BrandWithCountDto[]> {
    const categoryIds = categorySlug ? await this.resolveIds(categorySlug) : undefined;
    const [brands, counts] = await Promise.all([
      this.prisma.brand.findMany({ orderBy: { name: 'asc' } }),
      this.prisma.product.groupBy({
        by: ['brandId'],
        where: { isActive: true, ...catalogVisibilityScope(), ...(categoryIds ? { categoryId: { in: categoryIds } } : {}) },
        _count: { _all: true },
      }),
    ]);
    const countBy = new Map(counts.map((c) => [c.brandId, c._count._all]));
    return brands
      .map((b) => ({ id: b.id, slug: b.slug, name: b.name, productCount: countBy.get(b.id) ?? 0 }))
      .filter((b) => !categoryIds || b.productCount > 0);
  }
}
