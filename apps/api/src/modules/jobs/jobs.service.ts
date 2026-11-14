import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { AppConfig } from '../../config/app-config';
import { OrdersService } from '../orders/orders.service';
import { PaymentsService } from '../orders/payments.service';

export const JOB_NAMES = ['resolve-pending-payments', 'expire-reservations'] as const;
export type JobName = (typeof JOB_NAMES)[number];

/**
 * Background jobs (deterministic, time based):
 *  - resolve-pending-payments: resolves PENDING card payments whose resolveAt has passed.
 *  - expire-reservations: cancels unpaid PENDING orders whose stock reservation expired.
 * Both are idempotent and safe if several instances run them (conditional updates).
 */
@Injectable()
export class JobsService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(JobsService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly config: AppConfig,
    private readonly payments: PaymentsService,
    private readonly orders: OrdersService,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.config.jobs.enabled) return;
    this.timer = setInterval(() => void this.tick(), this.config.jobs.intervalMs);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.run('resolve-pending-payments');
      await this.run('expire-reservations');
    } catch (err) {
      this.logger.error(`Job tick failed: ${(err as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  async run(name: JobName): Promise<{ job: JobName; processed: number }> {
    const processed =
      name === 'resolve-pending-payments'
        ? await this.payments.resolveDuePendingPayments()
        : await this.orders.expireReservations();
    if (processed > 0) this.logger.log(`Job ${name} processed ${processed} item(s)`);
    return { job: name, processed };
  }
}
