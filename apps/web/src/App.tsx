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
      <ErrorState title="Algo ha ido mal" message={error?.message} onRetry={() => window.location.reload()} />
      <div className="mt-6 text-center">
        <ButtonLink to="/" variant="outline">Volver al inicio</ButtonLink>
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
          <ErrorState title="La aplicación ha encontrado un error" message={this.state.error.message} onRetry={() => window.location.reload()} />
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
          { path: 'categoria/:slug', element: <CatalogPage mode="category" /> },
          { path: 'buscar', element: <CatalogPage mode="search" /> },
          { path: 'productos', element: <CatalogPage mode="search" /> },
          { path: 'ofertas', element: <CatalogPage mode="offers" /> },
          { path: 'producto/:slug', element: <ProductPage /> },
          { path: 'carrito', element: <CartPage /> },
          { path: 'checkout', element: <RequireAuth><CheckoutPage /></RequireAuth> },
          { path: 'checkout/resultado/:id', element: <RequireAuth><OrderResultPage /></RequireAuth> },
          { path: 'login', element: <GuestOnly><LoginPage /></GuestOnly> },
          { path: 'registro', element: <GuestOnly><RegisterPage /></GuestOnly> },
          { path: 'recuperar-contrasena', element: <ForgotPasswordPage /> },
          { path: 'restablecer-contrasena', element: <ResetPasswordPage /> },
          { path: 'info/:slug', element: <InfoPage /> },
          {
            path: 'cuenta',
            element: <RequireAuth><AccountLayout /></RequireAuth>,
            children: [
              { index: true, element: <AccountDashboardPage /> },
              { path: 'pedidos', element: <OrdersPage /> },
              { path: 'pedidos/:id', element: <OrderDetailPage /> },
              { path: 'perfil', element: <ProfilePage /> },
              { path: 'direcciones', element: <AddressesPage /> },
              { path: 'seguridad', element: <SecurityPage /> },
              { path: 'favoritos', element: <FavoritesPage /> },
              { path: 'resenas', element: <MyReviewsPage /> },
            ],
          },
          {
            path: 'admin',
            element: <RequireAdmin><AdminLayout /></RequireAdmin>,
            children: [
              { index: true, element: <AdminDashboardPage /> },
              { path: 'productos', element: <AdminProductsPage /> },
              { path: 'productos/:id', element: <AdminProductFormPage /> },
              { path: 'pedidos', element: <AdminOrdersPage /> },
              { path: 'pedidos/:id', element: <AdminOrderDetailPage /> },
              { path: 'usuarios', element: <AdminUsersPage /> },
              { path: 'cupones', element: <AdminCouponsPage /> },
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
