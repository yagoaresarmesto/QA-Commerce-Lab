import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { AppConfig } from '../../config/app-config';
import { ErrorCode, notFound, unauthorized } from '../../common/errors';
import { safeEqual } from '../../common/utils/crypto';

/**
 * Protects every /api/test/* route with the technical key (X-Test-Api-Key).
 * Defence in depth: the module is not even registered when the testing API is disabled.
 */
@Injectable()
export class TestApiGuard implements CanActivate {
  constructor(private readonly config: AppConfig) {}

  canActivate(context: ExecutionContext): boolean {
    if (!this.config.testApi.enabled) throw notFound(ErrorCode.ROUTE_NOT_FOUND, 'Not found');
    const req = context.switchToHttp().getRequest<Request>();
    const key = req.header('x-test-api-key');
    if (!key || !safeEqual(key, this.config.testApi.key)) {
      throw unauthorized(ErrorCode.TEST_API_KEY_INVALID, 'Falta la cabecera X-Test-Api-Key o no es válida');
    }
    return true;
  }
}
