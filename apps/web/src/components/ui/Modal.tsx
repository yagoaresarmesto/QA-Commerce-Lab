import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { Button } from './Button';
import { Textarea } from './Field';

interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  testId?: string;
}

const widths = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl' };

/** Accessible modal (focus trap, Escape to close, aria-labelledby) built on Radix Dialog. */
export function Modal({ open, onOpenChange, title, description, children, footer, size = 'md', testId = 'modal' }: ModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-md" />
        <Dialog.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-4xl bg-white p-7 shadow-pop focus:outline-none',
            widths[size],
          )}
          data-testid={testId}
          aria-describedby={description ? undefined : undefined}
        >
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="text-xl font-semibold tracking-tight text-slate-950">{title}</Dialog.Title>
              {description ? (
                <Dialog.Description className="mt-1 text-sm text-slate-600">{description}</Dialog.Description>
              ) : (
                <Dialog.Description className="sr-only">{title}</Dialog.Description>
              )}
            </div>
            <Dialog.Close asChild>
              <button className="rounded-full p-2 text-slate-500 hover:bg-slate-100" aria-label="Close">
                <X className="h-5 w-5" />
              </button>
            </Dialog.Close>
          </div>
          {children}
          {footer && <div className="mt-6 flex flex-wrap justify-end gap-3">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

interface ConfirmProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  tone?: 'danger' | 'primary';
  loading?: boolean;
  /** Shows an optional reason textarea and passes its value to onConfirm */
  withReason?: { label: string; required?: boolean; minLength?: number };
  onConfirm: (reason?: string) => void;
}

export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel, tone = 'danger', loading, withReason, onConfirm }: ConfirmProps) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string>();
  const submit = () => {
    if (withReason?.required && reason.trim().length < (withReason.minLength ?? 1)) {
      setError(`Enter a reason (at least ${withReason.minLength ?? 1} characters)`);
      return;
    }
    onConfirm(withReason ? reason.trim() : undefined);
  };
  return (
    <Modal
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setReason('');
          setError(undefined);
        }
        onOpenChange(o);
      }}
      title={title}
      description={description}
      size="sm"
      testId="confirm-dialog"
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Go back
          </Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} loading={loading} onClick={submit} data-testid="confirm-dialog-confirm">
            {confirmLabel}
          </Button>
        </>
      }
    >
      {withReason && (
        <Textarea
          label={withReason.label}
          required={withReason.required}
          value={reason}
          onChange={(e) => {
            setReason(e.target.value);
            setError(undefined);
          }}
          error={error}
          maxLength={500}
          name="reason"
        />
      )}
    </Modal>
  );
}
