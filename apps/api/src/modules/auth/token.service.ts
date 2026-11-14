import { Injectable } from '@nestjs/common';
import { JwtService, TokenExpiredError } from '@nestjs/jwt';
import { Role, User, UserStatus } from '@prisma/client';
import { AppConfig } from '../../config/app-config';
import { ErrorCode, forbidden, unauthorized } from '../../common/errors';
import { randomToken, safeEqual, sha256 } from '../../common/utils/crypto';
import { PrismaService } from '../../prisma/prisma.service';

export interface AccessTokenPayload {
  sub: number;
  sid: string;
  email: string;
  role: Role;
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  sessionId: string;
  refreshTokenExpiresAt: Date;
}

export interface SessionMeta {
  userAgent?: string;
  ip?: string;
}

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
  ) {}

  /** Creates a new session and returns an access/refresh token pair. */
  async issueSession(
    user: Pick<User, 'id' | 'email' | 'role'>,
    meta: SessionMeta = {},
    opts: { accessTtlSeconds?: number; refreshTtlSeconds?: number } = {},
  ): Promise<IssuedTokens> {
    const secret = randomToken(32);
    const refreshTtlMs = (opts.refreshTtlSeconds ?? this.config.refreshTokenTtlDays * 86400) * 1000;
    const session = await this.prisma.session.create({
      data: {
        userId: user.id,
        refreshTokenHash: sha256(secret),
        userAgent: meta.userAgent?.slice(0, 300),
        ip: meta.ip?.slice(0, 64),
        expiresAt: new Date(Date.now() + refreshTtlMs),
      },
    });
    const expiresIn = opts.accessTtlSeconds ?? this.config.accessTokenTtlSeconds;
    return {
      accessToken: await this.signAccess(user, session.id, expiresIn),
      refreshToken: `${session.id}.${secret}`,
      tokenType: 'Bearer',
      expiresIn,
      sessionId: session.id,
      refreshTokenExpiresAt: session.expiresAt,
    };
  }

  signAccess(user: Pick<User, 'id' | 'email' | 'role'>, sessionId: string, expiresIn: number): Promise<string> {
    const payload: AccessTokenPayload = { sub: user.id, sid: sessionId, email: user.email, role: user.role };
    return this.jwt.signAsync(payload, { expiresIn });
  }

  async verifyAccess(token: string): Promise<AccessTokenPayload> {
    try {
      return await this.jwt.verifyAsync<AccessTokenPayload>(token);
    } catch (err) {
      if (err instanceof TokenExpiredError) {
        throw unauthorized(ErrorCode.TOKEN_EXPIRED, 'The access token has expired');
      }
      throw unauthorized(ErrorCode.TOKEN_INVALID, 'The access token is not valid');
    }
  }

  /** Validates a refresh token and returns a fresh access token for the same session. */
  async refresh(refreshToken: string): Promise<{ tokens: IssuedTokens; user: User }> {
    const [sessionId, secret] = refreshToken.split('.');
    if (!sessionId || !secret || !/^[0-9a-f-]{36}$/.test(sessionId)) {
      throw unauthorized(ErrorCode.REFRESH_TOKEN_INVALID, 'The refresh token is not valid');
    }
    const session = await this.prisma.session.findUnique({ where: { id: sessionId }, include: { user: true } });
    if (!session || !safeEqual(session.refreshTokenHash, sha256(secret))) {
      throw unauthorized(ErrorCode.REFRESH_TOKEN_INVALID, 'The refresh token is not valid');
    }
    if (session.revokedAt) throw unauthorized(ErrorCode.SESSION_REVOKED, 'The session has been signed out');
    if (session.expiresAt.getTime() <= Date.now()) {
      throw unauthorized(ErrorCode.SESSION_EXPIRED, 'The session has expired. Please sign in again');
    }
    if (session.user.status === UserStatus.DISABLED) {
      throw forbidden(ErrorCode.ACCOUNT_DISABLED, 'The account is disabled');
    }
    await this.prisma.session.update({ where: { id: session.id }, data: { lastUsedAt: new Date() } });
    const expiresIn = this.config.accessTokenTtlSeconds;
    return {
      user: session.user,
      tokens: {
        accessToken: await this.signAccess(session.user, session.id, expiresIn),
        refreshToken,
        tokenType: 'Bearer',
        expiresIn,
        sessionId: session.id,
        refreshTokenExpiresAt: session.expiresAt,
      },
    };
  }

  async revokeByRefreshToken(refreshToken: string): Promise<void> {
    const [sessionId, secret] = refreshToken.split('.');
    if (!sessionId || !secret) return;
    const session = await this.prisma.session.findUnique({ where: { id: sessionId } }).catch(() => null);
    if (session && safeEqual(session.refreshTokenHash, sha256(secret)) && !session.revokedAt) {
      await this.prisma.session.update({ where: { id: sessionId }, data: { revokedAt: new Date() } });
    }
  }

  async revokeSession(sessionId: string): Promise<void> {
    await this.prisma.session.updateMany({ where: { id: sessionId, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  async revokeAllForUser(userId: number, exceptSessionId?: string): Promise<number> {
    const res = await this.prisma.session.updateMany({
      where: { userId, revokedAt: null, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) },
      data: { revokedAt: new Date() },
    });
    return res.count;
  }
}
