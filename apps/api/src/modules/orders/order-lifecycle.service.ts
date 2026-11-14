import { Injectable, Logger } from '@nestjs/common';
import { ActorType, Order, OrderPaymentStatus, OrderStatus, PaymentStatus, Prisma } from '@prisma/client';
import { AppConfig } from '../../config/app-config';
import { ErrorCode, conflict, notFound, unprocessable } from '../../common/errors';
import { formatEur } from '../../common/utils/money';
import { randomCode } from '../../common/utils/text';
import { PrismaService, Tx } from '../../prisma/prisma.service';
import { MailService, OutgoingEmail } from '../mail/mail.service';
import { returnDeadline } from './order.mapper';
import { allowedTransitions, canTransition, ORDER_STATUS_LABELS, SALES_COUNTED_STATUSES } from './order-state-machine';

export interface Actor {
  type: ActorType;
  userId?: number;
}

export interface TransitionOptions {
  note?: string;
  reason?: string;
  trackingNumber?: string;
  /** Skip the actor permission check (testing API fixtures only) */
  force?: boolean;
  at?: Date;
}

/**
 * Applies order status transitions with all their side effects, atomically:
 * stock restoration, refunds, coupon release, sales counters, history and e-mails.
 */
@Injectable()
export class OrderLifecycleService {
  private readonly logger = new Logger(OrderLifecycleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: AppConfig,
  ) {}

  async transition(orderId: number, to: OrderStatus, actor: Actor, opts: TransitionOptions = {}, outerTx?: Tx): Promise<Order> {
    const emails: OutgoingEmail[] = [];
    const run = (tx: Tx) => this.applyTransition(tx, orderId, to, actor, opts, emails);
    const order = outerTx ? await run(outerTx) : await this.prisma.$transaction(run, { timeout: 15_000 });
    const runId = order.testRunId;
    for (const e of emails) await this.mail.send(e, runId).catch((err: Error) => this.logger.warn(err.message));
    return order;
  }

  private async applyTransition(
    tx: Tx,
    orderId: number,
    to: OrderStatus,
    actor: Actor,
    opts: TransitionOptions,
    emails: OutgoingEmail[],
  ): Promise<Order> {
    const order = await tx.order.findUnique({ where: { id: orderId }, include: { items: true, user: true } });
    if (!order) throw notFound(ErrorCode.ORDER_NOT_FOUND, 'Pedido no encontrado');
    const from = order.status;
    const now = opts.at ?? new Date();

    if (!opts.force && !canTransition(from, to, actor.type)) {
      const code = to === OrderStatus.CANCELLED ? ErrorCode.ORDER_NOT_CANCELLABLE : to === OrderStatus.RETURN_REQUESTED ? ErrorCode.ORDER_NOT_RETURNABLE : ErrorCode.INVALID_STATUS_TRANSITION;
      throw conflict(code, `No se puede pasar un pedido de "${ORDER_STATUS_LABELS[from]}" a "${ORDER_STATUS_LABELS[to]}"`, {
        from,
        to,
        allowed: allowedTransitions(from, actor.type),
      });
    }
    if (to === OrderStatus.CANCELLED && order.paymentStatus === OrderPaymentStatus.PROCESSING) {
      throw conflict(ErrorCode.PAYMENT_IN_PROGRESS, 'Hay un pago en curso. Espera a que se resuelva antes de cancelar');
    }
    if (to === OrderStatus.RETURN_REQUESTED && !opts.force) {
      const deadline = returnDeadline(order, this.config.orders.returnWindowDays);
      if (!deadline || deadline <= now) {
        throw unprocessable(
          ErrorCode.RETURN_WINDOW_EXPIRED,
          `El plazo de devolución (${this.config.orders.returnWindowDays} días desde la entrega) ha finalizado`,
          { returnDeadline: deadline },
        );
      }
    }

    const data: Prisma.OrderUpdateManyMutationInput = { status: to };
    switch (to) {
      case OrderStatus.PAID:
        data.paidAt = now;
        data.paymentStatus = OrderPaymentStatus.PAID;
        data.reservationExpiresAt = null;
        break;
      case OrderStatus.PREPARING:
        data.preparingAt = now;
        break;
      case OrderStatus.SHIPPED:
        data.shippedAt = now;
        data.trackingNumber = opts.trackingNumber ?? `TRK${randomCode(10)}`;
        break;
      case OrderStatus.DELIVERED:
        if (from === OrderStatus.SHIPPED) data.deliveredAt = now;
        break;
      case OrderStatus.CANCELLED:
        data.cancelledAt = now;
        data.cancelReason = opts.reason ?? opts.note ?? null;
        data.reservationExpiresAt = null;
        break;
      case OrderStatus.RETURN_REQUESTED:
        data.returnRequestedAt = now;
        data.returnReason = opts.reason ?? null;
        break;
      case OrderStatus.RETURNED:
        data.returnedAt = now;
        break;
    }

    // Optimistic concurrency: the update only succeeds if nobody changed the status meanwhile.
    const updated = await tx.order.updateMany({ where: { id: orderId, status: from }, data });
    if (updated.count === 0) {
      throw conflict(ErrorCode.CONFLICT, 'El pedido ha cambiado mientras se procesaba la operación. Vuelve a cargarlo');
    }

    const wasSalesCounted = SALES_COUNTED_STATUSES.includes(from);
    const productItems = order.items.filter((i) => i.productId !== null);

    if (to === OrderStatus.PAID) {
      for (const item of productItems) {
        await tx.product.update({ where: { id: item.productId! }, data: { salesCount: { increment: item.quantity } } });
      }
    }

    if (to === OrderStatus.CANCELLED || to === OrderStatus.RETURNED) {
      // Restore inventory (only if this order still holds it) and sales counters
      for (const item of productItems) {
        await tx.product.update({
          where: { id: item.productId! },
          data: {
            ...(order.stockReserved ? { stock: { increment: item.quantity } } : {}),
            ...(wasSalesCounted ? { salesCount: { decrement: item.quantity } } : {}),
          },
        });
      }
      if (order.stockReserved) await tx.order.update({ where: { id: orderId }, data: { stockReserved: false } });
      // Refund or void payments
      if (order.paymentStatus === OrderPaymentStatus.PAID) {
        await tx.payment.updateMany({
          where: { orderId, status: PaymentStatus.APPROVED },
          data: { status: PaymentStatus.REFUNDED, refundedAt: now },
        });
        await tx.order.update({ where: { id: orderId }, data: { paymentStatus: OrderPaymentStatus.REFUNDED } });
      } else {
        await tx.payment.updateMany({
          where: { orderId, status: PaymentStatus.PENDING },
          data: { status: PaymentStatus.FAILED, failureCode: 'order_cancelled', failureMessage: 'Pedido cancelado', resolvedAt: now },
        });
      }
      // A cancelled order releases its coupon redemption
      if (to === OrderStatus.CANCELLED && order.couponId) {
        const redemption = await tx.couponRedemption.findUnique({ where: { orderId } });
        if (redemption) {
          await tx.couponRedemption.delete({ where: { orderId } });
          await tx.coupon.update({ where: { id: order.couponId }, data: { timesUsed: { decrement: 1 } } });
        }
      }
    }

    await tx.orderStatusHistory.create({
      data: {
        orderId,
        fromStatus: from,
        toStatus: to,
        note: opts.note ?? opts.reason ?? null,
        actorType: actor.type,
        actorUserId: actor.userId ?? null,
        createdAt: now,
      },
    });

    const email = this.emailFor(order.orderNumber, order.user.email, order.user.firstName, to, order.totalCents, data.trackingNumber as string | undefined);
    if (email) emails.push({ ...email, metadata: { orderId, orderNumber: order.orderNumber, status: to } });

    return tx.order.findUniqueOrThrow({ where: { id: orderId } });
  }

  private emailFor(
    orderNumber: string,
    to: string,
    name: string,
    status: OrderStatus,
    totalCents: number,
    tracking?: string,
  ): Omit<OutgoingEmail, 'metadata'> | null {
    const base = { to };
    switch (status) {
      case OrderStatus.PAID:
        return { ...base, template: 'order-paid', subject: `Pedido ${orderNumber} confirmado`, text: `Hola ${name}, hemos recibido el pago de tu pedido ${orderNumber} (${formatEur(totalCents)}). Te avisaremos cuando salga del almacén.` };
      case OrderStatus.SHIPPED:
        return { ...base, template: 'order-shipped', subject: `Tu pedido ${orderNumber} está en camino`, text: `Hola ${name}, tu pedido ${orderNumber} ha sido enviado. Número de seguimiento: ${tracking ?? '-'}.` };
      case OrderStatus.DELIVERED:
        return { ...base, template: 'order-delivered', subject: `Pedido ${orderNumber} entregado`, text: `Hola ${name}, tu pedido ${orderNumber} ha sido entregado. Dispones de ${this.config.orders.returnWindowDays} días para devolverlo.` };
      case OrderStatus.CANCELLED:
        return { ...base, template: 'order-cancelled', subject: `Pedido ${orderNumber} cancelado`, text: `Hola ${name}, tu pedido ${orderNumber} ha sido cancelado. Si estaba pagado, recibirás el reembolso de ${formatEur(totalCents)}.` };
      case OrderStatus.RETURN_REQUESTED:
        return { ...base, template: 'return-requested', subject: `Devolución solicitada · ${orderNumber}`, text: `Hola ${name}, hemos registrado tu solicitud de devolución del pedido ${orderNumber}.` };
      case OrderStatus.RETURNED:
        return { ...base, template: 'order-returned', subject: `Devolución completada · ${orderNumber}`, text: `Hola ${name}, hemos procesado la devolución del pedido ${orderNumber} y reembolsado ${formatEur(totalCents)}.` };
      default:
        return null;
    }
  }
}
