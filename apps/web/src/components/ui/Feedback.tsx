import { AlertTriangle, CheckCircle2, Info, PackageOpen, XCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { Button } from './Button';

export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn('relative overflow-hidden rounded-lg bg-slate-200/80', className)} aria-hidden="true">
      <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.4s_infinite] bg-gradient-to-r from-transparent via-white/60 to-transparent" />
    </div>
  );
}

export function EmptyState({
  title,
  description,
  icon,
  action,
  testId = 'empty-state',
}: {
  title: string;
  description?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  testId?: string;
}) {
  return (
    <div className="card flex flex-col items-center px-6 py-14 text-center" data-testid={testId}>
      <div className="mb-4 rounded-2xl bg-brand-50 p-4 text-brand-600">{icon ?? <PackageOpen className="h-8 w-8" />}</div>
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      {description && <p className="mt-1 max-w-md text-sm text-slate-600">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function ErrorState({ title = 'No se ha podido cargar el contenido', message, onRetry }: { title?: string; message?: string; onRetry?: () => void }) {
  return (
    <div className="card flex flex-col items-center px-6 py-12 text-center" role="alert" data-testid="error-state">
      <div className="mb-4 rounded-2xl bg-rose-50 p-4 text-rose-600">
        <AlertTriangle className="h-8 w-8" />
      </div>
      <h2 className="text-lg font-semibold">{title}</h2>
      {message && <p className="mt-1 max-w-md text-sm text-slate-600">{message}</p>}
      {onRetry && (
        <Button variant="outline" className="mt-6" onClick={onRetry}>
          Reintentar
        </Button>
      )}
    </div>
  );
}

type Tone = 'info' | 'success' | 'warning' | 'error';
const toneStyles: Record<Tone, string> = {
  info: 'border-sky-200 bg-sky-50 text-sky-900',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  warning: 'border-amber-200 bg-amber-50 text-amber-900',
  error: 'border-rose-200 bg-rose-50 text-rose-900',
};
const toneIcons: Record<Tone, ReactNode> = {
  info: <Info className="h-5 w-5 shrink-0" />,
  success: <CheckCircle2 className="h-5 w-5 shrink-0" />,
  warning: <AlertTriangle className="h-5 w-5 shrink-0" />,
  error: <XCircle className="h-5 w-5 shrink-0" />,
};

export function Alert({ tone = 'info', title, children, className, testId }: { tone?: Tone; title?: string; children?: ReactNode; className?: string; testId?: string }) {
  return (
    <div
      className={cn('flex gap-3 rounded-xl border p-4 text-sm', toneStyles[tone], className)}
      role={tone === 'error' || tone === 'warning' ? 'alert' : 'status'}
      data-testid={testId}
    >
      {toneIcons[tone]}
      <div className="space-y-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div>{children}</div>}
      </div>
    </div>
  );
}

const badgeTones = {
  slate: 'bg-slate-100 text-slate-700',
  brand: 'bg-brand-100 text-brand-800',
  green: 'bg-emerald-100 text-emerald-800',
  amber: 'bg-amber-100 text-amber-800',
  red: 'bg-rose-100 text-rose-700',
  sky: 'bg-sky-100 text-sky-800',
  violet: 'bg-violet-100 text-violet-800',
};
export type BadgeTone = keyof typeof badgeTones;

export function Badge({ tone = 'slate', children, className, testId }: { tone?: BadgeTone; children: ReactNode; className?: string; testId?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold', badgeTones[tone], className)} data-testid={testId}>
      {children}
    </span>
  );
}
