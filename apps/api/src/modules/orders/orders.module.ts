import { Module } from '@nestjs/common';
import { CartModule } from '../cart/cart.module';
import { OrderLifecycleService } from './order-lifecycle.service';
import { CheckoutController, OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { PaymentsService } from './payments.service';

@Module({
  imports: [CartModule],
  controllers: [CheckoutController, OrdersController],
  providers: [OrdersService, PaymentsService, OrderLifecycleService],
  exports: [OrdersService, PaymentsService, OrderLifecycleService],
})
export class OrdersModule {}
