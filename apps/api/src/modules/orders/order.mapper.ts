import {
  ActorType,
  Order,
  OrderItem,
  OrderPaymentStatus,
  OrderStatus,
  OrderStatusHistory,
  Payment,
  PickupPoint,
  Prisma,
} from '@prisma/client';
import { toPickupPointDto } from '../cart/shipping.service';
import { OrderAddressDto, OrderDto, OrderSummaryDto, PaymentDto } from './dto/order.dto';
import { canTransition } from './order-state-machine';

export const orderDetailInclude = {
  items: { orderBy: { id: 'asc' }, include: { product: { select: { slug: true } } } },
  payments: { orderBy: { id: 'asc' } },
  history: { orderBy: { id: 'asc' } },
  pickupPoint: true,
} satisfies Prisma.OrderInclude;

export type OrderWithDetails = Order & {
  items: Array<OrderItem & { product: { slug: string } | null }>;
  payments: Payment[];
  history: OrderStatusHistory[];
  pickupPoint: PickupPoint | null;
};

export function toPaymentDto(p: Payment): PaymentDto {
  return {
    id: p.id,
    method: p.method,
    status: p.status,
    amountCents: p.amountCents,
    cardBrand: p.cardBrand,
    cardLast4: p.cardLast4,
    failureCode: p.failureCode,
    failureMessage: p.failureMessage,
    providerReference: p.providerReference,
    resolveAt: p.resolveAt,
    createdAt: p.createdAt,
    resolvedAt: p.resolvedAt,
  };
}

export function returnDeadline(order: Pick<Order, 'deliveredAt'>, returnWindowDays: number): Date | null {
  return order.deliveredAt ? new Date(order.deliveredAt.getTime() + returnWindowDays * 86_400_000) : null;
}

export function isPayable(order: Pick<Order, 'status' | 'paymentStatus' | 'reservationExpiresAt'>, now = new Date()): boolean {
  return (
    order.status === OrderStatus.PENDING &&
    (order.paymentStatus === OrderPaymentStatus.AWAITING_PAYMENT || order.paymentStatus === OrderPaymentStatus.FAILED) &&
    (!order.reservationExpiresAt || order.reservationExpiresAt > now)
  );
}

export function toOrderSummary(o: Order & { items: Array<Pick<OrderItem, 'quantity' | 'imageUrl'>> }): OrderSummaryDto {
  return {
    id: o.id,
    orderNumber: o.orderNumber,
    status: o.status,
    paymentStatus: o.paymentStatus,
    paymentMethod: o.paymentMethod,
    totalCents: o.totalCents,
    itemsCount: o.items.reduce((acc, i) => acc + i.quantity, 0),
    previewImages: o.items
      .map((i) => i.imageUrl)
      .filter((u): u is string => !!u)
      .slice(0, 4),
    createdAt: o.createdAt,
  };
}

export function toOrderDto(o: OrderWithDetails, returnWindowDays: number, now = new Date()): OrderDto {
  const deadline = returnDeadline(o, returnWindowDays);
  return {
    ...toOrderSummary(o),
    items: o.items.map((i) => ({
      id: i.id,
      productId: i.productId,
      productSlug: i.product?.slug ?? null,
      sku: i.sku,
      name: i.name,
      brandName: i.brandName,
      imageUrl: i.imageUrl,
      unitPriceCents: i.unitPriceCents,
      compareAtPriceCents: i.compareAtPriceCents,
      quantity: i.quantity,
      lineTotalCents: i.lineTotalCents,
    })),
    shippingAddress: o.shippingAddress as unknown as OrderAddressDto,
    shippingMethod: { code: o.shippingMethodCode, name: o.shippingMethodName },
    pickupPoint: o.pickupPoint ? toPickupPointDto(o.pickupPoint) : null,
    subtotalCents: o.subtotalCents,
    discountCents: o.discountCents,
    shippingCents: o.shippingCents,
    taxCents: o.taxCents,
    couponCode: o.couponCode,
    customerNote: o.customerNote,
    trackingNumber: o.trackingNumber,
    reservationExpiresAt: o.status === OrderStatus.PENDING ? o.reservationExpiresAt : null,
    paidAt: o.paidAt,
    preparingAt: o.preparingAt,
    shippedAt: o.shippedAt,
    deliveredAt: o.deliveredAt,
    cancelledAt: o.cancelledAt,
    cancelReason: o.cancelReason,
    returnRequestedAt: o.returnRequestedAt,
    returnReason: o.returnReason,
    returnedAt: o.returnedAt,
    history: o.history.map((h) => ({
      fromStatus: h.fromStatus,
      toStatus: h.toStatus,
      note: h.note,
      actorType: h.actorType,
      createdAt: h.createdAt,
    })),
    payments: o.payments.map(toPaymentDto),
    actions: {
      canCancel:
        canTransition(o.status, OrderStatus.CANCELLED, ActorType.CUSTOMER) &&
        o.paymentStatus !== OrderPaymentStatus.PROCESSING,
      canRequestReturn: o.status === OrderStatus.DELIVERED && !!deadline && deadline > now,
      canPay: isPayable(o, now),
      returnDeadline: o.status === OrderStatus.DELIVERED ? deadline : null,
    },
    updatedAt: o.updatedAt,
  };
}
