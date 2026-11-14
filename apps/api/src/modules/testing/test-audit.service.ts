import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class TestAuditService {
  private readonly logger = new Logger('TestingAPI');

  constructor(private readonly prisma: PrismaService) {}

  async log(action: string, runId: string | undefined | null, ip: string | undefined, details?: unknown): Promise<void> {
    this.logger.log(`${action}${runId ? ` [run ${runId}]` : ''}`);
    await this.prisma.testAuditLog
      .create({
        data: {
          action,
          runId: runId ?? null,
          ip: ip ?? null,
          details: details === undefined ? undefined : (JSON.parse(JSON.stringify(details)) as Prisma.InputJsonValue),
        },
      })
      .catch(() => undefined);
  }

  list(runId?: string, limit = 100) {
    return this.prisma.testAuditLog.findMany({
      where: runId ? { runId } : {},
      orderBy: { id: 'desc' },
      take: Math.min(limit, 500),
    });
  }
}
