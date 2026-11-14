import type { ApiErrorBody } from './types';
import { storage } from './storage';

const API_BASE = (import.meta.env.VITE_API_URL ?? '/api').replace(/\/$/, '');

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;
  readonly requestId?: string;

  constructor(status: number, body: Partial<ApiErrorBody>) {
    super(body.message ?? `Error ${status}`);
    this.status = status;
    this.code = body.code ?? (status === 0 ? 'NETWORK_ERROR' : `HTTP_${status}`);
    this.details = body.details;
    this.requestId = body.requestId;
  }

  /** Field errors from VALIDATION_ERROR responses */
  get fieldErrors(): Record<string, string> {
    if (!Array.isArray(this.details)) return {};
    return Object.fromEntries(
      (this.details as Array<{ field?: string; message?: string }>)
        .filter((d) => d.field && d.message)
        .map((d) => [d.field!, d.message!]),
    );
  }
}

// ─── Session state (access token kept in memory only) ─────────────────────

let accessToken: string | null = null;
let refreshing: Promise<boolean> | null = null;
type SessionListener = (reason: 'expired') => void;
const listeners = new Set<SessionListener>();

export const session = {
  get token() {
    return accessToken;
  },
  set(token: string | null) {
    accessToken = token;
    storage.set('qcl.hasSession', token ? '1' : null);
  },
  hasHint() {
    return storage.get('qcl.hasSession') === '1';
  },
  onExpired(listener: SessionListener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

/** Exchanges the httpOnly refresh cookie for a new access token. Concurrent callers share one request. */
export function refreshAccessToken(): Promise<boolean> {
  refreshing ??= (async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...extraHeaders() },
        body: '{}',
      });
      if (!res.ok) {
        session.set(null);
        return false;
      }
      const body = (await res.json()) as { accessToken: string };
      session.set(body.accessToken);
      return true;
    } catch {
      return false;
    } finally {
      setTimeout(() => (refreshing = null), 0);
    }
  })();
  return refreshing;
}

function extraHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  // Optional automation hook: lets UI tests scope data/faults to their run (ignored outside testing envs).
  const runId = storage.get('qcl.testRunId');
  if (runId) headers['X-Test-Run-Id'] = runId;
  return headers;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  /** Send the guest cart token (cart endpoints) */
  cart?: boolean;
}

export function buildQuery(query?: RequestOptions['query']): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
  const s = params.toString();
  return s ? `?${s}` : '';
}

export async function api<T>(path: string, opts: RequestOptions = {}, retried = false): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json', ...extraHeaders(), ...opts.headers };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (opts.cart && !accessToken) {
    const cartToken = storage.get('qcl.cartToken');
    if (cartToken) headers['X-Cart-Token'] = cartToken;
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}${buildQuery(opts.query)}`, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      credentials: 'include',
      signal: opts.signal,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new ApiError(0, { message: 'No se ha podido conectar con el servidor. Revisa tu conexión' });
  }

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let body: unknown = undefined;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    body = { message: text };
  }

  if (!res.ok) {
    const err = new ApiError(res.status, (body ?? {}) as Partial<ApiErrorBody>);
    // Expired access token → silently refresh once and retry the request.
    if (res.status === 401 && !retried && accessToken && ['TOKEN_EXPIRED', 'TOKEN_INVALID'].includes(err.code)) {
      if (await refreshAccessToken()) return api<T>(path, opts, true);
      listeners.forEach((l) => l('expired'));
    } else if (res.status === 401 && accessToken && ['SESSION_EXPIRED', 'SESSION_REVOKED'].includes(err.code)) {
      session.set(null);
      listeners.forEach((l) => l('expired'));
    }
    throw err;
  }
  return body as T;
}

export const http = {
  get: <T>(path: string, opts?: Omit<RequestOptions, 'method' | 'body'>) => api<T>(path, { ...opts, method: 'GET' }),
  post: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'method' | 'body'>) => api<T>(path, { ...opts, method: 'POST', body: body ?? {} }),
  patch: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, 'method' | 'body'>) => api<T>(path, { ...opts, method: 'PATCH', body: body ?? {} }),
  delete: <T>(path: string, opts?: Omit<RequestOptions, 'method' | 'body'>) => api<T>(path, { ...opts, method: 'DELETE' }),
};

export function errorMessage(err: unknown, fallback = 'Ha ocurrido un error inesperado'): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}
