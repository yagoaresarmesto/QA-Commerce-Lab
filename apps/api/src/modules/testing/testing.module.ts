import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module';
import { CartModule } from '../cart/cart.module';
import { JobsModule } from '../jobs/jobs.module';
import { OrdersModule } from '../orders/orders.module';
import { CleanupService } from './cleanup.service';
import { FixturesService } from './fixtures.service';
import { ScenariosService } from './scenarios.service';
import { SeedService } from './seed.service';
import { TestApiGuard } from './test-api.guard';
import { TestAuditService } from './test-audit.service';
import { TestingController } from './testing.controller';

/**
 * Testing infrastructure. Only imported by AppModule when the testing API is enabled
 * (APP_ENV local/testing). In demo/production these routes do not exist.
 */
@Module({
  imports: [AdminModule, CartModule, OrdersModule, JobsModule],
  controllers: [TestingController],
  providers: [FixturesService, ScenariosService, CleanupService, SeedService, TestAuditService, TestApiGuard],
})
export class TestingModule {}
