import { Module } from '@nestjs/common';
import { CartController, ShippingController } from './cart.controller';
import { CartService } from './cart.service';
import { CouponsService } from './coupons.service';
import { ShippingService } from './shipping.service';

@Module({
  controllers: [CartController, ShippingController],
  providers: [CartService, CouponsService, ShippingService],
  exports: [CartService, CouponsService, ShippingService],
})
export class CartModule {}
