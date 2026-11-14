import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ActorType, Order, OrderPaymentStatus, OrderStatus, Payment, PaymentMethod, PaymentStatus } from '@prisma/client';
import { setTimeout as sleep } from 'node:timers/promises';
import { AppConfig } from '../../config/app-config';
import { AppException, ErrorCode, conflict, notFound } from '../../common/errors';
import { formatEur } from '../../common/utils/money';
import { randomCode } from '../../common/utils/text';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { OrderLifecycleService } from './order-lifecycle.service';
import { isPayable } from './order.mapper';
import { outcomeFor, ValidatedCard } from './payment-simulator';

export interface PaymentRequest {
  method: PaymentMethod;
  card?: ValidatedCard;
  idempotencyKey?: string;
  idempotencyHash?: string;
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly lifecycle: OrderLifecycleService,
    private readonly mail: MailService,
    private readonly config: AppConfig,
  ) {}

  /**
   * Runs a payment attempt for a PENDING order. Only one attempt can run at a time per order
   * (the order is "locked" by moving its paymentStatus to PROCESSING with a conditional update).
   * Gateway errors are raised as 502/504 *after* the attempt has been recorded.
   */
  async pay(order: Order, req: PaymentRequest): Promise<Payment> {
    const acquired = await this.prisma.order.updateMany({
      where: {
        id: order.id,
        status: OrderStatus.PENDING,
        paymentStatus: { in: [OrderPaymentStatus.AWAITING_PAYMENT, OrderPaymentStatus.FAILED] },
      },
      data: { paymentStatus: OrderPaymentStatus.PROCESSING },
    });
    if (acquired.count === 0) {
      const current = await this.prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      if (current.paymentStatus === OrderPaymentStatus.PROCESSING) {
        throw conflict(ErrorCode.PAYMENT_IN_PROGRESS, 'A payment is already in progress for this order');
      }
      throw conflict(ErrorCode.ORDER_NOT_PAYABLE, 'The order does not accept new payments', {
        status: current.status,
        paymentStatus: current.paymentStatus,
      });
    }

    if (req.method === PaymentMethod.BANK_TRANSFER) return this.startBankTransfer(order, req);
    return this.chargeCard(order, req);
  }

  private async startBankTransfer(order: Order, req: PaymentRequest): Promise<Payment> {
    const reservationExpiresAt = new Date(Date.now() + this.config.orders.bankTransferReservationHours * 3_600_000);
    const payment = await this.prisma.$transaction(async (tx) => {
      const p = await tx.payment.create({
        data: {
          orderId: order.id,
          method: PaymentMethod.BANK_TRANSFER,
          status: PaymentStatus.PENDING,
          amountCents: order.totalCents,
          scenario: 'BANK_TRANSFER',
          providerReference: `TRF-${order.orderNumber.slice(4)}-${randomCode(4)}`,
          idempotencyKey: req.idempotencyKey,
          idempotencyHash: req.idempotencyHash,
        },
      });
      await tx.order.update({
        where: { id: order.id },
        data: { paymentStatus: OrderPaymentStatus.AWAITING_PAYMENT, paymentMethod: PaymentMethod.BANK_TRANSFER, reservationExpiresAt },
      });
      return p;
    });
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: order.userId } });
    await this.mail.send(
      {
        to: user.email,
        subject: `Payment instructions · ${order.orderNumber}`,
        template: 'bank-transfer-instructions',
        text:
          `Hi ${user.firstName}, to complete your order ${order.orderNumber} please make a bank transfer of ` +
          `${formatEur(order.totalCents)} to the account ES00 0000 0000 0000 0000 0000 (QA Commerce Lab, fictional account) ` +
          `quoting the reference ${payment.providerReference}. We will hold your products for ${this.config.orders.bankTransferReservationHours} hours.`,
        metadata: { orderId: order.id, reference: payment.providerReference },
      },
      order.testRunId,
    );
    return payment;
  }

  private async chargeCard(order: Order, req: PaymentRequest): Promise<Payment> {
    const card = req.card!;
    const outcome = outcomeFor(card.scenario);
    const payment = await this.prisma.payment.create({
      data: {
        orderId: order.id,
        method: PaymentMethod.CARD,
        status: PaymentStatus.PENDING,
        amountCents: order.totalCents,
        scenario: card.scenario,
        cardBrand: card.brand,
        cardLast4: card.last4,
        cardHolder: card.holderName,
        providerReference: `PAY-${randomCode(12)}`,
        idempotencyKey: req.idempotencyKey,
        idempotencyHash: req.idempotencyHash,
      },
    });
    await this.prisma.order.update({
      where: { id: order.id },
      data: {
        paymentMethod: PaymentMethod.CARD,
        reservationExpiresAt: new Date(Date.now() + this.config.orders.reservationMinutes * 60_000),
      },
    });

    switch (outcome.kind) {
      case 'approved':
        return this.approve(payment.id);
      case 'declined':
        return this.fail(payment.id, PaymentStatus.DECLINED, outcome.failureCode, outcome.message);
      case 'pending':
        return this.prisma.payment.update({
          where: { id: payment.id },
          data: { resolveAt: new Date(Date.now() + this.config.payments.pendingDelayMs) },
        });
      case 'processing_error': {
        const failed = await this.fail(payment.id, PaymentStatus.FAILED, 'processing_error', 'Gateway processing error');
        throw new AppException(HttpStatus.BAD_GATEWAY, ErrorCode.PAYMENT_PROCESSING_ERROR, 'The payment gateway could not process the payment. You can try again', {
          orderId: order.id,
          orderNumber: order.orderNumber,
          paymentId: failed.id,
        });
      }
      case 'timeout': {
        await sleep(this.config.payments.timeoutDelayMs);
        const failed = await this.fail(payment.id, PaymentStatus.FAILED, 'gateway_timeout', 'The gateway did not respond in time');
        throw new AppException(HttpStatus.GATEWAY_TIMEOUT, ErrorCode.PAYMENT_GATEWAY_TIMEOUT, 'The payment gateway did not respond in time. Check the order status before retrying', {
          orderId: order.id,
          orderNumber: order.orderNumber,
          paymentId: failed.id,
        });
      }
    }
  }

  /** Marks a payment as approved and moves the order to PAID. Safe against concurrent resolution. */
  async approve(paymentId: number, actor: ActorType = ActorType.SYSTEM, actorUserId?: number): Promise<Payment> {
    const res = await this.prisma.payment.updateMany({
      where: { id: paymentId, status: PaymentStatus.PENDING },
      data: { status: PaymentStatus.APPROVED, resolvedAt: new Date() },
    });
    const payment = await this.prisma.payment.findUniqueOrThrow({ where: { id: paymentId }, include: { order: true } });
    if (res.count === 1) {
      // Any other pending attempt (e.g. an abandoned bank transfer) is superseded by this payment.
      await this.prisma.payment.updateMany({
        where: { orderId: payment.orderId, id: { not: paymentId }, status: PaymentStatus.PENDING },
        data: { status: PaymentStatus.FAILED, failureCode: 'superseded', failureMessage: 'Superseded by another payment', resolvedAt: new Date() },
      });
    }
    if (res.count === 1 && payment.order.status === OrderStatus.PENDING) {
      await this.lifecycle.transition(payment.orderId, OrderStatus.PAID, { type: actor, userId: actorUserId }, {
        note: payment.method === PaymentMethod.BANK_TRANSFER ? 'Bank transfer received' : `Card payment ${payment.cardBrand} ****${payment.cardLast4}`,
      });
    }
    const { order: _order, ...rest } = payment;
    return { ...rest, status: res.count === 1 ? PaymentStatus.APPROVED : rest.status };
  }

  async fail(paymentId: number, status: PaymentStatus, failureCode: string, failureMessage: string): Promise<Payment> {
    return this.prisma.$transaction(async (tx) => {
      const res = await tx.payment.updateMany({
        where: { id: paymentId, status: PaymentStatus.PENDING },
        data: { status, failureCode, failureMessage, resolvedAt: new Date() },
      });
      const payment = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
      if (res.count === 1) {
        await tx.order.updateMany({
          where: { id: payment.orderId, status: OrderStatus.PENDING, paymentStatus: OrderPaymentStatus.PROCESSING },
          data: { paymentStatus: OrderPaymentStatus.FAILED },
        });
      }
      return payment;
    });
  }

  /** Resolves a PENDING card payment (used by the background job and the testing API). */
  async resolvePending(paymentId: number, forced?: 'APPROVED' | 'DECLINED'): Promise<Payment> {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) throw notFound(ErrorCode.PAYMENT_NOT_FOUND, 'Payment not found');
    if (payment.status !== PaymentStatus.PENDING) {
      throw conflict(ErrorCode.CONFLICT, 'The payment is already resolved', { status: payment.status });
    }
    const final =
      forced ?? (payment.scenario === 'PENDING_THEN_DECLINED' ? 'DECLINED' : 'APPROVED');
    if (final === 'APPROVED') return this.approve(payment.id);
    return this.fail(payment.id, PaymentStatus.DECLINED, 'card_declined', 'The card issuer declined the payment after review');
  }

  async resolveDuePendingPayments(): Promise<number> {
    const due = await this.prisma.payment.findMany({
      where: { status: PaymentStatus.PENDING, method: PaymentMethod.CARD, resolveAt: { lte: new Date() } },
      select: { id: true },
      take: 100,
    });
    let resolved = 0;
    for (const p of due) {
      try {
        await this.resolvePending(p.id);
        resolved++;
      } catch (err) {
        this.logger.warn(`Could not resolve payment ${p.id}: ${(err as Error).message}`);
      }
    }
    return resolved;
  }

  /** Admin confirms a bank transfer for a pending order. */
  async confirmBankTransfer(orderId: number, adminId: number): Promise<void> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: { payments: true } });
    if (!order) throw notFound(ErrorCode.ORDER_NOT_FOUND, 'Order not found');
    const pending = order.payments.find((p) => p.method === PaymentMethod.BANK_TRANSFER && p.status === PaymentStatus.PENDING);
    if (order.status !== OrderStatus.PENDING || !pending) {
      throw conflict(ErrorCode.ORDER_NOT_PAYABLE, 'The order has no pending bank transfer to confirm', {
        status: order.status,
        paymentStatus: order.paymentStatus,
      });
    }
    await this.approve(pending.id, ActorType.ADMIN, adminId);
  }

  isPayable(order: Order): boolean {
    return isPayable(order);
  }
}
