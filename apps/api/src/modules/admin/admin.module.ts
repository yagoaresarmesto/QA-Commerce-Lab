import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { AdminCatalogService } from './admin-catalog.service';
import { AdminController } from './admin.controller';
import { AdminSalesService } from './admin-sales.service';

@Module({
  imports: [OrdersModule],
  controllers: [AdminController],
  providers: [AdminCatalogService, AdminSalesService],
  exports: [AdminCatalogService, AdminSalesService],
})
export class AdminModule {}
