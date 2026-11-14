import { keepPreviousData, useMutation, useQuery, useQueryClient, type UseQueryOptions } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuth } from '../auth/AuthProvider';
import { errorMessage, http } from './api';
import { storage } from './storage';
import type {
  Address,
  Cart,
  CategoryDetail,
  CategoryNode,
  Favorite,
  HomeData,
  Order,
  OrderSummary,
  Paginated,
  ProductDetail,
  ProductList,
  ProductSummary,
  ReviewList,
  ShippingMethod,
  Suggestions,
} from './types';

// ─── Catalog (public, cached longer) ─────────────────────────────────────

export const useCategories = () =>
  useQuery({ queryKey: ['catalog', 'categories'], queryFn: () => http.get<CategoryNode[]>('/categories'), staleTime: 5 * 60_000 });

export const useCategory = (slug: string | undefined) =>
  useQuery({
    queryKey: ['catalog', 'category', slug],
    queryFn: () => http.get<CategoryDetail>(`/categories/${slug}`),
    enabled: !!slug,
    staleTime: 5 * 60_000,
  });

export const useHome = () => useQuery({ queryKey: ['catalog', 'home'], queryFn: () => http.get<HomeData>('/home') });

export const useProducts = (query: Record<string, string | number | boolean | undefined>) =>
  useQuery({
    queryKey: ['catalog', 'products', query],
    queryFn: ({ signal }) => http.get<ProductList>('/products', { query, signal }),
    placeholderData: keepPreviousData,
  });

export const useProduct = (idOrSlug: string | undefined) =>
  useQuery({
    queryKey: ['catalog', 'product', idOrSlug],
    queryFn: () => http.get<ProductDetail>(`/products/${idOrSlug}`),
    enabled: !!idOrSlug,
  });

export const useRelated = (id: number | undefined) =>
  useQuery({
    queryKey: ['catalog', 'related', id],
    queryFn: () => http.get<ProductSummary[]>(`/products/${id}/related`),
    enabled: !!id,
  });

export const useSuggestions = (q: string) =>
  useQuery({
    queryKey: ['catalog', 'suggestions', q],
    queryFn: ({ signal }) => http.get<Suggestions>('/products/suggestions', { query: { q }, signal }),
    enabled: q.trim().length >= 2,
    staleTime: 30_000,
  });

export const useReviews = (productId: number | undefined, query: Record<string, string | number | undefined>) =>
  useQuery({
    queryKey: ['catalog', 'reviews', productId, query],
    queryFn: () => http.get<ReviewList>(`/products/${productId}/reviews`, { query }),
    enabled: !!productId,
    placeholderData: keepPreviousData,
  });

export const useInfo = () =>
  useQuery({
    queryKey: ['catalog', 'info'],
    queryFn: () => http.get<{ environment: string; version: string; features: Record<string, boolean> }>('/info'),
    staleTime: Infinity,
  });

export const useShippingMethods = () =>
  useQuery({ queryKey: ['catalog', 'shipping-methods'], queryFn: () => http.get<ShippingMethod[]>('/shipping/methods'), staleTime: 10 * 60_000 });

// ─── Cart ────────────────────────────────────────────────────────────────

function rememberGuestToken(cart: Cart) {
  if (cart.token) storage.set('qcl.cartToken', cart.token);
}

export function useCart() {
  const { status } = useAuth();
  return useQuery({
    queryKey: ['cart'],
    queryFn: () => http.get<Cart>('/cart', { cart: true }),
    enabled: status !== 'loading',
  });
}

export function useCartMutations() {
  const qc = useQueryClient();
  const onSuccess = (cart: Cart) => {
    rememberGuestToken(cart);
    qc.setQueryData(['cart'], cart);
  };
  return {
    add: useMutation({
      mutationFn: (v: { productId: number; quantity: number }) => http.post<Cart>('/cart/items', v, { cart: true }),
      onSuccess,
    }),
    update: useMutation({
      mutationFn: (v: { itemId: number; quantity: number }) => http.patch<Cart>(`/cart/items/${v.itemId}`, { quantity: v.quantity }, { cart: true }),
      onSuccess,
      onError: (e) => toast.error(errorMessage(e)),
    }),
    remove: useMutation({
      mutationFn: (itemId: number) => http.delete<Cart>(`/cart/items/${itemId}`, { cart: true }),
      onSuccess,
      onError: (e) => toast.error(errorMessage(e)),
    }),
    clear: useMutation({ mutationFn: () => http.delete<Cart>('/cart', { cart: true }), onSuccess }),
    applyCoupon: useMutation({ mutationFn: (code: string) => http.post<Cart>('/cart/coupon', { code }, { cart: true }), onSuccess }),
    removeCoupon: useMutation({ mutationFn: () => http.delete<Cart>('/cart/coupon', { cart: true }), onSuccess }),
  };
}

// ─── Account ─────────────────────────────────────────────────────────────

export const useAddresses = () => useQuery({ queryKey: ['addresses'], queryFn: () => http.get<Address[]>('/users/me/addresses') });

export const useOrders = (query: Record<string, string | number | undefined>) =>
  useQuery({
    queryKey: ['orders', query],
    queryFn: () => http.get<Paginated<OrderSummary>>('/orders', { query }),
    placeholderData: keepPreviousData,
  });

export const useOrder = (id: string | undefined, refetchInterval?: UseQueryOptions<Order>['refetchInterval']) =>
  useQuery({
    queryKey: ['order', id],
    queryFn: () => http.get<Order>(`/orders/${id}`),
    enabled: !!id,
    refetchInterval,
  });

export function useFavorites() {
  const { status } = useAuth();
  return useQuery({
    queryKey: ['favorites'],
    queryFn: () => http.get<Favorite[]>('/favorites'),
    enabled: status === 'authenticated',
  });
}

export function useFavoriteToggle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ productId, isFavorite }: { productId: number; isFavorite: boolean }) => {
      if (isFavorite) await http.delete(`/favorites/${productId}`);
      else await http.post('/favorites', { productId });
      return !isFavorite;
    },
    onSuccess: (nowFavorite) => {
      toast.success(nowFavorite ? 'Añadido a favoritos' : 'Eliminado de favoritos');
      void qc.invalidateQueries({ queryKey: ['favorites'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}
