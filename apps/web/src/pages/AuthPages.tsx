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
  .min(8, 'Mínimo 8 caracteres')
  .max(64, 'Máximo 64 caracteres')
  .regex(/[a-z]/, 'Incluye una minúscula')
  .regex(/[A-Z]/, 'Incluye una mayúscula')
  .regex(/\d/, 'Incluye un número');

function AuthCard({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <div className="container-page flex justify-center py-10 sm:py-16">
      <div className="w-full max-w-md">
        <div className="card p-6 sm:p-8">
          <div className="mb-6 rounded-2xl bg-gradient-to-r from-brand-950 to-brand-800 p-4">
            <Logo />
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-slate-600">{subtitle}</p>}
          <div className="mt-6">{children}</div>
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
        <button type="button" onClick={() => setVisible((v) => !v)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'} aria-pressed={visible}>
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      }
    />
  );
}

export function PasswordRules({ value }: { value: string }) {
  const rules: Array<[string, boolean]> = [
    ['Entre 8 y 64 caracteres', value.length >= 8 && value.length <= 64],
    ['Una letra minúscula', /[a-z]/.test(value)],
    ['Una letra mayúscula', /[A-Z]/.test(value)],
    ['Un número', /\d/.test(value)],
  ];
  return (
    <ul className="grid grid-cols-2 gap-1 text-xs" aria-label="Requisitos de la contraseña" data-testid="password-rules">
      {rules.map(([label, ok]) => (
        <li key={label} className={cn('flex items-center gap-1', ok ? 'text-emerald-700' : 'text-slate-500')} data-valid={ok}>
          <Check className={cn('h-3.5 w-3.5', !ok && 'opacity-30')} /> {label}
        </li>
      ))}
    </ul>
  );
}

const loginSchema = z.object({
  email: z.string().trim().min(1, 'El email es obligatorio').email('Introduce un email válido'),
  password: z.string().min(1, 'La contraseña es obligatoria'),
});

export function LoginPage() {
  useDocumentTitle('Iniciar sesión');
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
      toast.success(`¡Hola de nuevo, ${user.firstName}!`);
      navigate(redirect && redirect.startsWith('/') ? redirect : user.role === 'ADMIN' ? '/admin' : '/cuenta', { replace: true });
    } catch (e) {
      setError(errorMessage(e));
    }
  });

  return (
    <AuthCard title="Iniciar sesión" subtitle="Accede a tu cuenta para comprar y consultar tus pedidos.">
      <form onSubmit={onSubmit} noValidate className="space-y-4" aria-label="Formulario de inicio de sesión" data-testid="login-form">
        {redirect && !error && (
          <Alert tone="info" testId="login-required">
            Inicia sesión para continuar.
          </Alert>
        )}
        {error && (
          <Alert tone="error" testId="login-error">
            {error}
          </Alert>
        )}
        <Input label="Email" type="email" autoComplete="email" required {...register('email')} error={formState.errors.email?.message} data-testid="login-email" />
        <PasswordInput label="Contraseña" autoComplete="current-password" required {...register('password')} error={formState.errors.password?.message} data-testid="login-password" />
        <div className="flex justify-end">
          <Link to="/recuperar-contrasena" className="text-sm font-semibold text-brand-700 hover:text-brand-800">
            ¿Has olvidado tu contraseña?
          </Link>
        </div>
        <Button type="submit" size="lg" className="w-full" loading={formState.isSubmitting} data-testid="login-submit">
          Iniciar sesión
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-slate-600">
        ¿Aún no tienes cuenta?{' '}
        <Link to={`/registro${redirect ? `?redirect=${encodeURIComponent(redirect)}` : ''}`} className="font-semibold text-brand-700">
          Crear una cuenta
        </Link>
      </p>
    </AuthCard>
  );
}

const registerSchema = z
  .object({
    firstName: z.string().trim().min(2, 'El nombre debe tener al menos 2 caracteres').max(50),
    lastName: z.string().trim().min(2, 'El apellido debe tener al menos 2 caracteres').max(80),
    email: z.string().trim().min(1, 'El email es obligatorio').email('Introduce un email válido'),
    phone: z.string().trim().regex(/^((\+34|0034)?[6789]\d{8})?$/, 'Teléfono español no válido').optional(),
    password: passwordSchema,
    confirmPassword: z.string().min(1, 'Repite la contraseña'),
    acceptTerms: z.boolean().refine((v) => v, 'Debes aceptar los términos y condiciones'),
    marketingOptIn: z.boolean().optional(),
  })
  .refine((v) => v.password === v.confirmPassword, { path: ['confirmPassword'], message: 'Las contraseñas no coinciden' });

export function RegisterPage() {
  useDocumentTitle('Crear cuenta');
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
      toast.success('¡Cuenta creada! Bienvenido a QA Commerce Lab');
      const redirect = params.get('redirect');
      navigate(redirect && redirect.startsWith('/') ? redirect : '/cuenta', { replace: true });
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
    <AuthCard title="Crear una cuenta" subtitle="Regístrate en menos de un minuto. No necesitas verificar el email.">
      <form onSubmit={onSubmit} noValidate className="space-y-4" aria-label="Formulario de registro" data-testid="register-form">
        {error && (
          <Alert tone="error" testId="register-error">
            {error}
          </Alert>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Nombre" required autoComplete="given-name" {...register('firstName')} error={err.firstName?.message} />
          <Input label="Apellidos" required autoComplete="family-name" {...register('lastName')} error={err.lastName?.message} />
        </div>
        <Input label="Email" type="email" required autoComplete="email" {...register('email')} error={err.email?.message} />
        <Input label="Teléfono" type="tel" autoComplete="tel" hint="Opcional" {...register('phone')} error={err.phone?.message} />
        <PasswordInput label="Contraseña" required autoComplete="new-password" {...register('password')} error={err.password?.message} />
        <PasswordRules value={watch('password') ?? ''} />
        <PasswordInput label="Repite la contraseña" required autoComplete="new-password" {...register('confirmPassword')} error={err.confirmPassword?.message} />
        <Checkbox
          label={
            <>
              Acepto los{' '}
              <Link to="/info/terminos" className="font-semibold text-brand-700" target="_blank">
                términos y condiciones
              </Link>
            </>
          }
          {...register('acceptTerms')}
          error={err.acceptTerms?.message}
        />
        <Checkbox label="Quiero recibir ofertas por email" {...register('marketingOptIn')} />
        <Button type="submit" size="lg" className="w-full" loading={formState.isSubmitting} data-testid="register-submit">
          Crear cuenta
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-slate-600">
        ¿Ya tienes cuenta?{' '}
        <Link to="/login" className="font-semibold text-brand-700">
          Inicia sesión
        </Link>
      </p>
    </AuthCard>
  );
}

export function ForgotPasswordPage() {
  useDocumentTitle('Recuperar contraseña');
  const [sent, setSent] = useState(false);
  const schema = z.object({ email: z.string().trim().min(1, 'El email es obligatorio').email('Introduce un email válido') });
  const { register, handleSubmit, formState } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });
  const send = useMutation({ mutationFn: (email: string) => http.post('/auth/forgot-password', { email }), onSuccess: () => setSent(true) });
  return (
    <AuthCard title="Recuperar contraseña" subtitle="Te enviaremos un enlace para crear una contraseña nueva.">
      {sent ? (
        <div className="space-y-4 text-center" data-testid="forgot-success">
          <MailCheck className="mx-auto h-12 w-12 text-emerald-500" />
          <p className="text-sm text-slate-700">Si el email está registrado, recibirás un enlace en unos instantes. El enlace caduca en 30 minutos.</p>
          <p className="text-xs text-slate-500">Entorno de pruebas: los emails se guardan en el buzón simulado (API de testing / Mailpit en local).</p>
          <ButtonLink to="/login" variant="outline">
            Volver a iniciar sesión
          </ButtonLink>
        </div>
      ) : (
        <form onSubmit={handleSubmit((v) => send.mutate(v.email))} noValidate className="space-y-4" data-testid="forgot-form">
          {send.isError && <Alert tone="error">{errorMessage(send.error)}</Alert>}
          <Input label="Email" type="email" required autoComplete="email" {...register('email')} error={formState.errors.email?.message} />
          <Button type="submit" size="lg" className="w-full" loading={send.isPending} data-testid="forgot-submit">
            Enviar enlace
          </Button>
          <p className="text-center text-sm">
            <Link to="/login" className="font-semibold text-brand-700">
              Volver a iniciar sesión
            </Link>
          </p>
        </form>
      )}
    </AuthCard>
  );
}

const resetSchema = z
  .object({ newPassword: passwordSchema, confirmPassword: z.string().min(1, 'Repite la contraseña') })
  .refine((v) => v.newPassword === v.confirmPassword, { path: ['confirmPassword'], message: 'Las contraseñas no coinciden' });

export function ResetPasswordPage() {
  useDocumentTitle('Nueva contraseña');
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
      toast.success('Contraseña actualizada. Ya puedes iniciar sesión');
      navigate('/login', { replace: true });
    },
  });
  return (
    <AuthCard title="Crea una nueva contraseña">
      {!token || status.isError ? (
        <div className="space-y-4" data-testid="reset-invalid">
          <Alert tone="error" title="Enlace no válido">
            {status.error ? errorMessage(status.error) : 'Falta el token de recuperación.'}
          </Alert>
          <ButtonLink to="/recuperar-contrasena" variant="outline">
            Solicitar un nuevo enlace
          </ButtonLink>
        </div>
      ) : status.isLoading ? (
        <div className="flex justify-center py-6">
          <Spinner label="Comprobando enlace" />
        </div>
      ) : (
        <form onSubmit={handleSubmit((v) => reset.mutate(v.newPassword))} noValidate className="space-y-4" data-testid="reset-form">
          <p className="flex items-center gap-2 text-sm text-slate-600">
            <Lock className="h-4 w-4" /> Cuenta: <strong>{status.data?.email}</strong>
          </p>
          {reset.isError && <Alert tone="error" testId="reset-error">{errorMessage(reset.error)}</Alert>}
          <PasswordInput label="Nueva contraseña" required autoComplete="new-password" {...register('newPassword')} error={formState.errors.newPassword?.message} />
          <PasswordRules value={watch('newPassword') ?? ''} />
          <PasswordInput label="Repite la contraseña" required autoComplete="new-password" {...register('confirmPassword')} error={formState.errors.confirmPassword?.message} />
          <Button type="submit" size="lg" className="w-full" loading={reset.isPending} data-testid="reset-submit">
            Guardar contraseña
          </Button>
        </form>
      )}
    </AuthCard>
  );
}
