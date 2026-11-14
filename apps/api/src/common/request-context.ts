import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContextStore {
  requestId: string;
  /** Automation run identifier from the X-Test-Run-Id header (only honoured when the testing API is enabled). */
  testRunId?: string;
  userId?: number;
}

const storage = new AsyncLocalStorage<RequestContextStore>();

export const RequestContext = {
  run<T>(store: RequestContextStore, fn: () => T): T {
    return storage.run(store, fn);
  },
  get(): RequestContextStore | undefined {
    return storage.getStore();
  },
  testRunId(): string | undefined {
    return storage.getStore()?.testRunId;
  },
  requestId(): string | undefined {
    return storage.getStore()?.requestId;
  },
  setUser(userId: number): void {
    const s = storage.getStore();
    if (s) s.userId = userId;
  },
};

export const TEST_RUN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$/;
