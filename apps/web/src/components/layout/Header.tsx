import * as Dialog from '@radix-ui/react-dialog';
import * as Dropdown from '@radix-ui/react-dropdown-menu';
import { ChevronDown, FlaskConical, Heart, LayoutDashboard, LogOut, Menu, Package, ShoppingCart, User, X, Zap } from 'lucide-react';
import { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { useAuth } from '../../auth/AuthProvider';
import { cn } from '../../lib/cn';
import { useCart, useCategories, useInfo } from '../../lib/queries';
import { CategoryIcon } from './CategoryIcon';
import { SearchBox } from './SearchBox';

export function Logo({ light = true }: { light?: boolean }) {
  return (
    <Link to="/" className="flex shrink-0 items-center gap-2" aria-label="QA Commerce Lab, ir a la página de inicio" data-testid="logo">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 shadow-lg shadow-brand-900/40">
        <Zap className="h-5 w-5 fill-accent-400 text-accent-400" aria-hidden="true" />
      </span>
      <span className={cn('leading-tight', light ? 'text-white' : 'text-slate-900')}>
        <span className="block text-base font-extrabold tracking-tight">QA Commerce</span>
        <span className={cn('block text-[11px] font-semibold uppercase tracking-[0.2em]', light ? 'text-accent-400' : 'text-brand-600')}>Lab Store</span>
      </span>
    </Link>
  );
}

function CartButton() {
  const { data } = useCart();
  const count = data?.itemsCount ?? 0;
  return (
    <Link
      to="/carrito"
      className="relative flex h-11 items-center gap-2 rounded-xl px-3 text-white hover:bg-white/10"
      aria-label={`Carrito, ${count} ${count === 1 ? 'producto' : 'productos'}`}
      data-testid="cart-link"
    >
      <ShoppingCart className="h-6 w-6" />
      <span className="hidden text-sm font-semibold lg:inline">Carrito</span>
      {count > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent-500 px-1 text-[11px] font-bold text-slate-950" data-testid="cart-count">
          {count}
        </span>
      )}
    </Link>
  );
}

function AccountMenu() {
  const { status, user, isAdmin, logout } = useAuth();
  const navigate = useNavigate();
  if (status !== 'authenticated' || !user) {
    return (
      <Link to="/login" className="flex h-11 items-center gap-2 rounded-xl px-3 text-white hover:bg-white/10" data-testid="login-link">
        <User className="h-6 w-6" />
        <span className="hidden text-sm font-semibold lg:inline">Iniciar sesión</span>
      </Link>
    );
  }
  const item = 'flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-slate-700 outline-none data-[highlighted]:bg-slate-100';
  return (
    <Dropdown.Root>
      <Dropdown.Trigger className="flex h-11 items-center gap-2 rounded-xl px-3 text-white hover:bg-white/10" data-testid="account-menu-trigger" aria-label={`Mi cuenta (${user.firstName})`}>
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-500 text-xs font-bold">
          {user.firstName.charAt(0).toUpperCase()}
        </span>
        <span className="hidden max-w-28 truncate text-sm font-semibold lg:inline" data-testid="account-name">
          {user.firstName}
        </span>
        <ChevronDown className="hidden h-4 w-4 lg:block" />
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content align="end" sideOffset={8} className="z-50 w-60 rounded-xl border border-slate-200 bg-white p-1.5 shadow-pop" data-testid="account-menu">
          <div className="px-3 py-2">
            <p className="text-sm font-semibold text-slate-900">
              {user.firstName} {user.lastName}
            </p>
            <p className="truncate text-xs text-slate-500">{user.email}</p>
          </div>
          <Dropdown.Separator className="my-1 h-px bg-slate-100" />
          <Dropdown.Item className={item} onSelect={() => navigate('/cuenta')}>
            <User className="h-4 w-4" /> Mi cuenta
          </Dropdown.Item>
          <Dropdown.Item className={item} onSelect={() => navigate('/cuenta/pedidos')}>
            <Package className="h-4 w-4" /> Mis pedidos
          </Dropdown.Item>
          <Dropdown.Item className={item} onSelect={() => navigate('/cuenta/favoritos')}>
            <Heart className="h-4 w-4" /> Favoritos
          </Dropdown.Item>
          {isAdmin && (
            <Dropdown.Item className={item} onSelect={() => navigate('/admin')} data-testid="admin-link">
              <LayoutDashboard className="h-4 w-4" /> Panel de administración
            </Dropdown.Item>
          )}
          <Dropdown.Separator className="my-1 h-px bg-slate-100" />
          <Dropdown.Item
            className={cn(item, 'text-rose-600')}
            data-testid="logout-button"
            onSelect={async () => {
              await logout();
              toast.success('Has cerrado sesión');
              navigate('/');
            }}
          >
            <LogOut className="h-4 w-4" /> Cerrar sesión
          </Dropdown.Item>
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}

function CategoriesMegaMenu() {
  const { data } = useCategories();
  return (
    <Dropdown.Root>
      <Dropdown.Trigger className="flex h-11 items-center gap-2 whitespace-nowrap rounded-lg px-3 text-sm font-semibold text-white hover:bg-white/10" data-testid="categories-menu-trigger">
        <Menu className="h-4 w-4" /> Todas las categorías <ChevronDown className="h-4 w-4" />
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content align="start" sideOffset={4} className="z-50 grid w-[min(52rem,calc(100vw-2rem))] grid-cols-2 gap-1 rounded-2xl border border-slate-200 bg-white p-3 shadow-pop md:grid-cols-3" data-testid="categories-menu">
          {data?.map((c) => (
            <div key={c.id} className="rounded-xl p-2">
              <Dropdown.Item asChild>
                <Link to={`/categoria/${c.slug}`} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-semibold text-slate-900 outline-none data-[highlighted]:bg-brand-50">
                  <CategoryIcon icon={c.icon} className="h-4 w-4 text-brand-600" /> {c.name}
                </Link>
              </Dropdown.Item>
              {c.children.map((ch) => (
                <Dropdown.Item key={ch.id} asChild>
                  <Link to={`/categoria/${ch.slug}`} className="block rounded-lg px-2 py-1 pl-8 text-sm text-slate-600 outline-none data-[highlighted]:bg-slate-100">
                    {ch.name}
                  </Link>
                </Dropdown.Item>
              ))}
            </div>
          ))}
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}

function MobileMenu() {
  const [open, setOpen] = useState(false);
  const { data } = useCategories();
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger className="flex h-11 w-11 items-center justify-center rounded-xl text-white hover:bg-white/10 md:hidden" aria-label="Abrir menú" data-testid="mobile-menu-trigger">
        <Menu className="h-6 w-6" />
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/50" />
        <Dialog.Content className="fixed inset-y-0 left-0 z-50 w-80 max-w-[85vw] overflow-y-auto bg-white p-5 shadow-pop" data-testid="mobile-menu">
          <div className="mb-4 flex items-center justify-between">
            <Dialog.Title className="text-lg font-bold">Categorías</Dialog.Title>
            <Dialog.Description className="sr-only">Navegación por categorías</Dialog.Description>
            <Dialog.Close className="rounded-lg p-1.5 hover:bg-slate-100" aria-label="Cerrar menú">
              <X className="h-5 w-5" />
            </Dialog.Close>
          </div>
          <nav aria-label="Categorías (móvil)" className="space-y-3">
            <Link to="/ofertas" onClick={() => setOpen(false)} className="block rounded-lg bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
              Ofertas
            </Link>
            {data?.map((c) => (
              <div key={c.id}>
                <Link to={`/categoria/${c.slug}`} onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold hover:bg-slate-100">
                  <CategoryIcon icon={c.icon} className="h-4 w-4 text-brand-600" /> {c.name}
                </Link>
                {c.children.map((ch) => (
                  <Link key={ch.id} to={`/categoria/${ch.slug}`} onClick={() => setOpen(false)} className="block rounded-lg px-3 py-1.5 pl-9 text-sm text-slate-600 hover:bg-slate-100">
                    {ch.name}
                  </Link>
                ))}
              </div>
            ))}
          </nav>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function Header() {
  const { data: categories } = useCategories();
  const { data: info } = useInfo();
  const env = import.meta.env.VITE_APP_ENV || info?.environment;
  return (
    <header className="sticky top-0 z-40 shadow-lg shadow-slate-900/10">
      <div className="bg-slate-950 text-xs text-slate-300">
        <div className="container-page flex h-8 items-center justify-between gap-4">
          <p className="truncate">
            <span className="font-semibold text-accent-400">Envío gratis</span> desde 99 € · Devoluciones en 14 días · Pago 100% seguro
          </p>
          <p className="hidden items-center gap-1.5 sm:flex" data-testid="lab-notice">
            <FlaskConical className="h-3.5 w-3.5 text-accent-400" aria-hidden="true" />
            Tienda ficticia para practicar QA{env ? ` · entorno ${env}` : ''}
          </p>
        </div>
      </div>
      <div className="bg-gradient-to-r from-brand-950 via-brand-900 to-brand-950">
        <div className="container-page flex flex-wrap items-center gap-x-2 gap-y-2 py-2.5 sm:flex-nowrap sm:gap-4">
          <MobileMenu />
          <Logo />
          <SearchBox className="order-last w-full sm:order-none sm:mx-2 sm:w-auto sm:flex-1 lg:mx-6" />
          <nav aria-label="Usuario" className="ml-auto flex items-center gap-1">
            <Link to="/cuenta/favoritos" className="hidden h-11 w-11 items-center justify-center rounded-xl text-white hover:bg-white/10 md:flex" aria-label="Favoritos" data-testid="favorites-link">
              <Heart className="h-6 w-6" />
            </Link>
            <AccountMenu />
            <CartButton />
          </nav>
        </div>
      </div>
      <nav aria-label="Categorías" className="hidden bg-brand-900/95 md:block">
        <div className="container-page scrollbar-none flex h-11 items-center gap-1 overflow-x-auto">
          <CategoriesMegaMenu />
          <span className="mx-1 h-5 w-px bg-white/20" aria-hidden="true" />
          <NavLink to="/ofertas" className={({ isActive }) => cn('whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold text-accent-400 hover:bg-white/10', isActive && 'bg-white/10')}>
            Ofertas
          </NavLink>
          {categories?.map((c) => (
            <NavLink key={c.id} to={`/categoria/${c.slug}`} className={({ isActive }) => cn('whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium text-slate-200 hover:bg-white/10 hover:text-white', isActive && 'bg-white/10 text-white')}>
              {c.name}
            </NavLink>
          ))}
        </div>
      </nav>
    </header>
  );
}
