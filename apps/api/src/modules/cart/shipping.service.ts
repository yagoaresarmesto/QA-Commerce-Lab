import { Injectable } from '@nestjs/common';
import { PickupPoint, ShippingMethod } from '@prisma/client';
import { ErrorCode, notFound, unprocessable } from '../../common/errors';
import { PrismaService, Tx } from '../../prisma/prisma.service';
import { PickupPointDto, ShippingMethodDto } from './dto/shipping.dto';

export const DEFAULT_SHIPPING_CODE = 'STANDARD';

@Injectable()
export class ShippingService {
  constructor(private readonly prisma: PrismaService) {}

  async methods(): Promise<ShippingMethodDto[]> {
    const rows = await this.prisma.shippingMethod.findMany({ where: { isActive: true }, orderBy: { position: 'asc' } });
    return rows.map(toShippingMethodDto);
  }

  async pickupPoints(filter: { city?: string; postalCode?: string }): Promise<PickupPointDto[]> {
    const rows = await this.prisma.pickupPoint.findMany({
      where: {
        isActive: true,
        ...(filter.city ? { city: { equals: filter.city, mode: 'insensitive' } } : {}),
        ...(filter.postalCode ? { postalCode: { startsWith: filter.postalCode.slice(0, 2) } } : {}),
      },
      orderBy: [{ city: 'asc' }, { name: 'asc' }],
    });
    return rows.map(toPickupPointDto);
  }

  async getMethod(code: string, db: Tx | PrismaService = this.prisma): Promise<ShippingMethod> {
    const method = await db.shippingMethod.findUnique({ where: { code: code.toUpperCase() } });
    if (!method || !method.isActive) {
      throw unprocessable(ErrorCode.SHIPPING_METHOD_NOT_FOUND, `El método de envío "${code}" no existe`);
    }
    return method;
  }

  async defaultMethod(): Promise<ShippingMethod | null> {
    return this.prisma.shippingMethod.findUnique({ where: { code: DEFAULT_SHIPPING_CODE } });
  }

  /** Validates the pickup point requirement of a shipping method. */
  async resolvePickupPoint(method: ShippingMethod, pickupPointId: number | undefined, db: Tx | PrismaService = this.prisma): Promise<PickupPoint | null> {
    if (!method.requiresPickupPoint) return null;
    if (!pickupPointId) {
      throw unprocessable(ErrorCode.PICKUP_POINT_REQUIRED, 'Selecciona un punto de recogida para este método de envío');
    }
    const point = await db.pickupPoint.findUnique({ where: { id: pickupPointId } });
    if (!point || !point.isActive) throw notFound(ErrorCode.PICKUP_POINT_NOT_FOUND, 'Punto de recogida no encontrado');
    return point;
  }
}

export function toShippingMethodDto(m: ShippingMethod): ShippingMethodDto {
  return {
    id: m.id,
    code: m.code,
    name: m.name,
    description: m.description,
    priceCents: m.priceCents,
    freeOverCents: m.freeOverCents,
    minDays: m.minDays,
    maxDays: m.maxDays,
    requiresPickupPoint: m.requiresPickupPoint,
  };
}

export function toPickupPointDto(p: PickupPoint): PickupPointDto {
  return {
    id: p.id,
    code: p.code,
    name: p.name,
    address: p.address,
    city: p.city,
    province: p.province,
    postalCode: p.postalCode,
    openingHours: p.openingHours,
  };
}
