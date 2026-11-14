import { CreditCard, FlaskConical, Landmark } from 'lucide-react';
import { useState } from 'react';
import { cn } from '../../lib/cn';
import type { PaymentMethod } from '../../lib/types';
import { Input } from '../ui/Field';

export interface CardValues {
  number: string;
  holderName: string;
  expiry: string;
  cvc: string;
}

export const emptyCard: CardValues = { number: '', holderName: '', expiry: '', cvc: '' };

export const TEST_CARDS = [
  ['4242 4242 4242 4242', 'Pago aprobado'],
  ['4000 0000 0000 0002', 'Pago rechazado'],
  ['4000 0000 0000 9995', 'Fondos insuficientes'],
  ['4000 0000 0000 0077', 'Pendiente → aprobado'],
  ['4000 0000 0000 0085', 'Pendiente → rechazado'],
  ['4000 0000 0000 0119', 'Error de procesamiento'],
  ['4000 0000 0000 0408', 'Timeout de la pasarela'],
] as const;

export function validateCard(card: CardValues): Partial<Record<keyof CardValues, string>> {
  const errors: Partial<Record<keyof CardValues, string>> = {};
  const digits = card.number.replace(/\D/g, '');
  if (digits.length < 12 || digits.length > 19) errors.number = 'Introduce un número de tarjeta válido';
  if (card.holderName.trim().length < 2) errors.holderName = 'Indica el titular de la tarjeta';
  const m = card.expiry.match(/^(\d{2})\s*\/\s*(\d{2})$/);
  if (!m || Number(m[1]) < 1 || Number(m[1]) > 12) errors.expiry = 'Formato MM/AA';
  else {
    const exp = new Date(2000 + Number(m[2]), Number(m[1]), 1);
    if (exp <= new Date()) errors.expiry = 'La tarjeta está caducada';
  }
  if (!/^\d{3,4}$/.test(card.cvc)) errors.cvc = 'CVC de 3 o 4 dígitos';
  return errors;
}

export function toCardPayload(card: CardValues) {
  const [mm, yy] = card.expiry.split('/').map((s) => s.trim());
  return { number: card.number.replace(/\s/g, ''), holderName: card.holderName.trim(), expMonth: Number(mm), expYear: 2000 + Number(yy), cvc: card.cvc };
}

export function PaymentFields({
  method,
  onMethod,
  card,
  onCard,
  errors,
}: {
  method: PaymentMethod;
  onMethod: (m: PaymentMethod) => void;
  card: CardValues;
  onCard: (c: CardValues) => void;
  errors: Partial<Record<keyof CardValues, string>>;
}) {
  const [showCards, setShowCards] = useState(false);
  const option = (value: PaymentMethod, title: string, text: string, Icon: typeof CreditCard) => (
    <label className={cn('card flex cursor-pointer items-start gap-3 p-4 transition', method === value ? 'border-brand-500 ring-2 ring-brand-100' : 'hover:border-slate-300')}>
      <input type="radio" name="paymentMethod" value={value} checked={method === value} onChange={() => onMethod(value)} className="mt-1 h-4 w-4 accent-brand-600" data-testid={`payment-method-${value}`} />
      <Icon className="mt-0.5 h-5 w-5 text-brand-600" aria-hidden="true" />
      <span>
        <span className="block font-semibold">{title}</span>
        <span className="block text-sm text-slate-500">{text}</span>
      </span>
    </label>
  );
  const set = (k: keyof CardValues, v: string) => onCard({ ...card, [k]: v });
  return (
    <div className="space-y-4">
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="sr-only">Método de pago</legend>
        {option('CARD', 'Tarjeta de crédito o débito', 'Pago inmediato con tarjetas de prueba', CreditCard)}
        {option('BANK_TRANSFER', 'Transferencia bancaria', 'Reservamos tu pedido 72 h hasta recibirla', Landmark)}
      </fieldset>
      {method === 'CARD' && (
        <div className="space-y-4" data-testid="card-form">
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <p className="flex items-center gap-2 font-semibold">
              <FlaskConical className="h-4 w-4" /> Entorno de pruebas: nunca introduzcas una tarjeta real
            </p>
            <button type="button" className="mt-1 text-xs font-semibold underline" onClick={() => setShowCards((s) => !s)} aria-expanded={showCards} data-testid="toggle-test-cards">
              {showCards ? 'Ocultar' : 'Ver'} tarjetas de prueba
            </button>
            {showCards && (
              <ul className="mt-2 grid gap-1 text-xs sm:grid-cols-2" data-testid="test-cards">
                {TEST_CARDS.map(([n, label]) => (
                  <li key={n}>
                    <button type="button" className="font-mono hover:underline" onClick={() => set('number', n)}>
                      {n}
                    </button>{' '}
                    · {label}
                  </li>
                ))}
                <li className="sm:col-span-2">Cualquier titular, fecha futura (MM/AA) y CVC de 3 dígitos.</li>
              </ul>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Número de tarjeta"
              required
              inputMode="numeric"
              autoComplete="off"
              placeholder="4242 4242 4242 4242"
              value={card.number}
              maxLength={23}
              onChange={(e) => set('number', e.target.value.replace(/[^\d ]/g, ''))}
              error={errors.number}
              wrapperClassName="sm:col-span-2"
              data-testid="card-number"
            />
            <Input label="Titular" required autoComplete="off" value={card.holderName} onChange={(e) => set('holderName', e.target.value)} error={errors.holderName} wrapperClassName="sm:col-span-2" data-testid="card-holder" />
            <Input
              label="Caducidad (MM/AA)"
              required
              placeholder="12/30"
              inputMode="numeric"
              autoComplete="off"
              maxLength={5}
              value={card.expiry}
              onChange={(e) => {
                let v = e.target.value.replace(/[^\d/]/g, '');
                if (/^\d{2}$/.test(v) && card.expiry.length < v.length) v = `${v}/`;
                set('expiry', v);
              }}
              error={errors.expiry}
              data-testid="card-expiry"
            />
            <Input label="CVC" required inputMode="numeric" autoComplete="off" maxLength={4} value={card.cvc} onChange={(e) => set('cvc', e.target.value.replace(/\D/g, ''))} error={errors.cvc} data-testid="card-cvc" />
          </div>
        </div>
      )}
      {method === 'BANK_TRANSFER' && (
        <p className="rounded-xl bg-slate-100 p-3 text-sm text-slate-700" data-testid="transfer-info">
          Al confirmar recibirás la referencia y los datos de la cuenta (ficticia). El pedido se cancelará automáticamente si no recibimos la transferencia en 72 horas.
        </p>
      )}
    </div>
  );
}
