import { applyDecorators, createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { ApiBearerAuth, ApiForbiddenResponse, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import type { Request } from 'express';
import { AuthUser } from '../auth-user';
import { ErrorResponseDto } from '../dto/error-response.dto';

export const IS_PUBLIC_KEY = 'auth:public';
export const IS_OPTIONAL_AUTH_KEY = 'auth:optional';
export const ROLES_KEY = 'auth:roles';

/** Route needs no authentication (Authorization header is ignored). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Works for guests and users. If an Authorization header is sent, it must be valid. */
export const OptionalAuth = () =>
  applyDecorators(
    SetMetadata(IS_OPTIONAL_AUTH_KEY, true),
    ApiBearerAuth('access-token'),
    ApiUnauthorizedResponse({ description: 'Token inválido o caducado', type: ErrorResponseDto }),
  );

/**
 * Requires an authenticated user. Explicitly overrides a class-level @OptionalAuth()/@Public()
 * (e.g. POST /cart/merge inside the optional-auth CartController).
 */
export const Authenticated = () =>
  applyDecorators(
    SetMetadata(IS_PUBLIC_KEY, false),
    SetMetadata(IS_OPTIONAL_AUTH_KEY, false),
    ApiBearerAuth('access-token'),
    ApiUnauthorizedResponse({ description: 'No autenticado / token inválido o caducado', type: ErrorResponseDto }),
  );

/** Requires one of the given roles. */
export const Roles = (...roles: Role[]) =>
  applyDecorators(
    SetMetadata(ROLES_KEY, roles),
    Authenticated(),
    ApiForbiddenResponse({ description: 'Permisos insuficientes', type: ErrorResponseDto }),
  );

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser | undefined =>
    ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>().user,
);
