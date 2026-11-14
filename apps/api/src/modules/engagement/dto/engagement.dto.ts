import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { PageMetaDto } from '../../../common/dto/pagination.dto';
import { StrictString } from '../../../common/validators';
import { ProductSummaryDto } from '../../catalog/dto/product.dto';

export class AddFavoriteDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  productId: number;
}

export class FavoriteDto {
  productId: number;
  addedAt: Date;
  product: ProductSummaryDto;
}

export class CreateReviewDto {
  @ApiProperty({ minimum: 1, maximum: 5, example: 5 })
  @IsInt({ message: 'The rating must be an integer' })
  @Min(1, { message: 'The minimum rating is 1' })
  @Max(5, { message: 'The maximum rating is 5' })
  rating: number;

  @ApiProperty({ example: 'Great value for money' })
  @StrictString(3, 120, 'Title')
  title: string;

  @ApiProperty({ example: 'I use it every day and it works perfectly. The battery lasts all day.' })
  @StrictString(10, 2000, 'Comment')
  comment: string;
}

export class UpdateReviewDto {
  @IsOptional()
  @IsInt({ message: 'The rating must be an integer' })
  @Min(1, { message: 'The minimum rating is 1' })
  @Max(5, { message: 'The maximum rating is 5' })
  rating?: number;

  @IsOptional()
  @StrictString(3, 120, 'Title')
  title?: string;

  @IsOptional()
  @StrictString(10, 2000, 'Comment')
  comment?: string;
}

export const REVIEW_SORTS = ['newest', 'oldest', 'rating_desc', 'rating_asc'] as const;

export class ReviewListQueryDto {
  @ApiProperty({ required: false, enum: REVIEW_SORTS, default: 'newest' })
  @IsOptional()
  @IsIn(REVIEW_SORTS as unknown as string[])
  sort?: (typeof REVIEW_SORTS)[number] = 'newest';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize?: number = 10;
}

export class ReviewAuthorDto {
  id: number;
  /** Public display name, e.g. "Ana G." */
  displayName: string;
}

export class ReviewDto {
  id: number;
  productId: number;
  rating: number;
  title: string;
  comment: string;
  isVerifiedPurchase: boolean;
  author: ReviewAuthorDto;
  createdAt: Date;
  updatedAt: Date;
}

export class MyReviewDto extends ReviewDto {
  productName: string;
  productSlug: string;
  productImageUrl: string;
}

export class RatingSummaryDto {
  average: number;
  count: number;
  /** Number of reviews per star: { "1": n, ..., "5": n } */
  distribution: Record<string, number>;
}

export class ReviewListResponseDto {
  data: ReviewDto[];
  meta: PageMetaDto;
  summary: RatingSummaryDto;
}
