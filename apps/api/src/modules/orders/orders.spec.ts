import { ActorType, OrderStatus } from '@prisma/client';
import { AppException } from '../../common/errors';
import { allowedTransitions, canTransition } from './order-state-machine';
import { luhnValid, outcomeFor, TEST_CARDS, validateCard } from './payment-simulator';

describe('order state machine', () => {
  it('allows the happy path only for the right actors', () => {
    expect(canTransition(OrderStatus.PENDING, OrderStatus.PAID, ActorType.SYSTEM)).toBe(true);
    expect(canTransition(OrderStatus.PAID, OrderStatus.PREPARING, ActorType.ADMIN)).toBe(true);
    expect(canTransition(OrderStatus.PAID, OrderStatus.PREPARING, ActorType.CUSTOMER)).toBe(false);
    expect(canTransition(OrderStatus.PREPARING, OrderStatus.SHIPPED, ActorType.ADMIN)).toBe(true);
    expect(canTransition(OrderStatus.SHIPPED, OrderStatus.DELIVERED, ActorType.ADMIN)).toBe(true);
  });

  it('never ships a cancelled order and terminal states have no exits', () => {
    expect(canTransition(OrderStatus.CANCELLED, OrderStatus.SHIPPED, ActorType.ADMIN)).toBe(false);
    expect(allowedTransitions(OrderStatus.CANCELLED, ActorType.ADMIN)).toEqual([]);
    expect(allowedTransitions(OrderStatus.RETURNED, ActorType.ADMIN)).toEqual([]);
  });

  it('customers can cancel pending/paid orders and request returns of delivered ones', () => {
    expect(canTransition(OrderStatus.PENDING, OrderStatus.CANCELLED, ActorType.CUSTOMER)).toBe(true);
    expect(canTransition(OrderStatus.PAID, OrderStatus.CANCELLED, ActorType.CUSTOMER)).toBe(true);
    expect(canTransition(OrderStatus.PREPARING, OrderStatus.CANCELLED, ActorType.CUSTOMER)).toBe(false);
    expect(canTransition(OrderStatus.DELIVERED, OrderStatus.RETURN_REQUESTED, ActorType.CUSTOMER)).toBe(true);
  });
});

describe('payment simulator', () => {
  const future = { holderName: 'Ana', expMonth: 12, expYear: new Date().getFullYear() + 3, cvc: '123' };

  it('all documented test cards pass the Luhn check', () => {
    for (const card of TEST_CARDS) expect(luhnValid(card.number)).toBe(true);
  });

  it('resolves the scenario from the card number', () => {
    expect(validateCard({ ...future, number: '4242 4242 4242 4242' }).scenario).toBe('APPROVED');
    expect(validateCard({ ...future, number: '4000000000009995' }).scenario).toBe('INSUFFICIENT_FUNDS');
    expect(outcomeFor('PENDING_THEN_DECLINED')).toEqual({ kind: 'pending', finalOutcome: 'declined' });
  });

  it('rejects invalid, expired and non-test cards', () => {
    const code = (fn: () => unknown) => {
      try {
        fn();
      } catch (e) {
        return (e as AppException).code;
      }
      return null;
    };
    expect(code(() => validateCard({ ...future, number: '4242424242424241' }))).toBe('CARD_INVALID');
    expect(code(() => validateCard({ ...future, number: '4242424242424242', expYear: 2020 }))).toBe('CARD_EXPIRED');
    expect(code(() => validateCard({ ...future, number: '4111111111111111' }))).toBe('CARD_NOT_ALLOWED');
  });
});
