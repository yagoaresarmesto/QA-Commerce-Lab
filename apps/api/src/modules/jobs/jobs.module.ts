import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { JobsService } from './jobs.service';

@Module({ imports: [OrdersModule], providers: [JobsService], exports: [JobsService] })
export class JobsModule {}
