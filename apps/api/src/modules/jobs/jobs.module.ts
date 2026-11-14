import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { JobsService } from './jobs.service';
import { MaintenanceService } from './maintenance.service';

@Module({ imports: [OrdersModule], providers: [JobsService, MaintenanceService], exports: [JobsService] })
export class JobsModule {}
