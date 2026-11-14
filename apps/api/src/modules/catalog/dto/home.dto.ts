import { CategoryNodeDto } from './category.dto';
import { ProductSummaryDto } from './product.dto';

export class BannerDto {
  id: number;
  title: string;
  subtitle: string | null;
  ctaLabel: string;
  /** Internal storefront link, e.g. /category/laptops */
  ctaHref: string;
  theme: string;
  imageKind: string | null;
}

export class HomeResponseDto {
  heroBanners: BannerDto[];
  promoBanners: BannerDto[];
  featured: ProductSummaryDto[];
  /** Products on sale with stock, sorted by discount */
  deals: ProductSummaryDto[];
  newArrivals: ProductSummaryDto[];
  bestSellers: ProductSummaryDto[];
  topRated: ProductSummaryDto[];
  popularCategories: CategoryNodeDto[];
}
