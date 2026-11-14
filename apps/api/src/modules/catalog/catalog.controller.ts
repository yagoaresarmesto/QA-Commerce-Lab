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
  @ApiOperation({ summary: 'Contenido de la página principal (banners, destacados, ofertas, novedades...)' })
  @ApiOkResponse({ type: HomeResponseDto })
  home(): Promise<HomeResponseDto> {
    return this.homeService.home();
  }

  @Get('products')
  @ApiOperation({
    summary: 'Listar/buscar productos',
    description:
      'Filtros combinables (q, category, brand, precio, stock, ofertas, valoración), ordenación determinista y paginación. ' +
      'Incluye facetas (marcas, categorías, rango de precios) calculadas sobre los filtros aplicados. ' +
      'Solo devuelve productos activos.',
  })
  @ApiOkResponse({ type: ProductListResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto })
  @ApiNotFoundResponse({ description: 'CATEGORY_NOT_FOUND', type: ErrorResponseDto })
  list(@Query() query: ProductListQueryDto): Promise<ProductListResponseDto> {
    return this.products.list(query);
  }

  @Get('products/suggestions')
  @ApiOperation({ summary: 'Sugerencias de búsqueda (autocompletado)' })
  @ApiOkResponse({ type: SuggestionsResponseDto })
  suggestions(@Query() query: SuggestionsQueryDto): Promise<SuggestionsResponseDto> {
    return this.products.suggestions(query.q);
  }

  @Get('products/:idOrSlug')
  @ApiOperation({
    summary: 'Detalle de producto por id o slug',
    description: 'Los productos desactivados también se devuelven (availability = DISCONTINUED) pero no se pueden comprar.',
  })
  @ApiParam({ name: 'idOrSlug', example: '1' })
  @ApiOkResponse({ type: ProductDetailDto })
  @ApiNotFoundResponse({ description: 'PRODUCT_NOT_FOUND', type: ErrorResponseDto })
  findOne(@Param('idOrSlug') idOrSlug: string): Promise<ProductDetailDto> {
    return this.products.findOne(idOrSlug);
  }

  @Get('products/:idOrSlug/related')
  @ApiOperation({ summary: 'Productos relacionados (misma categoría, más vendidos)' })
  @ApiOkResponse({ type: [ProductSummaryDto] })
  related(@Param('idOrSlug') idOrSlug: string): Promise<ProductSummaryDto[]> {
    return this.products.related(idOrSlug);
  }

  @Get('categories')
  @ApiOperation({ summary: 'Árbol de categorías con número de productos activos' })
  @ApiOkResponse({ type: [CategoryNodeDto] })
  categoriesTree(): Promise<CategoryNodeDto[]> {
    return this.categories.tree();
  }

  @Get('categories/:slug')
  @ApiOperation({ summary: 'Detalle de categoría' })
  @ApiOkResponse({ type: CategoryDetailDto })
  @ApiNotFoundResponse({ description: 'CATEGORY_NOT_FOUND', type: ErrorResponseDto })
  category(@Param('slug') slug: string): Promise<CategoryDetailDto> {
    return this.categories.detail(slug);
  }

  @Get('brands')
  @ApiOperation({ summary: 'Marcas (opcionalmente filtradas por categoría)' })
  @ApiOkResponse({ type: [BrandWithCountDto] })
  brands(@Query() query: BrandsQueryDto): Promise<BrandWithCountDto[]> {
    return this.categories.brands(query.category);
  }
}
