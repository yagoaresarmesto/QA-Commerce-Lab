import { Injectable, Logger } from '@nestjs/common';
import { User, UserStatus } from '@prisma/client';
import { AppConfig } from '../../config/app-config';
import { ErrorCode, badRequest, conflict, forbidden, unauthorized } from '../../common/errors';
import { RequestContext } from '../../common/request-context';
import { hashPassword, randomToken, sha256, verifyPassword } from '../../common/utils/crypto';
import { escapeHtml } from '../../common/utils/text';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { toUserDto } from '../users/dto/user.dto';
import { AuthResponseDto, RegisterDto, ResetTokenStatusDto } from './dto/auth.dto';
import { IssuedTokens, SessionMeta, TokenService } from './token.service';

// Pre-computed hash used to keep login timing similar for unknown e-mails.
const DUMMY_HASH_PROMISE = hashPassword('dummy-password-for-timing');

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly mail: MailService,
    private readonly config: AppConfig,
  ) {}

  async register(dto: RegisterDto, meta: SessionMeta): Promise<AuthResponseDto> {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw conflict(ErrorCode.EMAIL_ALREADY_REGISTERED, 'An account with that e-mail already exists');
    }
    const user = await this.prisma.user
      .create({
        data: {
          email: dto.email,
          passwordHash: await hashPassword(dto.password),
          firstName: dto.firstName,
          lastName: dto.lastName,
          phone: dto.phone ?? null,
          marketingOptIn: dto.marketingOptIn ?? false,
          testRunId: RequestContext.testRunId() ?? null,
          lastLoginAt: new Date(),
        },
      })
      .catch((err: { code?: string }) => {
        if (err.code === 'P2002') {
          throw conflict(ErrorCode.EMAIL_ALREADY_REGISTERED, 'An account with that e-mail already exists');
        }
        throw err;
      });
    await this.mail.send({
      to: user.email,
      subject: 'Welcome to QA Commerce Lab!',
      template: 'welcome',
      text: `Hi ${user.firstName}, your account has been created. Thanks for signing up!`,
      metadata: { userId: user.id },
    });
    const tokens = await this.tokens.issueSession(user, meta);
    return this.toAuthResponse(user, tokens);
  }

  async login(email: string, password: string, meta: SessionMeta): Promise<AuthResponseDto> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      await verifyPassword(password, await DUMMY_HASH_PROMISE);
      throw unauthorized(ErrorCode.INVALID_CREDENTIALS, 'Incorrect e-mail or password');
    }
    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) throw unauthorized(ErrorCode.INVALID_CREDENTIALS, 'Incorrect e-mail or password');
    if (user.status === UserStatus.DISABLED) {
      throw forbidden(ErrorCode.ACCOUNT_DISABLED, 'The account is disabled. Please contact customer support');
    }
    const updated = await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    const tokens = await this.tokens.issueSession(updated, meta);
    return this.toAuthResponse(updated, tokens);
  }

  async refresh(refreshToken: string | undefined): Promise<AuthResponseDto> {
    if (!refreshToken) throw unauthorized(ErrorCode.REFRESH_TOKEN_INVALID, 'The refresh token is missing');
    const { user, tokens } = await this.tokens.refresh(refreshToken);
    return this.toAuthResponse(user, tokens);
  }

  async logout(sessionId: string | undefined, refreshToken: string | undefined): Promise<void> {
    if (sessionId) await this.tokens.revokeSession(sessionId);
    else if (refreshToken) await this.tokens.revokeByRefreshToken(refreshToken);
  }

  /** Always resolves (no account enumeration). Sends an e-mail with a single-use token when the user exists. */
  async forgotPassword(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.status === UserStatus.DISABLED) {
      this.logger.log(`Password reset requested for unknown/disabled account`);
      return;
    }
    await this.createResetToken(user);
  }

  /** Creates a reset token and sends the e-mail. Returns the raw token (used by the testing API). */
  async createResetToken(user: User): Promise<{ token: string; expiresAt: Date }> {
    const token = randomToken(32);
    const expiresAt = new Date(Date.now() + this.config.passwordResetTtlMinutes * 60_000);
    await this.prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash: sha256(token), expiresAt } });
    const link = `${this.config.publicWebUrl}/reset-password?token=${encodeURIComponent(token)}`;
    await this.mail.send(
      {
        to: user.email,
        subject: 'Reset your password',
        template: 'password-reset',
        text:
          `Hi ${user.firstName},\n\nWe received a request to reset your password.\n` +
          `Open this link (valid for ${this.config.passwordResetTtlMinutes} minutes):\n${link}\n\n` +
          `If this wasn't you, please ignore this message.`,
        html: `<p>Hi ${escapeHtml(user.firstName)},</p><p>To reset your password, click <a href="${link}">this link</a> (valid for ${this.config.passwordResetTtlMinutes} minutes).</p>`,
        metadata: { userId: user.id, token, link, expiresAt: expiresAt.toISOString() },
      },
      user.testRunId,
    );
    return { token, expiresAt };
  }

  async validateResetToken(token: string): Promise<ResetTokenStatusDto> {
    const record = await this.findUsableResetToken(token);
    return { valid: true, email: maskEmail(record.user.email), expiresAt: record.expiresAt };
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const record = await this.findUsableResetToken(token);
    const passwordHash = await hashPassword(newPassword);
    await this.prisma.$transaction(async (tx) => {
      // Conditional update guarantees single use even under concurrent requests.
      const used = await tx.passwordResetToken.updateMany({
        where: { id: record.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (used.count === 0) throw badRequest(ErrorCode.RESET_TOKEN_USED, 'This link has already been used');
      await tx.user.update({ where: { id: record.userId }, data: { passwordHash, passwordChangedAt: new Date() } });
      await tx.session.updateMany({ where: { userId: record.userId, revokedAt: null }, data: { revokedAt: new Date() } });
    });
    await this.mail.send(
      {
        to: record.user.email,
        subject: 'Your password has been changed',
        template: 'password-changed',
        text: `Hi ${record.user.firstName}, your account password has been changed.`,
        metadata: { userId: record.userId },
      },
      record.user.testRunId,
    );
  }

  private async findUsableResetToken(token: string) {
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: sha256(token) },
      include: { user: true },
    });
    if (!record) throw badRequest(ErrorCode.RESET_TOKEN_INVALID, 'The password reset link is not valid');
    if (record.usedAt) throw badRequest(ErrorCode.RESET_TOKEN_USED, 'This link has already been used');
    if (record.expiresAt.getTime() <= Date.now()) {
      throw badRequest(ErrorCode.RESET_TOKEN_EXPIRED, 'The password reset link has expired. Please request a new one');
    }
    return record;
  }

  toAuthResponse(user: User, tokens: IssuedTokens): AuthResponseDto {
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      tokenType: 'Bearer',
      expiresIn: tokens.expiresIn,
      refreshTokenExpiresAt: tokens.refreshTokenExpiresAt,
      user: toUserDto(user),
    };
  }
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (local.length <= 2) return `${local[0]}*@${domain}`;
  return `${local[0]}${'*'.repeat(Math.max(1, local.length - 2))}${local[local.length - 1]}@${domain}`;
}
