import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

const controlClass = (invalid?: boolean) =>
  cn(
    'block w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400',
    'focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500',
    invalid ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-200' : 'border-slate-300 focus:border-brand-500 focus:ring-brand-100',
  );

interface FieldWrapperProps {
  id: string;
  label: ReactNode;
  error?: string;
  hint?: ReactNode;
  required?: boolean;
  children: ReactNode;
  className?: string;
}

export function FieldWrapper({ id, label, error, hint, required, children, className }: FieldWrapperProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {/* The required marker stays outside <label> so the accessible name is exactly the label text. */}
      <div className="flex items-baseline gap-0.5">
        <label htmlFor={id} className="block text-sm font-medium text-slate-700">
          {label}
        </label>
        {required && (
          <span className="text-sm text-rose-600" aria-hidden="true">
            *
          </span>
        )}
      </div>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-xs text-slate-500">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-xs font-medium text-rose-600" role="alert" data-testid={`${id}-error`}>
          {error}
        </p>
      )}
    </div>
  );
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; error?: string; hint?: ReactNode; wrapperClassName?: string; endAdornment?: ReactNode };

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, hint, id, wrapperClassName, className, required, endAdornment, ...rest },
  ref,
) {
  const generated = useId();
  const inputId = id ?? generated;
  return (
    <FieldWrapper id={inputId} label={label} error={error} hint={hint} required={required} className={wrapperClassName}>
      <div className="relative">
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
          aria-required={required || undefined}
          className={cn(controlClass(!!error), endAdornment && 'pr-11', className)}
          {...rest}
        />
        {endAdornment && <div className="absolute inset-y-0 right-0 flex items-center pr-2">{endAdornment}</div>}
      </div>
    </FieldWrapper>
  );
});

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & { label: ReactNode; error?: string; hint?: ReactNode; wrapperClassName?: string };

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, error, hint, id, wrapperClassName, className, required, children, ...rest },
  ref,
) {
  const generated = useId();
  const selectId = id ?? generated;
  return (
    <FieldWrapper id={selectId} label={label} error={error} hint={hint} required={required} className={wrapperClassName}>
      <select
        ref={ref}
        id={selectId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${selectId}-error` : undefined}
        className={cn(controlClass(!!error), 'pr-8', className)}
        {...rest}
      >
        {children}
      </select>
    </FieldWrapper>
  );
});

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { label: ReactNode; error?: string; hint?: ReactNode; wrapperClassName?: string };

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, error, hint, id, wrapperClassName, className, required, ...rest },
  ref,
) {
  const generated = useId();
  const textareaId = id ?? generated;
  return (
    <FieldWrapper id={textareaId} label={label} error={error} hint={hint} required={required} className={wrapperClassName}>
      <textarea
        ref={ref}
        id={textareaId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${textareaId}-error` : undefined}
        className={cn(controlClass(!!error), 'min-h-24', className)}
        {...rest}
      />
    </FieldWrapper>
  );
});

type CheckboxProps = InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; error?: string; description?: ReactNode };

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox({ label, error, description, id, className, ...rest }, ref) {
  const generated = useId();
  const checkboxId = id ?? generated;
  return (
    <div className={className}>
      <div className="flex items-start gap-2.5">
        <input
          ref={ref}
          id={checkboxId}
          type="checkbox"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${checkboxId}-error` : undefined}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-brand-600 accent-brand-600 focus:ring-brand-500"
          {...rest}
        />
        <label htmlFor={checkboxId} className="text-sm text-slate-700">
          {label}
          {description && <span className="block text-xs text-slate-500">{description}</span>}
        </label>
      </div>
      {error && (
        <p id={`${checkboxId}-error`} className="mt-1 text-xs font-medium text-rose-600" role="alert" data-testid={`${checkboxId}-error`}>
          {error}
        </p>
      )}
    </div>
  );
});
