import { Injectable } from '@nestjs/common';
import { OrderStatus, Prisma, Review, Role, User } from '@prisma/client';
import { pageMeta } from '../../common/dto/pagination.dto';
import { ErrorCode, conflict, forbidden, notFound } from '../../common/errors';
import { PrismaService, Tx } from '../../prisma/prisma.service';
import { fallbackImage, productSummaryInclude, toProductSummary } from '../catalog/catalog.mapper';
import {
  CreateReviewDto,
  FavoriteDto,
  MyReviewDto,
  ReviewDto,
  ReviewListQueryDto,
  ReviewListResponseDto,
  UpdateReviewDto,
} from './dto/engagement.dto';

export function displayName(u: Pick<User, 'firstName' | 'lastName'>): string {
  return `${u.firstName} ${u.lastName.charAt(0).toUpperCase()}.`;
}

function toReviewDto(r: Review & { user: Pick<User, 'id' | 'firstName' | 'lastName'> }): ReviewDto {
  return {
    id: r.id,
    productId: r.productId,
    rating: r.rating,
    title: r.title,
    comment: r.comment,
    isVerifiedPurchase: r.isVerifiedPurchase,
    author: { id: r.user.id, displayName: displayName(r.user) },
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

/** Recomputes the denormalized rating of a product from its reviews. */
export async function recomputeProductRating(db: Tx | PrismaService, productId: number): Promise<void> {
  const agg = await db.review.aggregate({ where: { productId }, _avg: { rating: true }, _count: { _all: true } });
  await db.product.update({
    where: { id: productId },
    data: { ratingAvg: agg._avg.rating ?? 0, ratingCount: agg._count._all },
  });
}

@Injectable()
export class EngagementService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Favorites ─────────────────────────────────────────────────────────

  async listFavorites(userId: number): Promise<FavoriteDto[]> {
    const rows = await this.prisma.favorite.findMany({
      where: { userId },
      include: { product: { include: productSummaryInclude } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return rows.map((f) => ({ productId: f.productId, addedAt: f.createdAt, product: toProductSummary(f.product) }));
  }

  async addFavorite(userId: number, productId: number): Promise<FavoriteDto> {
    const product = await this.prisma.product.findUnique({ where: { id: productId }, include: productSummaryInclude });
    if (!product) throw notFound(ErrorCode.PRODUCT_NOT_FOUND, 'Producto no encontrado');
    try {
      const fav = await this.prisma.favorite.create({ data: { userId, productId } });
      return { productId, addedAt: fav.createdAt, product: toProductSummary(product) };
    } catch (err) {
      if ((err as { code?: string }).code === 'P2002') {
        throw conflict(ErrorCode.FAVORITE_ALREADY_EXISTS, 'El producto ya está en tu lista de favoritos');
      }
      throw err;
    }
  }

  async removeFavorite(userId: number, productId: number): Promise<void> {
    const res = await this.prisma.favorite.deleteMany({ where: { userId, productId } });
    if (res.count === 0) throw notFound(ErrorCode.FAVORITE_NOT_FOUND, 'El producto no está en tu lista de favoritos');
  }

  // ─── Reviews ───────────────────────────────────────────────────────────

  async listReviews(productId: number, query: ReviewListQueryDto): Promise<ReviewListResponseDto> {
    const product = await this.prisma.product.findUnique({ where: { id: productId }, select: { id: true } });
    if (!product) throw notFound(ErrorCode.PRODUCT_NOT_FOUND, 'Producto no encontrado');
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const where: Prisma.ReviewWhereInput = { productId, ...(query.rating ? { rating: query.rating } : {}) };
    const orderBy: Prisma.ReviewOrderByWithRelationInput[] =
      query.sort === 'oldest'
        ? [{ createdAt: 'asc' }, { id: 'asc' }]
        : query.sort === 'rating_desc'
          ? [{ rating: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }]
          : query.sort === 'rating_asc'
            ? [{ rating: 'asc' }, { createdAt: 'desc' }, { id: 'desc' }]
            : [{ createdAt: 'desc' }, { id: 'desc' }];
    const [total, rows, groups] = await Promise.all([
      this.prisma.review.count({ where }),
      this.prisma.review.findMany({
        where,
        include: { user: { select: { id: true, firstName: true, lastName: true } } },
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.review.groupBy({ by: ['rating'], where: { productId }, _count: { _all: true } }),
    ]);
    const distribution: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
    let count = 0;
    let sum = 0;
    for (const g of groups) {
      distribution[String(g.rating)] = g._count._all;
      count += g._count._all;
      sum += g.rating * g._count._all;
    }
    return {
      data: rows.map(toReviewDto),
      meta: pageMeta(page, pageSize, total),
      summary: { average: count ? Math.round((sum / count) * 10) / 10 : 0, count, distribution },
    };
  }

  async createReview(userId: number, productId: number, dto: CreateReviewDto): Promise<ReviewDto> {
    const product = await this.prisma.product.findUnique({ where: { id: productId }, select: { id: true } });
    if (!product) throw notFound(ErrorCode.PRODUCT_NOT_FOUND, 'Producto no encontrado');
    const verified = await this.prisma.orderItem.count({
      where: { productId, order: { userId, status: { in: [OrderStatus.DELIVERED, OrderStatus.RETURN_REQUESTED] } } },
    });
    try {
      const review = await this.prisma.$transaction(async (tx) => {
        const r = await tx.review.create({
          data: { userId, productId, rating: dto.rating, title: dto.title, comment: dto.comment, isVerifiedPurchase: verified > 0 },
          include: { user: { select: { id: true, firstName: true, lastName: true } } },
        });
        await recomputeProductRating(tx, productId);
        return r;
      });
      return toReviewDto(review);
    } catch (err) {
      if ((err as { code?: string }).code === 'P2002') {
        throw conflict(ErrorCode.REVIEW_ALREADY_EXISTS, 'Ya has publicado una reseña de este producto. Puedes editarla');
      }
      throw err;
    }
  }

  private async ownedReview(user: { id: number; role: Role }, reviewId: number, allowAdmin: boolean) {
    const review = await this.prisma.review.findUnique({ where: { id: reviewId } });
    if (!review) throw notFound(ErrorCode.REVIEW_NOT_FOUND, 'Reseña no encontrada');
    if (review.userId !== user.id && !(allowAdmin && user.role === Role.ADMIN)) {
      throw forbidden(ErrorCode.NOT_RESOURCE_OWNER, 'Solo el autor puede modificar esta reseña');
    }
    return review;
  }

  async updateReview(user: { id: number; role: Role }, reviewId: number, dto: UpdateReviewDto): Promise<ReviewDto> {
    const review = await this.ownedReview(user, reviewId, false);
    const updated = await this.prisma.$transaction(async (tx) => {
      const r = await tx.review.update({
        where: { id: review.id },
        data: { rating: dto.rating, title: dto.title, comment: dto.comment },
        include: { user: { select: { id: true, firstName: true, lastName: true } } },
      });
      await recomputeProductRating(tx, review.productId);
      return r;
    });
    return toReviewDto(updated);
  }

  /** Authors can delete their reviews; admins can delete any review (moderation). */
  async deleteReview(user: { id: number; role: Role }, reviewId: number): Promise<void> {
    const review = await this.ownedReview(user, reviewId, true);
    await this.prisma.$transaction(async (tx) => {
      await tx.review.delete({ where: { id: review.id } });
      await recomputeProductRating(tx, review.productId);
    });
  }

  async myReviews(userId: number): Promise<MyReviewDto[]> {
    const rows = await this.prisma.review.findMany({
      where: { userId },
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
        product: { include: { category: true, images: { orderBy: { position: 'asc' }, take: 1 } } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return rows.map((r) => ({
      ...toReviewDto(r),
      productName: r.product.name,
      productSlug: r.product.slug,
      productImageUrl: r.product.images[0]?.url ?? fallbackImage(r.product.category.slug),
    }));
  }
}
