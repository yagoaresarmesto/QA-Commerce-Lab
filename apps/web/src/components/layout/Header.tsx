import * as Dialog from '@radix-ui/react-dialog';
import * as Dropdown from '@radix-ui/react-dropdown-menu';
import { ChevronDown, FlaskConical, Heart, LayoutDashboard, LayoutGrid, LogOut, Menu, Package, ShoppingBag, User, X, Zap } from 'lucide-react';
import { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { useAuth } from '../../auth/AuthProvider';
import { cn } from '../../lib/cn';
import { useCart, useCategories, useInfo } from '../../lib/queries';
import { CategoryIcon } from './CategoryIcon';
import { SearchBox } from './SearchBox';

export function Logo({ light = false }: { light?: boolean }) {
  return (
    <Link to="/" className="group flex shrink-0 items-center gap-2.5" aria-label="QA Commerce Lab, ir a la página de inicio" data-testid="logo">
      <span className={cn('flex h-9 w-9 items-center justify-center rounded-xl transition-transform group-hover:rotate-[-6deg]', light ? 'bg-white' : 'bg-slate-950')}>
        <Zap className={cn('h-[18px] w-[18px] fill-accent-400 text-accent-400', light && 'fill-brand-600 text-brand-600')} aria-hidden="true" />
      </span>
      <span className={cn('flex items-center gap-1.5 text-[17px] font-semibold tracking-[-0.03em]', light ? 'text-white' : 'text-slate-950')}>
        QA Commerce
        <span className={cn('hidden rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] min-[400px]:inline', light ? 'bg-accent-400 text-slate-950' : 'bg-brand-600 text-white')}>Lab</span>
      </span>
    </Link>
  );
}

const iconButton = 'relative flex h-11 w-11 items-center justify-center rounded-full text-slate-700 transition hover:bg-slate-100 hover:text-slate-950';

function CartButton() {
  const { data } = useCart();
  const count = data?.itemsCount ?? 0;
  return (
    <Link
      to="/carrito"
      className="relative flex h-11 items-center gap-2 rounded-full bg-slate-950 pl-3.5 pr-2.5 text-sm font-semibold text-white transition hover:bg-brand-600 sm:pl-4 sm:pr-3"
      aria-label={`Carrito, ${count} ${count === 1 ? 'producto' : 'productos'}`}
      data-testid="cart-link"
    >
      <ShoppingBag className="h-[18px] w-[18px]" />
      <span className="hidden lg:inline">Carrito</span>
      <span
        className={cn('flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-xs font-bold tabular-nums', count > 0 ? 'bg-accent-400 text-slate-950' : 'bg-white/15 text-white')}
        data-testid={count > 0 ? 'cart-count' : undefined}
      >
        {count}
      </span>
    </Link>
  );
}

function AccountMenu() {
  const { status, user, isAdmin, logout } = useAuth();
  const navigate = useNavigate();
  if (status !== 'authenticated' || !user) {
    return (
      <Link to="/login" className="flex h-11 items-center gap-2 rounded-full px-3 text-sm font-semibold text-slate-800 transition hover:bg-slate-100" data-testid="login-link">
        <User className="h-5 w-5" />
        <span className="hidden lg:inline">Iniciar sesión</span>
      </Link>
    );
  }
  const item = 'flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-700 outline-none data-[highlighted]:bg-slate-100 data-[highlighted]:text-slate-950';
  return (
    <Dropdown.Root>
      <Dropdown.Trigger className="flex h-11 items-center gap-2 rounded-full pl-1.5 pr-3 transition hover:bg-slate-100" data-testid="account-menu-trigger" aria-label={`Mi cuenta (${user.firstName})`}>
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-xs font-bold text-white">
          {user.firstName.charAt(0).toUpperCase()}
        </span>
        <span className="hidden max-w-28 truncate text-sm font-semibold text-slate-900 lg:inline" data-testid="account-name">
          {user.firstName}
        </span>
        <ChevronDown className="hidden h-4 w-4 text-slate-500 lg:block" />
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content align="end" sideOffset={10} className="z-50 w-64 rounded-3xl border border-slate-200/80 bg-white p-2 shadow-pop" data-testid="account-menu">
          <div className="px-3 py-2.5">
            <p className="text-sm font-semibold text-slate-950">
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
            className={cn(item, 'text-rose-600 data-[highlighted]:bg-rose-50 data-[highlighted]:text-rose-700')}
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
      <Dropdown.Trigger
        className="flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 transition hover:border-slate-300 data-[state=open]:border-slate-950 data-[state=open]:bg-slate-950 data-[state=open]:text-white"
        data-testid="categories-menu-trigger"
      >
        <LayoutGrid className="h-4 w-4" /> Todas las categorías <ChevronDown className="h-4 w-4" />
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content
          align="start"
          sideOffset={10}
          className="z-50 grid w-[min(60rem,calc(100vw-2rem))] grid-cols-2 gap-2 rounded-4xl border border-slate-200/80 bg-white p-4 shadow-pop md:grid-cols-4"
          data-testid="categories-menu"
        >
          {data?.map((c) => (
            <div key={c.id} className="rounded-3xl p-2">
              <Dropdown.Item asChild>
                <Link to={`/categoria/${c.slug}`} className="flex items-center gap-3 rounded-2xl p-2 text-sm font-semibold text-slate-950 outline-none data-[highlighted]:bg-slate-100">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                    <CategoryIcon icon={c.icon} className="h-[18px] w-[18px]" />
                  </span>
                  {c.name}
                </Link>
              </Dropdown.Item>
              {c.children.map((ch) => (
                <Dropdown.Item key={ch.id} asChild>
                  <Link to={`/categoria/${ch.slug}`} className="block rounded-xl px-2 py-1.5 pl-14 text-sm text-slate-600 outline-none data-[highlighted]:bg-slate-100 data-[highlighted]:text-slate-950">
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
      <Dialog.Trigger className={cn(iconButton, 'md:hidden')} aria-label="Abrir menú" data-testid="mobile-menu-trigger">
        <Menu className="h-5 w-5" />
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed inset-y-2 left-2 z-50 w-80 max-w-[88vw] overflow-y-auto rounded-4xl bg-white p-5 shadow-pop" data-testid="mobile-menu">
          <div className="mb-5 flex items-center justify-between">
            <Dialog.Title className="text-lg font-semibold tracking-tight">Categorías</Dialog.Title>
            <Dialog.Description className="sr-only">Navegación por categorías</Dialog.Description>
            <Dialog.Close className="rounded-full p-2 hover:bg-slate-100" aria-label="Cerrar menú">
              <X className="h-5 w-5" />
            </Dialog.Close>
          </div>
          <nav aria-label="Categorías (móvil)" className="space-y-2">
            <Link to="/ofertas" onClick={() => setOpen(false)} className="block rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-accent-400">
              Ofertas de la semana
            </Link>
            {data?.map((c) => (
              <div key={c.id}>
                <Link to={`/categoria/${c.slug}`} onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold hover:bg-slate-100">
                  <CategoryIcon icon={c.icon} className="h-4 w-4 text-brand-600" /> {c.name}
                </Link>
                {c.children.map((ch) => (
                  <Link key={ch.id} to={`/categoria/${ch.slug}`} onClick={() => setOpen(false)} className="block rounded-2xl px-3 py-2 pl-10 text-sm text-slate-600 hover:bg-slate-100">
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
  const pill = ({ isActive }: { isActive: boolean }) =>
    cn(
      'flex h-9 shrink-0 items-center whitespace-nowrap rounded-full px-4 text-sm font-medium transition',
      isActive ? 'bg-slate-950 text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950',
    );
  return (
    <header className="sticky top-0 z-40">
      <div className="bg-slate-950 text-[12px] text-slate-400">
        <div className="container-page flex h-9 items-center justify-between gap-4">
          <p className="flex items-center gap-2 truncate">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent-400" aria-hidden="true" />
            <span>
              <span className="font-medium text-white">Envío gratis</span> desde 99 € · Devoluciones en 14 días · Pago 100% seguro
            </span>
          </p>
          <p className="hidden items-center gap-1.5 sm:flex" data-testid="lab-notice">
            <FlaskConical className="h-3.5 w-3.5 text-accent-400" aria-hidden="true" />
            Tienda ficticia para practicar QA{env ? ` · entorno ${env}` : ''}
          </p>
        </div>
      </div>
      <div className="glass border-b border-slate-200/70">
        <div className="container-page flex flex-wrap items-center gap-x-2 gap-y-3 py-3 sm:flex-nowrap sm:gap-5">
          <MobileMenu />
          <Logo />
          <SearchBox className="order-last w-full sm:order-none sm:mx-4 sm:w-auto sm:flex-1 lg:mx-10" />
          <nav aria-label="Usuario" className="ml-auto flex items-center gap-1 sm:gap-1.5">
            <Link to="/cuenta/favoritos" className={cn(iconButton, 'hidden md:flex')} aria-label="Favoritos" data-testid="favorites-link">
              <Heart className="h-5 w-5" />
            </Link>
            <AccountMenu />
            <CartButton />
          </nav>
        </div>
        <nav aria-label="Categorías" className="hidden md:block">
          <div className="container-page scrollbar-none flex items-center gap-1.5 overflow-x-auto pb-3">
            <CategoriesMegaMenu />
            <span className="mx-1.5 h-5 w-px shrink-0 bg-slate-200" aria-hidden="true" />
            <NavLink
              to="/ofertas"
              className={({ isActive }) =>
                cn('flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-4 text-sm font-semibold transition', isActive ? 'bg-slate-950 text-accent-400' : 'bg-accent-300/60 text-slate-950 hover:bg-accent-300')
              }
            >
              Ofertas
            </NavLink>
            {categories?.map((c) => (
              <NavLink key={c.id} to={`/categoria/${c.slug}`} className={pill}>
                {c.name}
              </NavLink>
            ))}
          </div>
        </nav>
      </div>
    </header>
  );
}
