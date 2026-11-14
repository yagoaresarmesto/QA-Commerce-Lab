import { ActorType, OrderStatus } from '@prisma/client';

/**
 * Order lifecycle. Single source of truth for allowed transitions and who may perform them.
 *
 *  PENDING ──payment──▶ PAID ──▶ PREPARING ──▶ SHIPPED ──▶ DELIVERED ──▶ RETURN_REQUESTED ──▶ RETURNED
 *     │                  │           │                                          │
 *     └──▶ CANCELLED ◀───┴───────────┘                                          └──(rejected)──▶ DELIVERED
 */
const { CUSTOMER, ADMIN, SYSTEM } = ActorType;

export const ORDER_TRANSITIONS: Record<OrderStatus, Partial<Record<OrderStatus, ActorType[]>>> = {
  PENDING: { PAID: [SYSTEM, ADMIN], CANCELLED: [CUSTOMER, ADMIN, SYSTEM] },
  PAID: { PREPARING: [ADMIN], CANCELLED: [CUSTOMER, ADMIN] },
  PREPARING: { SHIPPED: [ADMIN], CANCELLED: [ADMIN] },
  SHIPPED: { DELIVERED: [ADMIN] },
  DELIVERED: { RETURN_REQUESTED: [CUSTOMER] },
  RETURN_REQUESTED: { RETURNED: [ADMIN], DELIVERED: [ADMIN] },
  CANCELLED: {},
  RETURNED: {},
};

export function canTransition(from: OrderStatus, to: OrderStatus, actor: ActorType): boolean {
  return ORDER_TRANSITIONS[from][to]?.includes(actor) ?? false;
}

export function allowedTransitions(from: OrderStatus, actor: ActorType): OrderStatus[] {
  return (Object.entries(ORDER_TRANSITIONS[from]) as Array<[OrderStatus, ActorType[]]>)
    .filter(([, actors]) => actors.includes(actor))
    .map(([to]) => to);
}

/** Statuses in which the order still holds stock (used by cleanup routines). */
export const STOCK_HOLDING_STATUSES: OrderStatus[] = [
  OrderStatus.PENDING,
  OrderStatus.PAID,
  OrderStatus.PREPARING,
  OrderStatus.SHIPPED,
  OrderStatus.DELIVERED,
  OrderStatus.RETURN_REQUESTED,
];

/** Statuses in which the order has been counted in product salesCount. */
export const SALES_COUNTED_STATUSES: OrderStatus[] = [
  OrderStatus.PAID,
  OrderStatus.PREPARING,
  OrderStatus.SHIPPED,
  OrderStatus.DELIVERED,
  OrderStatus.RETURN_REQUESTED,
];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: 'Pending',
  PAID: 'Paid',
  PREPARING: 'Preparing',
  SHIPPED: 'Shipped',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  RETURN_REQUESTED: 'Return requested',
  RETURNED: 'Returned',
};
