import { Injectable } from '@nestjs/common';
import { Address } from '@prisma/client';
import { ErrorCode, badRequest, notFound, unprocessable } from '../../common/errors';
import { hashPassword, verifyPassword } from '../../common/utils/crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { TokenService } from '../auth/token.service';
import { AddressDto, AddressInputDto, ChangePasswordDto, SessionDto, UpdateAddressDto, UpdateProfileDto } from './dto/profile.dto';
import { toUserDto, UserDto } from './dto/user.dto';

export const MAX_ADDRESSES = 10;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly mail: MailService,
  ) {}

  async getMe(userId: number): Promise<UserDto> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw notFound(ErrorCode.USER_NOT_FOUND, 'Usuario no encontrado');
    return toUserDto(user);
  }

  async updateMe(userId: number, dto: UpdateProfileDto): Promise<UserDto> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone === '' ? null : dto.phone,
        marketingOptIn: dto.marketingOptIn,
      },
    });
    return toUserDto(user);
  }

  /** Changes the password and closes every other session of the user. */
  async changePassword(userId: number, currentSessionId: string, dto: ChangePasswordDto): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await verifyPassword(dto.currentPassword, user.passwordHash))) {
      throw badRequest(ErrorCode.CURRENT_PASSWORD_INCORRECT, 'La contraseña actual no es correcta');
    }
    if (dto.currentPassword === dto.newPassword) {
      throw badRequest(ErrorCode.PASSWORD_REUSED, 'La nueva contraseña debe ser distinta de la actual');
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await hashPassword(dto.newPassword), passwordChangedAt: new Date() },
    });
    await this.tokens.revokeAllForUser(userId, currentSessionId);
    await this.mail.send(
      {
        to: user.email,
        subject: 'Tu contraseña se ha cambiado',
        template: 'password-changed',
        text: `Hola ${user.firstName}, la contraseña de tu cuenta se ha cambiado correctamente.`,
        metadata: { userId },
      },
      user.testRunId,
    );
  }

  async listSessions(userId: number, currentSessionId: string): Promise<SessionDto[]> {
    const sessions = await this.prisma.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastUsedAt: 'desc' },
    });
    return sessions.map((s) => ({
      id: s.id,
      userAgent: s.userAgent,
      ip: s.ip,
      createdAt: s.createdAt,
      lastUsedAt: s.lastUsedAt,
      expiresAt: s.expiresAt,
      current: s.id === currentSessionId,
    }));
  }

  async revokeSession(userId: number, sessionId: string): Promise<void> {
    const res = await this.prisma.session.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (res.count === 0) throw notFound(ErrorCode.NOT_FOUND, 'Sesión no encontrada');
  }

  revokeOtherSessions(userId: number, currentSessionId: string): Promise<number> {
    return this.tokens.revokeAllForUser(userId, currentSessionId);
  }

  // ─── Addresses ───────────────────────────────────────────────────────────

  async listAddresses(userId: number): Promise<AddressDto[]> {
    const rows = await this.prisma.address.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map(toAddressDto);
  }

  async getAddress(userId: number, id: number): Promise<Address> {
    const address = await this.prisma.address.findFirst({ where: { id, userId } });
    if (!address) throw notFound(ErrorCode.ADDRESS_NOT_FOUND, 'Dirección no encontrada');
    return address;
  }

  async createAddress(userId: number, dto: AddressInputDto): Promise<AddressDto> {
    return this.prisma.$transaction(async (tx) => {
      const count = await tx.address.count({ where: { userId } });
      if (count >= MAX_ADDRESSES) {
        throw unprocessable(ErrorCode.ADDRESS_LIMIT_REACHED, `Puedes guardar como máximo ${MAX_ADDRESSES} direcciones`);
      }
      const makeDefault = dto.isDefault === true || count === 0;
      if (makeDefault) await tx.address.updateMany({ where: { userId }, data: { isDefault: false } });
      const created = await tx.address.create({
        data: {
          userId,
          label: dto.label ?? null,
          fullName: dto.fullName,
          phone: dto.phone,
          line1: dto.line1,
          line2: dto.line2 ?? null,
          city: dto.city,
          province: dto.province,
          postalCode: dto.postalCode,
          country: dto.country ?? 'ES',
          isDefault: makeDefault,
        },
      });
      return toAddressDto(created);
    });
  }

  async updateAddress(userId: number, id: number, dto: UpdateAddressDto): Promise<AddressDto> {
    const current = await this.getAddress(userId, id);
    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault === true && !current.isDefault) {
        await tx.address.updateMany({ where: { userId }, data: { isDefault: false } });
      }
      if (dto.isDefault === false && current.isDefault) {
        throw unprocessable(
          ErrorCode.VALIDATION_ERROR,
          'Debe existir una dirección predeterminada. Marca otra como predeterminada en su lugar',
        );
      }
      const updated = await tx.address.update({
        where: { id },
        data: {
          label: dto.label,
          fullName: dto.fullName,
          phone: dto.phone,
          line1: dto.line1,
          line2: dto.line2,
          city: dto.city,
          province: dto.province,
          postalCode: dto.postalCode,
          country: dto.country,
          isDefault: dto.isDefault,
        },
      });
      return toAddressDto(updated);
    });
  }

  async setDefaultAddress(userId: number, id: number): Promise<AddressDto> {
    await this.getAddress(userId, id);
    return this.prisma.$transaction(async (tx) => {
      await tx.address.updateMany({ where: { userId }, data: { isDefault: false } });
      return toAddressDto(await tx.address.update({ where: { id }, data: { isDefault: true } }));
    });
  }

  /** Deletes an address. If it was the default one, the oldest remaining address becomes the default. */
  async deleteAddress(userId: number, id: number): Promise<void> {
    const address = await this.getAddress(userId, id);
    await this.prisma.$transaction(async (tx) => {
      await tx.address.delete({ where: { id } });
      if (address.isDefault) {
        const next = await tx.address.findFirst({ where: { userId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
        if (next) await tx.address.update({ where: { id: next.id }, data: { isDefault: true } });
      }
    });
  }
}

export function toAddressDto(a: Address): AddressDto {
  return {
    id: a.id,
    label: a.label,
    fullName: a.fullName,
    phone: a.phone,
    line1: a.line1,
    line2: a.line2,
    city: a.city,
    province: a.province,
    postalCode: a.postalCode,
    country: a.country,
    isDefault: a.isDefault,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  };
}
