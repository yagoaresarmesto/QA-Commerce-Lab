import { z } from 'zod';

export type AppEnv = 'local' | 'testing' | 'demo' | 'production';

const boolish = z
  .enum(['true', 'false', '1', '0', 'yes', 'no', ''])
  .optional()
  .transform((v) => (v === undefined || v === '' ? undefined : ['true', '1', 'yes'].includes(v)));

const int = (def: number, min = 0) =>
  z.coerce.number().int().min(min).optional().transform((v) => v ?? def);

const rawSchema = z.object({
  APP_ENV: z.enum(['local', 'testing', 'demo', 'production']).default('local'),
  PORT: int(3001, 1),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  PUBLIC_WEB_URL: z.string().url().default('http://localhost:3000'),
  CORS_ORIGINS: z.string().optional(),
  JWT_SECRET: z.string().optional(),
  ACCESS_TOKEN_TTL_SECONDS: int(900, 5),
  REFRESH_TOKEN_TTL_DAYS: int(7, 1),
  PASSWORD_RESET_TTL_MINUTES: int(30, 1),
  COOKIE_SECURE: boolish,
  TEST_API_ENABLED: boolish,
  TEST_API_KEY: z.string().optional(),
  ALLOW_GLOBAL_RESET: boolish,
  ALLOW_GLOBAL_FAULTS: boolish,
  RATE_LIMIT_ENABLED: boolish,
  RATE_LIMIT_PER_MINUTE: int(300, 1),
  RATE_LIMIT_AUTH_PER_MINUTE: int(20, 1),
  SWAGGER_ENABLED: boolish,
  PAYMENT_PENDING_DELAY_MS: int(15000, 0),
  PAYMENT_TIMEOUT_DELAY_MS: int(8000, 0),
  ORDER_RESERVATION_MINUTES: int(30, 1),
  BANK_TRANSFER_RESERVATION_HOURS: int(72, 1),
  RETURN_WINDOW_DAYS: int(14, 1),
  JOBS_ENABLED: boolish,
  JOBS_INTERVAL_MS: int(5000, 500),
  AUTO_RESET_CRON: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: int(1025, 1),
  MAIL_FROM: z.string().default('QA Commerce Lab <no-reply@qacommerce.test>'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  LOG_PRETTY: boolish,
  SERVE_WEB_DIR: z.string().optional(),
  APP_VERSION: z.string().optional(),
  GIT_COMMIT: z.string().optional(),
});

/**
 * Typed, validated application configuration.
 * Also used as the DI token: inject it with `constructor(private readonly config: AppConfig)`.
 */
export class AppConfig {
  env: AppEnv;
  port: number;
  databaseUrl: string;
  publicWebUrl: string;
  corsOrigins: string[];
  jwtSecret: string;
  accessTokenTtlSeconds: number;
  refreshTokenTtlDays: number;
  passwordResetTtlMinutes: number;
  cookieSecure: boolean;
  testApi: { enabled: boolean; key: string; allowGlobalReset: boolean; allowGlobalFaults: boolean };
  rateLimit: { enabled: boolean; perMinute: number; authPerMinute: number };
  swaggerEnabled: boolean;
  payments: { pendingDelayMs: number; timeoutDelayMs: number };
  orders: { reservationMinutes: number; bankTransferReservationHours: number; returnWindowDays: number };
  jobs: { enabled: boolean; intervalMs: number; autoResetCron?: string };
  mail: { smtpHost?: string; smtpPort: number; from: string };
  log: { level: string; pretty: boolean };
  serveWebDir?: string;
  version: string;
  commit?: string;

  get isProductionLike(): boolean {
    return this.env === 'demo' || this.env === 'production';
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = rawSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  const e = parsed.data;
  const isLocal = e.APP_ENV === 'local';
  const productionLike = e.APP_ENV === 'demo' || e.APP_ENV === 'production';

  const jwtSecret = e.JWT_SECRET ?? (isLocal ? 'local-dev-secret-change-me-please-0123456789' : '');
  if (jwtSecret.length < 32 && !isLocal) {
    throw new Error('JWT_SECRET must be at least 32 characters outside the local environment');
  }

  // The testing API can NEVER be enabled in demo/production, whatever the flags say.
  const testApiEnabled = productionLike ? false : (e.TEST_API_ENABLED ?? true);
  const testApiKey = e.TEST_API_KEY ?? (isLocal ? 'local-test-api-key' : '');
  if (testApiEnabled && !isLocal && testApiKey.length < 24) {
    throw new Error('TEST_API_KEY must be at least 24 characters when the testing API is enabled remotely');
  }

  const cfg = new AppConfig();
  cfg.env = e.APP_ENV;
  cfg.port = e.PORT;
  cfg.databaseUrl = e.DATABASE_URL;
  cfg.publicWebUrl = e.PUBLIC_WEB_URL.replace(/\/$/, '');
  cfg.corsOrigins = (e.CORS_ORIGINS ?? (isLocal ? 'http://localhost:3000,http://localhost:5173' : ''))
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  cfg.jwtSecret = jwtSecret;
  cfg.accessTokenTtlSeconds = e.ACCESS_TOKEN_TTL_SECONDS;
  cfg.refreshTokenTtlDays = e.REFRESH_TOKEN_TTL_DAYS;
  cfg.passwordResetTtlMinutes = e.PASSWORD_RESET_TTL_MINUTES;
  cfg.cookieSecure = e.COOKIE_SECURE ?? !isLocal;
  cfg.testApi = {
    enabled: testApiEnabled,
    key: testApiKey,
    allowGlobalReset: testApiEnabled && (e.ALLOW_GLOBAL_RESET ?? isLocal),
    allowGlobalFaults: testApiEnabled && (e.ALLOW_GLOBAL_FAULTS ?? isLocal),
  };
  cfg.rateLimit = {
    enabled: e.RATE_LIMIT_ENABLED ?? productionLike,
    perMinute: e.RATE_LIMIT_PER_MINUTE,
    authPerMinute: e.RATE_LIMIT_AUTH_PER_MINUTE,
  };
  cfg.swaggerEnabled = e.SWAGGER_ENABLED ?? true;
  cfg.payments = { pendingDelayMs: e.PAYMENT_PENDING_DELAY_MS, timeoutDelayMs: e.PAYMENT_TIMEOUT_DELAY_MS };
  cfg.orders = {
    reservationMinutes: e.ORDER_RESERVATION_MINUTES,
    bankTransferReservationHours: e.BANK_TRANSFER_RESERVATION_HOURS,
    returnWindowDays: e.RETURN_WINDOW_DAYS,
  };
  cfg.jobs = { enabled: e.JOBS_ENABLED ?? true, intervalMs: e.JOBS_INTERVAL_MS, autoResetCron: e.AUTO_RESET_CRON || undefined };
  cfg.mail = { smtpHost: e.SMTP_HOST || undefined, smtpPort: e.SMTP_PORT, from: e.MAIL_FROM };
  cfg.log = { level: e.LOG_LEVEL, pretty: e.LOG_PRETTY ?? isLocal };
  cfg.serveWebDir = e.SERVE_WEB_DIR || undefined;
  cfg.version = e.APP_VERSION ?? '1.0.0';
  cfg.commit = e.GIT_COMMIT || undefined;
  return cfg;
}
