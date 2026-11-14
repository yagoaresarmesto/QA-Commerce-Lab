import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ReferenceSeeder, SeedSummary } from '../../seed/reference-seeder';

/** Serializes seed operations so two concurrent resets never interleave. */
@Injectable()
export class SeedService {
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly prisma: PrismaService) {}

  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.queue.then(fn, fn);
    this.queue = next.catch(() => undefined);
    return next;
  }

  reset(): Promise<SeedSummary> {
    return this.enqueue(() => new ReferenceSeeder(this.prisma).reset());
  }

  seed(): Promise<SeedSummary> {
    return this.enqueue(() => new ReferenceSeeder(this.prisma).seed());
  }
}
