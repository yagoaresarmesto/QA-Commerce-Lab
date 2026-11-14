// Types mirroring the API contracts (see /api/docs). Amounts are integer cents (EUR, VAT included).

export type Role = 'CUSTOMER' | 'ADMIN';
export type UserStatus = 'ACTIVE' | 'DISABLED';
export type Availability = 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK' | 'DISCONTINUED';
export type OrderStatus = 'PENDING' | 'PAID' | 'PREPARING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED' | 'RETURN_REQUESTED' | 'RETURNED';
export type OrderPaymentStatus = 'AWAITING_PAYMENT' | 'PROCESSING' | 'PAID' | 'FAILED' | 'REFUNDED';
export type PaymentMethod = 'CARD' | 'BANK_TRANSFER';
export type PaymentStatus = 'PENDING' | 'APPROVED' | 'DECLINED' | 'FAILED' | 'REFUNDED';
export type CouponType = 'PERCENTAGE' | 'FIXED_AMOUNT' | 'FREE_SHIPPING';

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}
export interface Paginated<T> {
  data: T[];
  meta: PageMeta;
}

export interface User {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  role: Role;
  status: UserStatus;
  marketingOptIn: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  user: User;
}

export interface Ref {
  id: number;
  slug: string;
  name: string;
}

export interface ProductSummary {
  id: number;
  sku: string;
  slug: string;
  name: string;
  shortDescription: string;
  brand: Ref;
  category: Ref;
  priceCents: number;
  compareAtPriceCents: number | null;
  discountPercent: number;
  stock: number;
  availability: Availability;
  isActive: boolean;
  isFeatured: boolean;
  isNew: boolean;
  imageUrl: string;
  ratingAvg: number;
  ratingCount: number;
  salesCount: number;
  createdAt: string;
}

export interface ProductDetail extends ProductSummary {
  description: string;
  specs: Array<{ name: string; value: string }>;
  images: Array<{ url: string; alt: string; position: number }>;
  categoryPath: Ref[];
  maxQuantityPerOrder: number;
  updatedAt: string;
}

export interface FacetCount {
  slug: string;
  name: string;
  count: number;
}

export interface ProductList extends Paginated<ProductSummary> {
  facets: {
    brands: FacetCount[];
    categories: FacetCount[];
    priceRange: { minCents: number; maxCents: number };
    inStockCount: number;
    onSaleCount: number;
  };
}

export interface CategoryNode {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  position: number;
  productCount: number;
  children: CategoryNode[];
}
export interface CategoryDetail extends CategoryNode {
  parent: Ref | null;
}

export interface Banner {
  id: number;
  title: string;
  subtitle: string | null;
  ctaLabel: string;
  ctaHref: string;
  theme: string;
  imageKind: string | null;
}

export interface HomeData {
  heroBanners: Banner[];
  promoBanners: Banner[];
  featured: ProductSummary[];
  deals: ProductSummary[];
  newArrivals: ProductSummary[];
  bestSellers: ProductSummary[];
  topRated: ProductSummary[];
  popularCategories: CategoryNode[];
}

export interface Suggestions {
  products: Array<{ id: number; slug: string; name: string; brandName: string; priceCents: number; imageUrl: string }>;
  categories: Ref[];
  brands: Ref[];
}

export interface CartIssue {
  code: 'UNAVAILABLE' | 'OUT_OF_STOCK' | 'INSUFFICIENT_STOCK';
  message: string;
  availableStock?: number;
}

export interface CartItem {
  id: number;
  productId: number;
  product: {
    id: number;
    sku: string;
    slug: string;
    name: string;
    brandName: string;
    categoryId: number;
    imageUrl: string;
    priceCents: number;
    compareAtPriceCents: number | null;
    stock: number;
    availability: Availability;
    isActive: boolean;
  };
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
  priceChanged: boolean;
  previousUnitPriceCents: number | null;
  issues: CartIssue[];
  addedAt: string;
}

export interface Cart {
  id: number | null;
  token: string | null;
  items: CartItem[];
  itemsCount: number;
  coupon: { code: string; description: string; type: CouponType; value: number } | null;
  couponError: { code: string; message: string } | null;
  totals: {
    subtotalCents: number;
    discountCents: number;
    shippingEstimateCents: number;
    totalCents: number;
    taxCents: number;
    freeShippingThresholdCents: number | null;
    amountToFreeShippingCents: number | null;
  };
  hasIssues: boolean;
  updatedAt: string | null;
}

export interface Address {
  id: number;
  label: string | null;
  fullName: string;
  phone: string;
  line1: string;
  line2: string | null;
  city: string;
  province: string;
  postalCode: string;
  country: string;
  isDefault: boolean;
}

export interface Session {
  id: string;
  userAgent: string | null;
  ip: string | null;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  current: boolean;
}

export interface ShippingMethod {
  id: number;
  code: 'STANDARD' | 'EXPRESS' | 'PICKUP';
  name: string;
  description: string;
  priceCents: number;
  freeOverCents: number | null;
  minDays: number;
  maxDays: number;
  requiresPickupPoint: boolean;
}

export interface PickupPoint {
  id: number;
  code: string;
  name: string;
  address: string;
  city: string;
  province: string;
  postalCode: string;
  openingHours: string;
}

export interface Quote {
  lines: Array<{ productId: number; name: string; quantity: number; unitPriceCents: number; lineTotalCents: number }>;
  subtotalCents: number;
  discountCents: number;
  shippingCents: number;
  shippingBaseCents: number;
  freeShippingApplied: boolean;
  taxCents: number;
  totalCents: number;
  couponCode: string | null;
  couponError: { code: string; message: string } | null;
  shippingMethod: { code: string; name: string };
  hasIssues: boolean;
}

export interface Payment {
  id: number;
  method: PaymentMethod;
  status: PaymentStatus;
  amountCents: number;
  cardBrand: string | null;
  cardLast4: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  providerReference: string;
  resolveAt: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export interface OrderSummary {
  id: number;
  orderNumber: string;
  status: OrderStatus;
  paymentStatus: OrderPaymentStatus;
  paymentMethod: PaymentMethod;
  totalCents: number;
  itemsCount: number;
  previewImages: string[];
  createdAt: string;
}

export interface Order extends OrderSummary {
  items: Array<{
    id: number;
    productId: number | null;
    productSlug: string | null;
    sku: string;
    name: string;
    brandName: string;
    imageUrl: string | null;
    unitPriceCents: number;
    compareAtPriceCents: number | null;
    quantity: number;
    lineTotalCents: number;
  }>;
  shippingAddress: Omit<Address, 'id' | 'label' | 'isDefault'>;
  shippingMethod: { code: string; name: string };
  pickupPoint: PickupPoint | null;
  subtotalCents: number;
  discountCents: number;
  shippingCents: number;
  taxCents: number;
  couponCode: string | null;
  customerNote: string | null;
  trackingNumber: string | null;
  reservationExpiresAt: string | null;
  paidAt: string | null;
  preparingAt: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  returnRequestedAt: string | null;
  returnReason: string | null;
  returnedAt: string | null;
  history: Array<{ fromStatus: OrderStatus | null; toStatus: OrderStatus; note: string | null; actorType: string; createdAt: string }>;
  payments: Payment[];
  actions: { canCancel: boolean; canRequestReturn: boolean; canPay: boolean; returnDeadline: string | null };
  updatedAt: string;
}

export interface OrderPaymentResult {
  order: Order;
  payment: Payment | null;
}

export interface Favorite {
  productId: number;
  addedAt: string;
  product: ProductSummary;
}

export interface Review {
  id: number;
  productId: number;
  rating: number;
  title: string;
  comment: string;
  isVerifiedPurchase: boolean;
  author: { id: number; displayName: string };
  createdAt: string;
  updatedAt: string;
}
export interface MyReview extends Review {
  productName: string;
  productSlug: string;
  productImageUrl: string;
}
export interface ReviewList extends Paginated<Review> {
  summary: { average: number; count: number; distribution: Record<string, number> };
}

// ─── Admin ───
export interface Customer {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
}
export interface AdminOrderSummary extends OrderSummary {
  customer: Customer;
}
export interface AdminOrder extends Order {
  customer: Customer;
  allowedTransitions: OrderStatus[];
  canConfirmPayment: boolean;
  testRunId: string | null;
}
export interface AdminProduct extends ProductDetail {
  isReference: boolean;
  testRunId: string | null;
}
export interface AdminUser extends User {
  ordersCount: number;
  totalSpentCents: number;
  addressesCount: number;
  isReference: boolean;
  testRunId: string | null;
}
export interface AdminCoupon {
  id: number;
  code: string;
  description: string;
  type: CouponType;
  value: number;
  minSubtotalCents: number | null;
  maxDiscountCents: number | null;
  categoryId: number | null;
  categoryName: string | null;
  startsAt: string | null;
  expiresAt: string | null;
  usageLimit: number | null;
  perUserLimit: number;
  timesUsed: number;
  isActive: boolean;
  state: 'ACTIVE' | 'INACTIVE' | 'SCHEDULED' | 'EXPIRED' | 'EXHAUSTED';
}
export interface Dashboard {
  totals: {
    users: number;
    customers: number;
    products: number;
    activeProducts: number;
    orders: number;
    revenueCents: number;
    averageOrderCents: number;
    outOfStockProducts: number;
    lowStockProducts: number;
    pendingOrders: number;
    ordersToShip: number;
    returnRequests: number;
  };
  ordersByStatus: Array<{ status: OrderStatus; count: number }>;
  salesLast14Days: Array<{ date: string; orders: number; revenueCents: number }>;
  recentOrders: AdminOrderSummary[];
  lowStock: Array<{ id: number; sku: string; name: string; stock: number }>;
  topProducts: Array<{ id: number; sku: string; name: string; salesCount: number }>;
}

export interface ApiErrorBody {
  statusCode: number;
  error: string;
  code: string;
  message: string;
  details?: unknown;
  requestId?: string;
}
