import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBadRequestResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/auth.decorators';
import { ErrorResponseDto } from '../../common/dto/error-response.dto';
import { CategoriesService } from './categories.service';
import { BrandsQueryDto, BrandWithCountDto, CategoryDetailDto, CategoryNodeDto } from './dto/category.dto';
import { HomeResponseDto } from './dto/home.dto';
import {
  ProductDetailDto,
  ProductListQueryDto,
  ProductListResponseDto,
  ProductSummaryDto,
  SuggestionsQueryDto,
  SuggestionsResponseDto,
} from './dto/product.dto';
import { HomeService } from './home.service';
import { ProductsService } from './products.service';

@ApiTags('Catalog')
@Public()
@Controller()
export class CatalogController {
  constructor(
    private readonly products: ProductsService,
    private readonly categories: CategoriesService,
    private readonly homeService: HomeService,
  ) {}

  @Get('home')
  @ApiOperation({ summary: 'Home page content (banners, featured products, deals, new arrivals...)' })
  @ApiOkResponse({ type: HomeResponseDto })
  home(): Promise<HomeResponseDto> {
    return this.homeService.home();
  }

  @Get('products')
  @ApiOperation({
    summary: 'List/search products',
    description:
      'Combinable filters (q, category, brand, price, stock, on sale, rating), deterministic sorting and pagination. ' +
      'Includes facets (brands, categories, price range) computed over the applied filters. ' +
      'Only active products are returned.',
  })
  @ApiOkResponse({ type: ProductListResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ description: 'CATEGORY_NOT_FOUND', type: ErrorResponseDto })
  list(@Query() query: ProductListQueryDto): Promise<ProductListResponseDto> {
    return this.products.list(query);
  }

  @Get('products/suggestions')
  @ApiOperation({ summary: 'Search suggestions (autocomplete)' })
  @ApiOkResponse({ type: SuggestionsResponseDto })
  suggestions(@Query() query: SuggestionsQueryDto): Promise<SuggestionsResponseDto> {
    return this.products.suggestions(query.q);
  }

  @Get('products/:idOrSlug')
  @ApiOperation({
    summary: 'Product detail by id or slug',
    description: 'Deactivated products are also returned (availability = DISCONTINUED) but cannot be purchased.',
  })
  @ApiParam({ name: 'idOrSlug', example: '1' })
  @ApiOkResponse({ type: ProductDetailDto })
  @ApiNotFoundResponse({ description: 'PRODUCT_NOT_FOUND', type: ErrorResponseDto })
  findOne(@Param('idOrSlug') idOrSlug: string): Promise<ProductDetailDto> {
    return this.products.findOne(idOrSlug);
  }

  @Get('products/:idOrSlug/related')
  @ApiOperation({ summary: 'Related products (same category, best sellers)' })
  @ApiOkResponse({ type: [ProductSummaryDto] })
  related(@Param('idOrSlug') idOrSlug: string): Promise<ProductSummaryDto[]> {
    return this.products.related(idOrSlug);
  }

  @Get('categories')
  @ApiOperation({ summary: 'Category tree with the number of active products' })
  @ApiOkResponse({ type: [CategoryNodeDto] })
  categoriesTree(): Promise<CategoryNodeDto[]> {
    return this.categories.tree();
  }

  @Get('categories/:slug')
  @ApiOperation({ summary: 'Category detail' })
  @ApiOkResponse({ type: CategoryDetailDto })
  @ApiNotFoundResponse({ description: 'CATEGORY_NOT_FOUND', type: ErrorResponseDto })
  category(@Param('slug') slug: string): Promise<CategoryDetailDto> {
    return this.categories.detail(slug);
  }

  @Get('brands')
  @ApiOperation({ summary: 'Brands (optionally filtered by category)' })
  @ApiOkResponse({ type: [BrandWithCountDto] })
  brands(@Query() query: BrandsQueryDto): Promise<BrandWithCountDto[]> {
    return this.categories.brands(query.category);
  }
}
