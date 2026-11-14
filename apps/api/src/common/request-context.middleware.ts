import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { AppConfig } from '../config/app-config';
import { RequestContext, TEST_RUN_ID_PATTERN } from './request-context';

/**
 * Creates the per-request context (request id + optional automation run id) and
 * echoes the correlation id back in the X-Request-Id response header.
 */
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  constructor(private readonly config: AppConfig) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const incoming = req.header('x-request-id');
    const requestId =
      (req as Request & { id?: string }).id?.toString() ??
      (incoming && /^[\w.-]{1,128}$/.test(incoming) ? incoming : randomUUID());
    res.setHeader('X-Request-Id', requestId);

    let testRunId: string | undefined;
    if (this.config.testApi.enabled) {
      const header = req.header('x-test-run-id');
      if (header && TEST_RUN_ID_PATTERN.test(header)) testRunId = header;
    }
    RequestContext.run({ requestId, testRunId }, () => next());
  }
}
