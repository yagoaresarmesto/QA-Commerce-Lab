import { Module } from '@nestjs/common';
import { MediaController } from '../media/media.controller';
import { CatalogController } from './catalog.controller';
import { CategoriesService } from './categories.service';
import { HomeService } from './home.service';
import { ProductsService } from './products.service';

@Module({
  controllers: [CatalogController, MediaController],
  providers: [ProductsService, CategoriesService, HomeService],
  exports: [ProductsService, CategoriesService],
})
export class CatalogModule {}
