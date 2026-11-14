import { Injectable } from '@nestjs/common';
import { BannerPlacement } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CategoriesService } from './categories.service';
import { BannerDto, HomeResponseDto } from './dto/home.dto';
import { ProductsService } from './products.service';

@Injectable()
export class HomeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly products: ProductsService,
    private readonly categories: CategoriesService,
  ) {}

  async home(): Promise<HomeResponseDto> {
    const [banners, featured, deals, newArrivals, bestSellers, topRated, tree] = await Promise.all([
      this.prisma.banner.findMany({ where: { isActive: true }, orderBy: [{ position: 'asc' }, { id: 'asc' }] }),
      this.products.listSummaries({ isFeatured: true }, [{ salesCount: 'desc' }, { id: 'asc' }], 8),
      this.products.listSummaries({ discountPercent: { gt: 0 }, stock: { gt: 0 } }, [{ discountPercent: 'desc' }, { id: 'asc' }], 8),
      this.products.listSummaries({}, [{ createdAt: 'desc' }, { id: 'desc' }], 8),
      this.products.listSummaries({}, [{ salesCount: 'desc' }, { id: 'asc' }], 8),
      this.products.listSummaries({ ratingCount: { gte: 3 } }, [{ ratingAvg: 'desc' }, { ratingCount: 'desc' }, { id: 'asc' }], 8),
      this.categories.tree(),
    ]);
    const toBanner = (b: (typeof banners)[number]): BannerDto => ({
      id: b.id,
      title: b.title,
      subtitle: b.subtitle,
      ctaLabel: b.ctaLabel,
      ctaHref: b.ctaHref,
      theme: b.theme,
      imageKind: b.imageKind,
    });
    const leaves = tree.flatMap((n) => (n.children.length ? n.children : [n]));
    return {
      heroBanners: banners.filter((b) => b.placement === BannerPlacement.HERO).map(toBanner),
      promoBanners: banners.filter((b) => b.placement === BannerPlacement.PROMO).map(toBanner),
      featured,
      deals,
      newArrivals,
      bestSellers,
      topRated,
      popularCategories: [...leaves].sort((a, b) => b.productCount - a.productCount || a.position - b.position).slice(0, 8),
    };
  }
}
