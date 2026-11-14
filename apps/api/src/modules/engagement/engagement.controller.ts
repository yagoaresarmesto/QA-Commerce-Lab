import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AuthUser } from '../../common/auth-user';
import { Authenticated, CurrentUser, Public } from '../../common/decorators/auth.decorators';
import { ErrorResponseDto } from '../../common/dto/error-response.dto';
import {
  AddFavoriteDto,
  CreateReviewDto,
  FavoriteDto,
  MyReviewDto,
  ReviewDto,
  ReviewListQueryDto,
  ReviewListResponseDto,
  UpdateReviewDto,
} from './dto/engagement.dto';
import { EngagementService } from './engagement.service';

@ApiTags('Favorites')
@Authenticated()
@Controller('favorites')
export class FavoritesController {
  constructor(private readonly engagement: EngagementService) {}

  @Get()
  @ApiOperation({ summary: 'Listar favoritos del usuario' })
  @ApiOkResponse({ type: [FavoriteDto] })
  list(@CurrentUser() user: AuthUser): Promise<FavoriteDto[]> {
    return this.engagement.listFavorites(user.id);
  }

  @Post()
  @ApiOperation({ summary: 'Añadir producto a favoritos' })
  @ApiCreatedResponse({ type: FavoriteDto })
  @ApiNotFoundResponse({ description: 'PRODUCT_NOT_FOUND', type: ErrorResponseDto })
  @ApiConflictResponse({ description: 'FAVORITE_ALREADY_EXISTS', type: ErrorResponseDto })
  add(@CurrentUser() user: AuthUser, @Body() dto: AddFavoriteDto): Promise<FavoriteDto> {
    return this.engagement.addFavorite(user.id, dto.productId);
  }

  @Delete(':productId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Quitar producto de favoritos' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: 'FAVORITE_NOT_FOUND', type: ErrorResponseDto })
  async remove(@CurrentUser() user: AuthUser, @Param('productId', ParseIntPipe) productId: number): Promise<void> {
    await this.engagement.removeFavorite(user.id, productId);
  }
}

@ApiTags('Reviews')
@Controller()
export class ReviewsController {
  constructor(private readonly engagement: EngagementService) {}

  @Get('products/:productId/reviews')
  @Public()
  @ApiOperation({ summary: 'Reseñas de un producto (paginadas, con resumen de valoraciones)' })
  @ApiOkResponse({ type: ReviewListResponseDto })
  @ApiNotFoundResponse({ description: 'PRODUCT_NOT_FOUND', type: ErrorResponseDto })
  list(@Param('productId', ParseIntPipe) productId: number, @Query() query: ReviewListQueryDto): Promise<ReviewListResponseDto> {
    return this.engagement.listReviews(productId, query);
  }

  @Post('products/:productId/reviews')
  @Authenticated()
  @ApiOperation({
    summary: 'Publicar una reseña',
    description: 'Una reseña por usuario y producto. Se marca como compra verificada si el usuario recibió el producto.',
  })
  @ApiCreatedResponse({ type: ReviewDto })
  @ApiConflictResponse({ description: 'REVIEW_ALREADY_EXISTS', type: ErrorResponseDto })
  create(
    @CurrentUser() user: AuthUser,
    @Param('productId', ParseIntPipe) productId: number,
    @Body() dto: CreateReviewDto,
  ): Promise<ReviewDto> {
    return this.engagement.createReview(user.id, productId, dto);
  }

  @Get('users/me/reviews')
  @Authenticated()
  @ApiOperation({ summary: 'Reseñas publicadas por el usuario autenticado' })
  @ApiOkResponse({ type: [MyReviewDto] })
  mine(@CurrentUser() user: AuthUser): Promise<MyReviewDto[]> {
    return this.engagement.myReviews(user.id);
  }

  @Patch('reviews/:id')
  @Authenticated()
  @ApiOperation({ summary: 'Editar una reseña propia' })
  @ApiOkResponse({ type: ReviewDto })
  @ApiForbiddenResponse({ description: 'NOT_RESOURCE_OWNER', type: ErrorResponseDto })
  @ApiNotFoundResponse({ description: 'REVIEW_NOT_FOUND', type: ErrorResponseDto })
  update(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateReviewDto): Promise<ReviewDto> {
    return this.engagement.updateReview(user, id, dto);
  }

  @Delete('reviews/:id')
  @Authenticated()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar una reseña (autor o administrador)' })
  @ApiNoContentResponse()
  @ApiForbiddenResponse({ description: 'NOT_RESOURCE_OWNER', type: ErrorResponseDto })
  @ApiNotFoundResponse({ description: 'REVIEW_NOT_FOUND', type: ErrorResponseDto })
  async remove(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.engagement.deleteReview(user, id);
  }
}
