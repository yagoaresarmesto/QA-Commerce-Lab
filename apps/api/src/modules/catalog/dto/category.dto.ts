import { IsOptional, IsString, MaxLength } from 'class-validator';
import { CategoryRefDto } from './product.dto';

export class CategoryNodeDto {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  position: number;
  /** Active products in the category, including subcategories */
  productCount: number;
  children: CategoryNodeDto[];
}

export class CategoryDetailDto extends CategoryNodeDto {
  parent: CategoryRefDto | null;
}

export class BrandWithCountDto {
  id: number;
  slug: string;
  name: string;
  productCount: number;
}

export class BrandsQueryDto {
  /** Only brands with products in this category (slug) */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  category?: string;
}
