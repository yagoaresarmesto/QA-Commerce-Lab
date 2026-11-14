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
  { key: 'admin', email: 'admin@qacommerce.test', firstName: 'Laura', lastName: 'Martín Admin', phone: '600000001', role: 'ADMIN', status: 'ACTIVE', description: 'Administrador de la tienda' },
  { key: 'customer', email: 'customer@qacommerce.test', firstName: 'Carlos', lastName: 'Pérez Gil', phone: '600000002', role: 'CUSTOMER', status: 'ACTIVE', description: 'Usuario estándar con una dirección y sin pedidos' },
  { key: 'noorders', email: 'noorders@qacommerce.test', firstName: 'Lucía', lastName: 'Fernández Ortega', role: 'CUSTOMER', status: 'ACTIVE', description: 'Usuario sin pedidos, sin direcciones y sin favoritos' },
  { key: 'orders', email: 'orders@qacommerce.test', firstName: 'Javier', lastName: 'Ruiz Navarro', phone: '600000004', role: 'CUSTOMER', status: 'ACTIVE', description: 'Usuario con historial de pedidos en todos los estados' },
  { key: 'favorites', email: 'favorites@qacommerce.test', firstName: 'Marta', lastName: 'Gómez Vidal', phone: '600000005', role: 'CUSTOMER', status: 'ACTIVE', description: 'Usuario con 6 productos favoritos' },
  { key: 'addresses', email: 'addresses@qacommerce.test', firstName: 'Pablo', lastName: 'Sánchez Molina', phone: '600000006', role: 'CUSTOMER', status: 'ACTIVE', description: 'Usuario con 4 direcciones guardadas' },
  { key: 'disabled', email: 'disabled@qacommerce.test', firstName: 'Elena', lastName: 'Torres Ramos', role: 'CUSTOMER', status: 'DISABLED', description: 'Usuario desactivado (no puede iniciar sesión)' },
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
  description: 'Autor de reseñas de ejemplo',
}));

/** [label, fullName, phone, line1, line2, city, province, postalCode] */
export type AddressDef = [string | null, string, string, string, string | null, string, string, string];

export const USER_ADDRESSES: Record<string, AddressDef[]> = {
  customer: [['Casa', 'Carlos Pérez Gil', '600000002', 'Calle de Alcalá 120, 4º B', null, 'Madrid', 'Madrid', '28009']],
  orders: [['Casa', 'Javier Ruiz Navarro', '600000004', 'Avinguda Diagonal 400, 2º 1ª', null, 'Barcelona', 'Barcelona', '08037']],
  favorites: [['Casa', 'Marta Gómez Vidal', '600000005', 'Calle Colón 15, 1º', null, 'Valencia', 'Valencia', '46004']],
  addresses: [
    ['Casa', 'Pablo Sánchez Molina', '600000006', 'Calle Sierpes 30, 3º A', null, 'Sevilla', 'Sevilla', '41004'],
    ['Trabajo', 'Pablo Sánchez Molina', '600000006', 'Avenida de la Constitución 2', 'Oficina 5', 'Sevilla', 'Sevilla', '41001'],
    ['Padres', 'Rosa Molina Prieto', '611222333', 'Calle Mayor 8', null, 'Córdoba', 'Córdoba', '14001'],
    ['Apartamento playa', 'Pablo Sánchez Molina', '600000006', 'Paseo Marítimo 45, 7º C', 'Edificio Las Gaviotas', 'Málaga', 'Málaga', '29016'],
  ],
};

/** Index (0-based) of the default address per user */
export const DEFAULT_ADDRESS_INDEX: Record<string, number> = { customer: 0, orders: 0, favorites: 0, addresses: 1 };

/** SKUs saved as favorites by favorites@ (includes an out-of-stock and a discontinued product) */
export const FAVORITE_SKUS = ['QCL-LAP-003', 'QCL-GPU-003', 'QCL-MON-002', 'QCL-AUD-001', 'QCL-PHN-002', 'QCL-DSK-010'];

/** Coupons [code, description, type, value, minSubtotalCents, maxDiscountCents, categorySlug, startsOffsetDays, expiresOffsetDays, usageLimit, perUserLimit, isActive, artificialTimesUsed] */
export type CouponDef = [string, string, 'PERCENTAGE' | 'FIXED_AMOUNT' | 'FREE_SHIPPING', number, number | null, number | null, string | null, number | null, number | null, number | null, number, boolean, number];

export const COUPONS: CouponDef[] = [
  ['BIENVENIDA10', '10% de descuento en tu primer pedido (mínimo 50 €)', 'PERCENTAGE', 10, 5000, null, null, -30, 365, null, 1, true, 0],
  ['ENVIOGRATIS', 'Envío gratuito en cualquier pedido', 'FREE_SHIPPING', 0, null, null, null, -30, 365, null, 5, true, 0],
  ['DESCUENTO20', '20 € de descuento en pedidos desde 150 €', 'FIXED_AMOUNT', 2000, 15000, null, null, -30, 365, null, 3, true, 0],
  ['COMPONENTES15', '15% en componentes de PC (máximo 100 €)', 'PERCENTAGE', 15, null, 10000, 'componentes', -30, 365, null, 2, true, 0],
  ['AURICULARES5', '5 € de descuento en auriculares (mínimo 30 €)', 'FIXED_AMOUNT', 500, 3000, null, 'auriculares', -30, 365, null, 2, true, 0],
  ['CADUCADO', 'Cupón de verano (ya caducado)', 'PERCENTAGE', 10, null, null, null, -120, -1, null, 1, true, 0],
  ['PROXIMAMENTE', 'Cupón de Navidad (todavía no disponible)', 'PERCENTAGE', 15, null, null, null, 30, 60, null, 1, true, 0],
  ['AGOTADO', 'Cupón promocional con límite de usos alcanzado', 'PERCENTAGE', 20, null, null, null, -30, 365, 100, 1, true, 100],
  ['INACTIVO', 'Cupón desactivado por la tienda', 'PERCENTAGE', 25, null, null, null, -30, 365, null, 1, false, 0],
];

export const REVIEW_TEMPLATES: Record<number, Array<[string, string]>> = {
  5: [
    ['Excelente compra', 'Funciona de maravilla desde el primer día. Calidad de construcción muy buena y llegó antes de lo previsto.'],
    ['Totalmente recomendable', 'Superó mis expectativas. La relación calidad-precio es difícil de igualar en esta gama.'],
    ['Perfecto', 'Exactamente lo que buscaba. Lo uso a diario y no he tenido ningún problema.'],
  ],
  4: [
    ['Muy buen producto', 'Cumple con lo prometido. Le quito una estrella porque el embalaje podría ser mejor.'],
    ['Buena relación calidad-precio', 'Rinde bien y es fácil de configurar. Echo en falta algún accesorio en la caja.'],
  ],
  3: [
    ['Correcto sin más', 'Hace su función, aunque esperaba algo más por el precio. Para un uso básico está bien.'],
    ['Cumple', 'Producto correcto. Las instrucciones son mejorables y tardé en configurarlo.'],
  ],
  2: [['No me convence', 'Tiene algunos fallos de acabado y el rendimiento es inferior a lo anunciado.']],
  1: [['Decepcionante', 'Tuve que contactar con soporte a los pocos días. No lo volvería a comprar.']],
};
