import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role, UserStatus } from '@prisma/client';
import type { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { TokenService } from '../../modules/auth/token.service';
import { AuthUser } from '../auth-user';
import { IS_OPTIONAL_AUTH_KEY, IS_PUBLIC_KEY, ROLES_KEY } from '../decorators/auth.decorators';
import { ErrorCode, forbidden, unauthorized } from '../errors';
import { RequestContext } from '../request-context';

/**
 * Global authentication + role guard.
 *  - Routes are protected by default.
 *  - @Public() skips authentication.
 *  - @OptionalAuth() allows guests, but a provided token must be valid.
 *  - @Roles(...) restricts access by role (403 when the role does not match).
 * Every authenticated request also checks the session in the database, so logout,
 * password changes and account deactivation invalidate access tokens immediately.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;
    const optional = this.reflector.getAllAndOverride<boolean>(IS_OPTIONAL_AUTH_KEY, targets) ?? false;
    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, targets);

    const req = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const header = req.headers.authorization;
    if (!header) {
      if (optional) return true;
      throw unauthorized(ErrorCode.UNAUTHENTICATED, 'Necesitas iniciar sesión para acceder a este recurso');
    }
    const [scheme, token] = header.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      throw unauthorized(ErrorCode.TOKEN_INVALID, 'Cabecera Authorization mal formada (usa "Bearer <token>")');
    }
    const payload = await this.tokens.verifyAccess(token);
    const session = await this.prisma.session.findUnique({
      where: { id: payload.sid },
      select: {
        userId: true,
        revokedAt: true,
        expiresAt: true,
        user: { select: { id: true, email: true, role: true, status: true } },
      },
    });
    if (!session || session.userId !== payload.sub) {
      throw unauthorized(ErrorCode.TOKEN_INVALID, 'El token de acceso no es válido');
    }
    if (session.revokedAt) throw unauthorized(ErrorCode.SESSION_REVOKED, 'La sesión ha sido cerrada');
    if (session.expiresAt.getTime() <= Date.now()) {
      throw unauthorized(ErrorCode.SESSION_EXPIRED, 'La sesión ha caducado. Inicia sesión de nuevo');
    }
    if (session.user.status === UserStatus.DISABLED) {
      throw forbidden(ErrorCode.ACCOUNT_DISABLED, 'La cuenta está desactivada');
    }
    req.user = { id: session.user.id, email: session.user.email, role: session.user.role, sessionId: payload.sid };
    RequestContext.setUser(session.user.id);

    if (roles?.length && !roles.includes(session.user.role)) {
      throw forbidden(ErrorCode.FORBIDDEN, 'No tienes permisos para realizar esta acción');
    }
    return true;
  }
}
