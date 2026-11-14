/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** API base URL. Defaults to "/api" (same origin, proxied in dev/Docker). */
  readonly VITE_API_URL?: string;
  /** Environment label shown in the UI (local, testing, demo) */
  readonly VITE_APP_ENV?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
