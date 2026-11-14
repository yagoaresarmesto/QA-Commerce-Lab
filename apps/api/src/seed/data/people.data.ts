/**
 * Reference users. Credentials are public on purpose: this is a lab with fictional data.
 * NEVER reuse these passwords anywhere else.
 */
export const ADMIN_PASSWORD = 'Admin123!';
export const CUSTOMER_PASSWORD = 'Customer123!';

export interface UserDef {
  key: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  role: 'ADMIN' | 'CUSTOMER';
  status: 'ACTIVE' | 'DISABLED';
  description: string;
}

export const REFERENCE_USERS: UserDef[] = [
  { key: 'admin', email: 'admin@qacommerce.test', firstName: 'Laura', lastName: 'Martín Admin', phone: '600000001', role: 'ADMIN', status: 'ACTIVE', description: 'Store administrator' },
  { key: 'customer', email: 'customer@qacommerce.test', firstName: 'Carlos', lastName: 'Pérez Gil', phone: '600000002', role: 'CUSTOMER', status: 'ACTIVE', description: 'Standard user with one address and no orders' },
  { key: 'noorders', email: 'noorders@qacommerce.test', firstName: 'Lucía', lastName: 'Fernández Ortega', role: 'CUSTOMER', status: 'ACTIVE', description: 'User without orders, addresses or favorites' },
  { key: 'orders', email: 'orders@qacommerce.test', firstName: 'Javier', lastName: 'Ruiz Navarro', phone: '600000004', role: 'CUSTOMER', status: 'ACTIVE', description: 'User with an order history covering every status' },
  { key: 'favorites', email: 'favorites@qacommerce.test', firstName: 'Marta', lastName: 'Gómez Vidal', phone: '600000005', role: 'CUSTOMER', status: 'ACTIVE', description: 'User with 6 favorite products' },
  { key: 'addresses', email: 'addresses@qacommerce.test', firstName: 'Pablo', lastName: 'Sánchez Molina', phone: '600000006', role: 'CUSTOMER', status: 'ACTIVE', description: 'User with 4 saved addresses' },
  { key: 'disabled', email: 'disabled@qacommerce.test', firstName: 'Elena', lastName: 'Torres Ramos', role: 'CUSTOMER', status: 'DISABLED', description: 'Disabled user (cannot sign in)' },
];

const REVIEWER_NAMES: Array<[string, string]> = [
  ['Ana', 'López'], ['David', 'Moreno'], ['Sara', 'Jiménez'], ['Miguel', 'Álvarez'], ['Paula', 'Romero'], ['Hugo', 'Navarro'],
  ['Irene', 'Domínguez'], ['Álvaro', 'Gil'], ['Nerea', 'Serrano'], ['Raúl', 'Castro'], ['Claudia', 'Ortiz'], ['Iván', 'Rubio'],
];

export const REVIEWERS: UserDef[] = REVIEWER_NAMES.map(([firstName, lastName], i) => ({
  key: `reviewer${String(i + 1).padStart(2, '0')}`,
  email: `reviewer${String(i + 1).padStart(2, '0')}@qacommerce.test`,
  firstName,
  lastName,
  role: 'CUSTOMER',
  status: 'ACTIVE',
  description: 'Author of sample reviews',
}));

/** [label, fullName, phone, line1, line2, city, province, postalCode] */
export type AddressDef = [string | null, string, string, string, string | null, string, string, string];

export const USER_ADDRESSES: Record<string, AddressDef[]> = {
  customer: [['Home', 'Carlos Pérez Gil', '600000002', 'Calle de Alcalá 120, 4º B', null, 'Madrid', 'Madrid', '28009']],
  orders: [['Home', 'Javier Ruiz Navarro', '600000004', 'Avinguda Diagonal 400, 2º 1ª', null, 'Barcelona', 'Barcelona', '08037']],
  favorites: [['Home', 'Marta Gómez Vidal', '600000005', 'Calle Colón 15, 1º', null, 'Valencia', 'Valencia', '46004']],
  addresses: [
    ['Home', 'Pablo Sánchez Molina', '600000006', 'Calle Sierpes 30, 3º A', null, 'Sevilla', 'Sevilla', '41004'],
    ['Work', 'Pablo Sánchez Molina', '600000006', 'Avenida de la Constitución 2', 'Oficina 5', 'Sevilla', 'Sevilla', '41001'],
    ['Parents', 'Rosa Molina Prieto', '611222333', 'Calle Mayor 8', null, 'Córdoba', 'Córdoba', '14001'],
    ['Beach apartment', 'Pablo Sánchez Molina', '600000006', 'Paseo Marítimo 45, 7º C', 'Edificio Las Gaviotas', 'Málaga', 'Málaga', '29016'],
  ],
};

/** Index (0-based) of the default address per user */
export const DEFAULT_ADDRESS_INDEX: Record<string, number> = { customer: 0, orders: 0, favorites: 0, addresses: 1 };

/** SKUs saved as favorites by favorites@ (includes an out-of-stock and a discontinued product) */
export const FAVORITE_SKUS = ['QCL-LAP-003', 'QCL-GPU-003', 'QCL-MON-002', 'QCL-AUD-001', 'QCL-PHN-002', 'QCL-DSK-010'];

/** Coupons [code, description, type, value, minSubtotalCents, maxDiscountCents, categorySlug, startsOffsetDays, expiresOffsetDays, usageLimit, perUserLimit, isActive, artificialTimesUsed] */
export type CouponDef = [string, string, 'PERCENTAGE' | 'FIXED_AMOUNT' | 'FREE_SHIPPING', number, number | null, number | null, string | null, number | null, number | null, number | null, number, boolean, number];

export const COUPONS: CouponDef[] = [
  ['WELCOME10', '10% off your first order (minimum €50)', 'PERCENTAGE', 10, 5000, null, null, -30, 365, null, 1, true, 0],
  ['FREESHIP', 'Free shipping on any order', 'FREE_SHIPPING', 0, null, null, null, -30, 365, null, 5, true, 0],
  ['SAVE20', '€20 off orders over €150', 'FIXED_AMOUNT', 2000, 15000, null, null, -30, 365, null, 3, true, 0],
  ['COMPONENTS15', '15% off PC components (up to €100)', 'PERCENTAGE', 15, null, 10000, 'components', -30, 365, null, 2, true, 0],
  ['HEADPHONES5', '€5 off headphones (minimum €30)', 'FIXED_AMOUNT', 500, 3000, null, 'headphones', -30, 365, null, 2, true, 0],
  ['EXPIRED', 'Summer coupon (already expired)', 'PERCENTAGE', 10, null, null, null, -120, -1, null, 1, true, 0],
  ['COMINGSOON', 'Christmas coupon (not available yet)', 'PERCENTAGE', 15, null, null, null, 30, 60, null, 1, true, 0],
  ['USEDUP', 'Promotional coupon that has reached its usage limit', 'PERCENTAGE', 20, null, null, null, -30, 365, 100, 1, true, 100],
  ['INACTIVE', 'Coupon deactivated by the store', 'PERCENTAGE', 25, null, null, null, -30, 365, null, 1, false, 0],
];

export const REVIEW_TEMPLATES: Record<number, Array<[string, string]>> = {
  5: [
    ['Excellent purchase', 'Works wonderfully from day one. Very good build quality and it arrived earlier than expected.'],
    ['Highly recommended', 'It exceeded my expectations. The value for money is hard to beat in this range.'],
    ['Perfect', 'Exactly what I was looking for. I use it every day and have had no problems at all.'],
  ],
  4: [
    ['Very good product', 'Does what it promises. One star off because the packaging could be better.'],
    ['Good value for money', 'Performs well and is easy to set up. I miss a few accessories in the box.'],
  ],
  3: [
    ['Fine, nothing more', 'It does the job, although I expected a bit more for the price. Fine for basic use.'],
    ['Does the job', 'Decent product. The instructions could be better and it took me a while to set up.'],
  ],
  2: [['Not convinced', 'It has some finishing flaws and performance is below what was advertised.']],
  1: [['Disappointing', 'I had to contact support after a few days. I would not buy it again.']],
};
