import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { CronJob } from 'cron';
import { AppConfig } from '../../config/app-config';
import { PrismaService } from '../../prisma/prisma.service';
import { ReferenceSeeder } from '../../seed/reference-seeder';

/**
 * Optional scheduled global reset (AUTO_RESET_CRON), intended for the public demo:
 * every night the demo goes back to the deterministic reference dataset, so visitors
 * always find a clean, coherent store. Never configure it on a shared testing environment.
 */
@Injectable()
export class MaintenanceService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(MaintenanceService.name);
  private job?: CronJob;

  constructor(
    private readonly config: AppConfig,
    private readonly prisma: PrismaService,
  ) {}

  onApplicationBootstrap(): void {
    const expression = this.config.jobs.autoResetCron;
    if (!expression) return;
    this.job = CronJob.from({
      cronTime: expression,
      timeZone: 'Europe/Madrid',
      start: true,
      onTick: async () => {
        try {
          const summary = await new ReferenceSeeder(this.prisma).reset();
          this.logger.warn(`Scheduled global reset completed: ${JSON.stringify(summary)}`);
        } catch (err) {
          this.logger.error(`Scheduled global reset failed: ${(err as Error).message}`);
        }
      },
    });
    this.logger.log(`Scheduled global reset enabled (${expression}, Europe/Madrid)`);
  }

  onModuleDestroy(): void {
    void this.job?.stop();
  }
}
