import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Check, Eye, EyeOff, Lock, MailCheck } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { z } from 'zod';
import { useAuth } from '../auth/AuthProvider';
import { Logo } from '../components/layout/Header';
import { Button, ButtonLink } from '../components/ui/Button';
import { Alert } from '../components/ui/Feedback';
import { Checkbox, Input } from '../components/ui/Field';
import { Spinner } from '../components/ui/Spinner';
import { ApiError, errorMessage, http } from '../lib/api';
import { cn } from '../lib/cn';
import { useDocumentTitle } from './useDocumentTitle';

export const passwordSchema = z
  .string()
  .min(8, 'At least 8 characters')
  .max(64, 'At most 64 characters')
  .regex(/[a-z]/, 'Include a lowercase letter')
  .regex(/[A-Z]/, 'Include an uppercase letter')
  .regex(/\d/, 'Include a number');

function AuthCard({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <div className="container-page py-6 sm:py-10">
      <div className="grid overflow-hidden rounded-4xl border border-slate-200/80 lg:grid-cols-[1fr_1.1fr]">
        <aside className="mesh-dark relative hidden flex-col justify-between gap-10 p-10 text-white lg:flex" aria-hidden="true">
          <Logo light />
          <div className="space-y-5">
            <p className="text-4xl font-semibold leading-[1.05] tracking-[-0.04em] xl:text-5xl">
              The tech you want, <span className="text-accent-400">at the best price.</span>
            </p>
            <ul className="space-y-2.5 text-sm text-white/70">
              {['Free shipping over €99', 'Free returns within 14 days', 'Real-time order tracking'].map((t) => (
                <li key={t} className="flex items-center gap-2.5">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent-400 text-slate-950">
                    <Check className="h-3 w-3" />
                  </span>
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <p className="text-xs text-white/40">Test environment · orders and payments are simulated</p>
        </aside>
        <div className="flex justify-center px-5 py-10 sm:px-10 sm:py-14">
          <div className="w-full max-w-md">
            <h1 className="text-3xl font-semibold tracking-[-0.03em] text-slate-950">{title}</h1>
            {subtitle && <p className="mt-2 text-sm text-slate-600">{subtitle}</p>}
            <div className="mt-8">{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PasswordInput(props: React.ComponentProps<typeof Input>) {
  const [visible, setVisible] = useState(false);
  return (
    <Input
      {...props}
      type={visible ? 'text' : 'password'}
      endAdornment={
        <button type="button" onClick={() => setVisible((v) => !v)} className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100" aria-label={visible ? 'Hide password' : 'Show password'} aria-pressed={visible}>
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      }
    />
  );
}

export function PasswordRules({ value }: { value: string }) {
  const rules: Array<[string, boolean]> = [
    ['8 to 64 characters', value.length >= 8 && value.length <= 64],
    ['One lowercase letter', /[a-z]/.test(value)],
    ['One uppercase letter', /[A-Z]/.test(value)],
    ['One number', /\d/.test(value)],
  ];
  return (
    <ul className="grid grid-cols-2 gap-1 text-xs" aria-label="Password requirements" data-testid="password-rules">
      {rules.map(([label, ok]) => (
        <li key={label} className={cn('flex items-center gap-1', ok ? 'text-emerald-700' : 'text-slate-500')} data-valid={ok}>
          <Check className={cn('h-3.5 w-3.5', !ok && 'opacity-30')} /> {label}
        </li>
      ))}
    </ul>
  );
}

const loginSchema = z.object({
  email: z.string().trim().min(1, 'E-mail is required').email('Enter a valid e-mail'),
  password: z.string().min(1, 'Password is required'),
});

export function LoginPage() {
  useDocumentTitle('Sign in');
  const { login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [error, setError] = useState<string>();
  const { register, handleSubmit, formState } = useForm<z.infer<typeof loginSchema>>({ resolver: zodResolver(loginSchema) });
  const redirect = params.get('redirect');

  const onSubmit = handleSubmit(async ({ email, password }) => {
    setError(undefined);
    try {
      const user = await login(email, password);
      toast.success(`Welcome back, ${user.firstName}!`);
      navigate(redirect && redirect.startsWith('/') ? redirect : user.role === 'ADMIN' ? '/admin' : '/account', { replace: true });
    } catch (e) {
      setError(errorMessage(e));
    }
  });

  return (
    <AuthCard title="Sign in" subtitle="Access your account to shop and track your orders.">
      <form onSubmit={onSubmit} noValidate className="space-y-4" aria-label="Sign-in form" data-testid="login-form">
        {redirect && !error && (
          <Alert tone="info" testId="login-required">
            Sign in to continue.
          </Alert>
        )}
        {error && (
          <Alert tone="error" testId="login-error">
            {error}
          </Alert>
        )}
        <Input label="Email" type="email" autoComplete="email" required {...register('email')} error={formState.errors.email?.message} data-testid="login-email" />
        <PasswordInput label="Password" autoComplete="current-password" required {...register('password')} error={formState.errors.password?.message} data-testid="login-password" />
        <div className="flex justify-end">
          <Link to="/forgot-password" className="text-sm font-semibold text-slate-950 underline-offset-2 hover:underline">
            Forgot your password?
          </Link>
        </div>
        <Button type="submit" size="lg" className="w-full" loading={formState.isSubmitting} data-testid="login-submit">
          Sign in
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-slate-600">
        Don't have an account yet?{' '}
        <Link to={`/register${redirect ? `?redirect=${encodeURIComponent(redirect)}` : ''}`} className="font-semibold text-slate-950 underline underline-offset-2">
          Create an account
        </Link>
      </p>
    </AuthCard>
  );
}

const registerSchema = z
  .object({
    firstName: z.string().trim().min(2, 'First name must be at least 2 characters long').max(50),
    lastName: z.string().trim().min(2, 'Last name must be at least 2 characters long').max(80),
    email: z.string().trim().min(1, 'E-mail is required').email('Enter a valid e-mail'),
    phone: z.string().trim().regex(/^((\+34|0034)?[6789]\d{8})?$/, 'Invalid Spanish phone number').optional(),
    password: passwordSchema,
    confirmPassword: z.string().min(1, 'Repeat the password'),
    acceptTerms: z.boolean().refine((v) => v, 'You must accept the terms and conditions'),
    marketingOptIn: z.boolean().optional(),
  })
  .refine((v) => v.password === v.confirmPassword, { path: ['confirmPassword'], message: 'The passwords do not match' });

export function RegisterPage() {
  useDocumentTitle('Create account');
  const { register: signUp } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [error, setError] = useState<string>();
  const { register, handleSubmit, watch, setError: setFieldError, formState } = useForm<z.infer<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
    defaultValues: { acceptTerms: false, marketingOptIn: false },
  });
  const onSubmit = handleSubmit(async ({ confirmPassword: _c, phone, ...data }) => {
    setError(undefined);
    try {
      await signUp({ ...data, phone: phone || undefined });
      toast.success('Account created! Welcome to QA Commerce Lab');
      const redirect = params.get('redirect');
      navigate(redirect && redirect.startsWith('/') ? redirect : '/account', { replace: true });
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.code === 'EMAIL_ALREADY_REGISTERED') setFieldError('email', { message: e.message });
        Object.entries(e.fieldErrors).forEach(([f, m]) => setFieldError(f as 'email', { message: m }));
      }
      setError(errorMessage(e));
    }
  });
  const err = formState.errors;
  return (
    <AuthCard title="Create an account" subtitle="Sign up in less than a minute. No e-mail verification needed.">
      <form onSubmit={onSubmit} noValidate className="space-y-4" aria-label="Registration form" data-testid="register-form">
        {error && (
          <Alert tone="error" testId="register-error">
            {error}
          </Alert>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="First name" required autoComplete="given-name" {...register('firstName')} error={err.firstName?.message} />
          <Input label="Last name" required autoComplete="family-name" {...register('lastName')} error={err.lastName?.message} />
        </div>
        <Input label="Email" type="email" required autoComplete="email" {...register('email')} error={err.email?.message} />
        <Input label="Phone" type="tel" autoComplete="tel" hint="Optional" {...register('phone')} error={err.phone?.message} />
        <PasswordInput label="Password" required autoComplete="new-password" {...register('password')} error={err.password?.message} />
        <PasswordRules value={watch('password') ?? ''} />
        <PasswordInput label="Repeat password" required autoComplete="new-password" {...register('confirmPassword')} error={err.confirmPassword?.message} />
        <Checkbox
          label={
            <>
              I accept the{' '}
              <Link to="/info/terms" className="font-semibold text-slate-950 underline underline-offset-2" target="_blank">
                terms and conditions
              </Link>
            </>
          }
          {...register('acceptTerms')}
          error={err.acceptTerms?.message}
        />
        <Checkbox label="I want to receive offers by e-mail" {...register('marketingOptIn')} />
        <Button type="submit" size="lg" className="w-full" loading={formState.isSubmitting} data-testid="register-submit">
          Create account
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-slate-600">
        Already have an account?{' '}
        <Link to="/login" className="font-semibold text-slate-950 underline underline-offset-2">
          Sign in
        </Link>
      </p>
    </AuthCard>
  );
}

export function ForgotPasswordPage() {
  useDocumentTitle('Forgot password');
  const [sent, setSent] = useState(false);
  const schema = z.object({ email: z.string().trim().min(1, 'E-mail is required').email('Enter a valid e-mail') });
  const { register, handleSubmit, formState } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });
  const send = useMutation({ mutationFn: (email: string) => http.post('/auth/forgot-password', { email }), onSuccess: () => setSent(true) });
  return (
    <AuthCard title="Forgot your password?" subtitle="We will send you a link to create a new password.">
      {sent ? (
        <div className="space-y-4 text-center" data-testid="forgot-success">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-accent-400 text-slate-950">
            <MailCheck className="h-8 w-8" />
          </span>
          <p className="text-sm text-slate-700">If the e-mail is registered, you will receive a link shortly. The link expires in 30 minutes.</p>
          <p className="text-xs text-slate-500">Test environment: e-mails are stored in the simulated mailbox (testing API / Mailpit locally).</p>
          <ButtonLink to="/login" variant="outline">
            Back to sign in
          </ButtonLink>
        </div>
      ) : (
        <form onSubmit={handleSubmit((v) => send.mutate(v.email))} noValidate className="space-y-4" data-testid="forgot-form">
          {send.isError && <Alert tone="error">{errorMessage(send.error)}</Alert>}
          <Input label="Email" type="email" required autoComplete="email" {...register('email')} error={formState.errors.email?.message} />
          <Button type="submit" size="lg" className="w-full" loading={send.isPending} data-testid="forgot-submit">
            Send link
          </Button>
          <p className="text-center text-sm">
            <Link to="/login" className="font-semibold text-slate-950 underline underline-offset-2">
              Back to sign in
            </Link>
          </p>
        </form>
      )}
    </AuthCard>
  );
}

const resetSchema = z
  .object({ newPassword: passwordSchema, confirmPassword: z.string().min(1, 'Repeat the password') })
  .refine((v) => v.newPassword === v.confirmPassword, { path: ['confirmPassword'], message: 'The passwords do not match' });

export function ResetPasswordPage() {
  useDocumentTitle('New password');
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') ?? '';
  const status = useQuery({
    queryKey: ['reset-token', token],
    queryFn: () => http.get<{ valid: boolean; email: string; expiresAt: string }>('/auth/reset-password/validate', { query: { token } }),
    enabled: !!token,
    retry: false,
  });
  const { register, handleSubmit, watch, formState } = useForm<z.infer<typeof resetSchema>>({ resolver: zodResolver(resetSchema) });
  const reset = useMutation({
    mutationFn: (newPassword: string) => http.post('/auth/reset-password', { token, newPassword }),
    onSuccess: () => {
      toast.success('Password updated. You can now sign in');
      navigate('/login', { replace: true });
    },
  });
  return (
    <AuthCard title="Create a new password">
      {!token || status.isError ? (
        <div className="space-y-4" data-testid="reset-invalid">
          <Alert tone="error" title="Invalid link">
            {status.error ? errorMessage(status.error) : 'The reset token is missing.'}
          </Alert>
          <ButtonLink to="/forgot-password" variant="outline">
            Request a new link
          </ButtonLink>
        </div>
      ) : status.isLoading ? (
        <div className="flex justify-center py-6">
          <Spinner label="Checking link" />
        </div>
      ) : (
        <form onSubmit={handleSubmit((v) => reset.mutate(v.newPassword))} noValidate className="space-y-4" data-testid="reset-form">
          <p className="flex items-center gap-2 text-sm text-slate-600">
            <Lock className="h-4 w-4" /> Account: <strong>{status.data?.email}</strong>
          </p>
          {reset.isError && <Alert tone="error" testId="reset-error">{errorMessage(reset.error)}</Alert>}
          <PasswordInput label="New password" required autoComplete="new-password" {...register('newPassword')} error={formState.errors.newPassword?.message} />
          <PasswordRules value={watch('newPassword') ?? ''} />
          <PasswordInput label="Repeat password" required autoComplete="new-password" {...register('confirmPassword')} error={formState.errors.confirmPassword?.message} />
          <Button type="submit" size="lg" className="w-full" loading={reset.isPending} data-testid="reset-submit">
            Save password
          </Button>
        </form>
      )}
    </AuthCard>
  );
}
