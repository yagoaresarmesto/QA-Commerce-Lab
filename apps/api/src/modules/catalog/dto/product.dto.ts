import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { PageMetaDto } from '../../../common/dto/pagination.dto';

export const AVAILABILITY = ['IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK', 'DISCONTINUED'] as const;
export type Availability = (typeof AVAILABILITY)[number];

export const PRODUCT_SORTS = [
  'relevance',
  'price_asc',
  'price_desc',
  'popularity',
  'rating',
  'newest',
  'discount',
  'name_asc',
] as const;
export type ProductSort = (typeof PRODUCT_SORTS)[number];

const toBool = () =>
  Transform(({ value }) => (value === 'true' || value === true ? true : value === 'false' || value === false ? false : value));

export class ProductListQueryDto {
  /** Free text search (name, brand, category, SKU). Accent and case insensitive. All words must match. */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  q?: string;

  /** Category slug. Parent categories include their subcategories. */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  category?: string;

  /** Brand slug(s), comma separated (e.g. `asus,msi`) */
  @IsOptional()
  @IsString()
  @MaxLength(300)
  brand?: string;

  /** Minimum price in cents (inclusive) */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minPriceCents?: number;

  /** Maximum price in cents (inclusive) */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxPriceCents?: number;

  /** Only products with stock > 0 */
  @IsOptional()
  @toBool()
  @IsBoolean()
  inStock?: boolean;

  /** Only products with a previous price (discounted) */
  @IsOptional()
  @toBool()
  @IsBoolean()
  onSale?: boolean;

  /** Only featured products */
  @IsOptional()
  @toBool()
  @IsBoolean()
  featured?: boolean;

  /** Minimum average rating (1-5) */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  minRating?: number;

  @ApiProperty({ required: false, enum: PRODUCT_SORTS, default: 'relevance' })
  @IsOptional()
  @IsIn(PRODUCT_SORTS as unknown as string[])
  sort?: ProductSort = 'relevance';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  /** Items per page (1-60) */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(60)
  pageSize?: number = 24;
}

export class BrandRefDto {
  id: number;
  slug: string;
  name: string;
}

export class CategoryRefDto {
  id: number;
  slug: string;
  name: string;
}

export class ProductSpecDto {
  name: string;
  value: string;
}

export class ProductImageDto {
  url: string;
  alt: string;
  position: number;
}

export class ProductSummaryDto {
  id: number;
  sku: string;
  slug: string;
  name: string;
  shortDescription: string;
  brand: BrandRefDto;
  category: CategoryRefDto;
  /** Current price in cents (VAT included) */
  priceCents: number;
  /** Previous price in cents when the product is on sale */
  compareAtPriceCents: number | null;
  /** Discount percentage computed from compareAtPriceCents (0 when not on sale) */
  discountPercent: number;
  stock: number;
  @ApiProperty({ enum: AVAILABILITY })
  availability: Availability;
  isActive: boolean;
  isFeatured: boolean;
  /** Created during the last 30 days */
  isNew: boolean;
  imageUrl: string;
  ratingAvg: number;
  ratingCount: number;
  salesCount: number;
  createdAt: Date;
}

export class ProductDetailDto extends ProductSummaryDto {
  description: string;
  specs: ProductSpecDto[];
  images: ProductImageDto[];
  /** Breadcrumb: parent category (if any) and category */
  categoryPath: CategoryRefDto[];
  /** Maximum units of this product per order */
  maxQuantityPerOrder: number;
  updatedAt: Date;
}

export class FacetCountDto {
  slug: string;
  name: string;
  count: number;
}

export class PriceRangeDto {
  minCents: number;
  maxCents: number;
}

export class ProductFacetsDto {
  brands: FacetCountDto[];
  categories: FacetCountDto[];
  priceRange: PriceRangeDto;
  inStockCount: number;
  onSaleCount: number;
}

export class ProductListResponseDto {
  data: ProductSummaryDto[];
  meta: PageMetaDto;
  facets: ProductFacetsDto;
}

export class SuggestionProductDto {
  id: number;
  slug: string;
  name: string;
  brandName: string;
  priceCents: number;
  imageUrl: string;
}

export class SuggestionsResponseDto {
  products: SuggestionProductDto[];
  categories: CategoryRefDto[];
  brands: BrandRefDto[];
}

export class SuggestionsQueryDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  q: string;
}
