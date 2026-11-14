import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { createBrowserRouter, Outlet, RouterProvider, useRouteError } from 'react-router';
import { Toaster } from 'sonner';
import { AuthProvider } from './auth/AuthProvider';
import { GuestOnly, RequireAdmin, RequireAuth } from './auth/guards';
import { Layout } from './components/layout/Layout';
import { ButtonLink } from './components/ui/Button';
import { ErrorState } from './components/ui/Feedback';
import { ApiError } from './lib/api';
import { AccountDashboardPage, AccountLayout, AddressesPage, FavoritesPage, MyReviewsPage, ProfilePage, SecurityPage } from './pages/account/AccountPages';
import { OrderDetailPage, OrdersPage } from './pages/account/AccountOrders';
import { AdminDashboardPage } from './pages/admin/AdminDashboardPage';
import { AdminLayout } from './pages/admin/AdminLayout';
import { AdminProductFormPage, AdminProductsPage } from './pages/admin/AdminProductsPages';
import { AdminCouponsPage, AdminOrderDetailPage, AdminOrdersPage, AdminUsersPage } from './pages/admin/AdminSalesPages';
import { ForgotPasswordPage, LoginPage, RegisterPage, ResetPasswordPage } from './pages/AuthPages';
import { CartPage } from './pages/CartPage';
import { CatalogPage } from './pages/CatalogPage';
import { CheckoutPage } from './pages/CheckoutPage';
import { HomePage } from './pages/HomePage';
import { InfoPage } from './pages/InfoPage';
import { ForbiddenPage, NotFoundPage } from './pages/NotFoundPage';
import { OrderResultPage } from './pages/OrderResultPage';
import { ProductPage } from './pages/ProductPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      // Never retry client errors (4xx): they are deterministic.
      retry: (count, error) => !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 1,
    },
  },
  queryCache: new QueryCache(),
  mutationCache: new MutationCache(),
});

function RouteError() {
  const error = useRouteError() as Error;
  return (
    <div className="container-page py-16">
      <ErrorState title="Something went wrong" message={error?.message} onRetry={() => window.location.reload()} />
      <div className="mt-6 text-center">
        <ButtonLink to="/" variant="outline">Back to home</ButtonLink>
      </div>
    </div>
  );
}

class ErrorBoundary extends Component<{ children: ReactNode }, { error?: Error }> {
  state: { error?: Error } = {};
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="container-page py-16">
          <ErrorState title="The application ran into an error" message={this.state.error.message} onRetry={() => window.location.reload()} />
        </div>
      );
    }
    return this.props.children;
  }
}

function Providers() {
  return (
    <AuthProvider>
      <Outlet />
      <Toaster position="top-right" richColors closeButton toastOptions={{ duration: 4000 }} />
    </AuthProvider>
  );
}

const router = createBrowserRouter([
  {
    element: <Providers />,
    errorElement: <RouteError />,
    children: [
      {
        element: <Layout />,
        children: [
          { index: true, element: <HomePage /> },
          { path: 'category/:slug', element: <CatalogPage mode="category" /> },
          { path: 'search', element: <CatalogPage mode="search" /> },
          { path: 'products', element: <CatalogPage mode="search" /> },
          { path: 'deals', element: <CatalogPage mode="offers" /> },
          { path: 'product/:slug', element: <ProductPage /> },
          { path: 'cart', element: <CartPage /> },
          { path: 'checkout', element: <RequireAuth><CheckoutPage /></RequireAuth> },
          { path: 'checkout/result/:id', element: <RequireAuth><OrderResultPage /></RequireAuth> },
          { path: 'login', element: <GuestOnly><LoginPage /></GuestOnly> },
          { path: 'register', element: <GuestOnly><RegisterPage /></GuestOnly> },
          { path: 'forgot-password', element: <ForgotPasswordPage /> },
          { path: 'reset-password', element: <ResetPasswordPage /> },
          { path: 'info/:slug', element: <InfoPage /> },
          {
            path: 'account',
            element: <RequireAuth><AccountLayout /></RequireAuth>,
            children: [
              { index: true, element: <AccountDashboardPage /> },
              { path: 'orders', element: <OrdersPage /> },
              { path: 'orders/:id', element: <OrderDetailPage /> },
              { path: 'profile', element: <ProfilePage /> },
              { path: 'addresses', element: <AddressesPage /> },
              { path: 'security', element: <SecurityPage /> },
              { path: 'favorites', element: <FavoritesPage /> },
              { path: 'reviews', element: <MyReviewsPage /> },
            ],
          },
          {
            path: 'admin',
            element: <RequireAdmin><AdminLayout /></RequireAdmin>,
            children: [
              { index: true, element: <AdminDashboardPage /> },
              { path: 'products', element: <AdminProductsPage /> },
              { path: 'products/:id', element: <AdminProductFormPage /> },
              { path: 'orders', element: <AdminOrdersPage /> },
              { path: 'orders/:id', element: <AdminOrderDetailPage /> },
              { path: 'users', element: <AdminUsersPage /> },
              { path: 'coupons', element: <AdminCouponsPage /> },
            ],
          },
          { path: '403', element: <ForbiddenPage /> },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
]);

export function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
