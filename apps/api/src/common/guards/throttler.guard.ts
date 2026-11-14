import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  ThrottlerGuard,
  ThrottlerModuleOptions,
  ThrottlerStorage,
} from '@nestjs/throttler';
import { AppConfig } from '../../config/app-config';

/**
 * Rate limiting is a *controlled* feature: enabled by default only in demo/production
 * (RATE_LIMIT_ENABLED). Local and testing environments never return 429 unless explicitly enabled.
 */
@Injectable()
export class ConfigurableThrottlerGuard extends ThrottlerGuard {
  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storage: ThrottlerStorage,
    reflector: Reflector,
    private readonly config: AppConfig,
  ) {
    super(options, storage, reflector);
  }

  protected override async shouldSkip(context: ExecutionContext): Promise<boolean> {
    if (!this.config.rateLimit.enabled) return true;
    const req = context.switchToHttp().getRequest<{ path?: string }>();
    if (req.path?.startsWith('/api/health')) return true;
    return super.shouldSkip(context);
  }
}
