import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import type { Request, Response } from 'express';
import { mergeMap, Observable, throwError, timer } from 'rxjs';
import { AppConfig } from '../../../config/app-config';
import { AuthUser } from '../../../common/auth-user';
import { AppException, ErrorCode } from '../../../common/errors';
import { RequestContext } from '../../../common/request-context';
import { FaultsService } from './faults.service';

/**
 * Applies fault injection rules registered through the testing API (POST /api/test/faults).
 * Inactive unless the testing API is enabled. Never applies to /api/test/* or /api/health*.
 * Matched responses carry the header X-Fault-Injected: <rule id>.
 */
@Injectable()
export class FaultInjectionInterceptor implements NestInterceptor {
  private readonly logger = new Logger('FaultInjection');

  constructor(
    private readonly config: AppConfig,
    private readonly faults: FaultsService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (!this.config.testApi.enabled || context.getType() !== 'http') return next.handle();
    const req = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const path = req.originalUrl.split('?')[0];
    if (path.startsWith('/api/test') || path.startsWith('/api/health')) return next.handle();

    const rule = this.faults.match({ method: req.method, path, runId: RequestContext.testRunId(), userId: req.user?.id });
    if (!rule) return next.handle();

    this.logger.warn(`Fault ${rule.id} (${rule.action}) applied to ${req.method} ${path}`);
    context.switchToHttp().getResponse<Response>().setHeader('X-Fault-Injected', rule.id);
    const delay = rule.delayMs ?? 0;

    switch (rule.action) {
      case 'delay':
        return timer(delay).pipe(mergeMap(() => next.handle()));
      case 'timeout':
        return timer(delay || 30_000).pipe(
          mergeMap(() =>
            throwError(() => new AppException(504, ErrorCode.GATEWAY_TIMEOUT, rule.message ?? 'Request timed out (simulated)')),
          ),
        );
      case 'error':
      default:
        return timer(delay).pipe(
          mergeMap(() =>
            throwError(
              () =>
                new AppException(rule.status ?? 500, rule.code ?? ErrorCode.FAULT_INJECTED, rule.message ?? 'Failure simulated by the testing API', {
                  faultId: rule.id,
                }),
            ),
          ),
        );
    }
  }
}
