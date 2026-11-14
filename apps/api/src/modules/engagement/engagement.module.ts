import { Module } from '@nestjs/common';
import { FavoritesController, ReviewsController } from './engagement.controller';
import { EngagementService } from './engagement.service';

@Module({
  controllers: [FavoritesController, ReviewsController],
  providers: [EngagementService],
  exports: [EngagementService],
})
export class EngagementModule {}
