import { ErrorCode, unprocessable } from '../../common/errors';

/**
 * Deterministic payment simulator. No real payment provider and no real card data:
 * only the documented test cards are accepted. The card number decides the outcome.
 */

export const PAYMENT_SCENARIOS = [
  'APPROVED',
  'DECLINED',
  'INSUFFICIENT_FUNDS',
  'EXPIRED_CARD',
  'PENDING_THEN_APPROVED',
  'PENDING_THEN_DECLINED',
  'PROCESSING_ERROR',
  'TIMEOUT',
] as const;
export type PaymentScenario = (typeof PAYMENT_SCENARIOS)[number];

export interface TestCard {
  number: string;
  brand: 'VISA' | 'MASTERCARD';
  scenario: PaymentScenario;
  description: string;
}

export const TEST_CARDS: TestCard[] = [
  { number: '4242424242424242', brand: 'VISA', scenario: 'APPROVED', description: 'Payment approved' },
  { number: '5555555555554444', brand: 'MASTERCARD', scenario: 'APPROVED', description: 'Payment approved (Mastercard)' },
  { number: '4000000000000002', brand: 'VISA', scenario: 'DECLINED', description: 'Payment declined (card_declined)' },
  { number: '4000000000009995', brand: 'VISA', scenario: 'INSUFFICIENT_FUNDS', description: 'Insufficient funds (insufficient_funds)' },
  { number: '4000000000000069', brand: 'VISA', scenario: 'EXPIRED_CARD', description: 'Card expired according to the issuer (expired_card)' },
  { number: '4000000000000077', brand: 'VISA', scenario: 'PENDING_THEN_APPROVED', description: 'Pending payment approved after PAYMENT_PENDING_DELAY_MS' },
  { number: '4000000000000085', brand: 'VISA', scenario: 'PENDING_THEN_DECLINED', description: 'Pending payment declined after PAYMENT_PENDING_DELAY_MS' },
  { number: '4000000000000119', brand: 'VISA', scenario: 'PROCESSING_ERROR', description: 'Gateway processing error (HTTP 502)' },
  { number: '4000000000000408', brand: 'VISA', scenario: 'TIMEOUT', description: 'Gateway timeout after PAYMENT_TIMEOUT_DELAY_MS (HTTP 504)' },
];

export interface CardInput {
  number: string;
  holderName: string;
  expMonth: number;
  expYear: number;
  cvc: string;
}

export interface ValidatedCard {
  last4: string;
  brand: string;
  holderName: string;
  scenario: PaymentScenario;
}

export function luhnValid(number: string): boolean {
  let sum = 0;
  let alt = false;
  for (let i = number.length - 1; i >= 0; i--) {
    let d = Number(number[i]);
    if (alt) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    alt = !alt;
  }
  return number.length >= 12 && sum % 10 === 0;
}

/** Validates the card form and resolves the simulator scenario. Never stores the full number. */
export function validateCard(input: CardInput, now = new Date()): ValidatedCard {
  const number = input.number.replace(/[\s-]/g, '');
  if (!/^\d{12,19}$/.test(number) || !luhnValid(number)) {
    throw unprocessable(ErrorCode.CARD_INVALID, 'The card number is not valid');
  }
  const expiry = new Date(input.expYear, input.expMonth, 1); // first day of the following month
  if (expiry <= now) {
    throw unprocessable(ErrorCode.CARD_EXPIRED, 'The card has expired');
  }
  const card = TEST_CARDS.find((c) => c.number === number);
  if (!card) {
    throw unprocessable(
      ErrorCode.CARD_NOT_ALLOWED,
      'This environment only accepts test cards. Never enter real card details',
    );
  }
  return { last4: number.slice(-4), brand: card.brand, holderName: input.holderName.trim(), scenario: card.scenario };
}

export type SimulatedOutcome =
  | { kind: 'approved' }
  | { kind: 'declined'; failureCode: string; message: string }
  | { kind: 'pending'; finalOutcome: 'approved' | 'declined' }
  | { kind: 'processing_error' }
  | { kind: 'timeout' };

export function outcomeFor(scenario: PaymentScenario): SimulatedOutcome {
  switch (scenario) {
    case 'APPROVED':
      return { kind: 'approved' };
    case 'DECLINED':
      return { kind: 'declined', failureCode: 'card_declined', message: 'The card issuer declined the payment' };
    case 'INSUFFICIENT_FUNDS':
      return { kind: 'declined', failureCode: 'insufficient_funds', message: 'Fondos insuficientes' };
    case 'EXPIRED_CARD':
      return { kind: 'declined', failureCode: 'expired_card', message: 'The card has expired according to the issuer' };
    case 'PENDING_THEN_APPROVED':
      return { kind: 'pending', finalOutcome: 'approved' };
    case 'PENDING_THEN_DECLINED':
      return { kind: 'pending', finalOutcome: 'declined' };
    case 'PROCESSING_ERROR':
      return { kind: 'processing_error' };
    case 'TIMEOUT':
      return { kind: 'timeout' };
  }
}
