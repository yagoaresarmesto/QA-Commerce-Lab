import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

export type FaultActionType = 'error' | 'delay' | 'timeout';

export interface FaultRule {
  id: string;
  /** Scope: the rule only applies to requests sent with this X-Test-Run-Id ... */
  runId?: string;
  /** ... or authenticated as this user ... */
  userId?: number;
  /** ... or to every request (only when ALLOW_GLOBAL_FAULTS=true) */
  global: boolean;
  method?: string;
  /** Path pattern, e.g. /api/orders, /api/orders/* /payments, /api/products/** */
  path: string;
  action: FaultActionType;
  status?: number;
  code?: string;
  message?: string;
  delayMs?: number;
  /** Remaining matches before the rule disables itself (null = unlimited until it expires) */
  remaining: number | null;
  hits: number;
  expiresAt: Date;
  createdAt: Date;
  description?: string;
}

export type NewFaultRule = Omit<FaultRule, 'id' | 'hits' | 'createdAt'>;

export function compilePathPattern(pattern: string): RegExp {
  const escaped = pattern
    .split('**')
    .map((part) => part.split('*').map((p) => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]+'))
    .join('.*');
  return new RegExp(`^${escaped}/?$`);
}

/**
 * In-memory registry of fault injection rules.
 * Rules are always scoped (run id, user or explicitly global) and expire automatically,
 * so a failing suite can never leave the environment broken for others.
 * NOTE: rules live in the API process memory → the testing environment must run a single API replica.
 */
@Injectable()
export class FaultsService {
  private readonly rules = new Map<string, FaultRule & { regex: RegExp }>();

  add(rule: NewFaultRule): FaultRule {
    const full = { ...rule, id: randomUUID(), hits: 0, createdAt: new Date(), regex: compilePathPattern(rule.path) };
    this.rules.set(full.id, full);
    return this.strip(full);
  }

  list(filter: { runId?: string } = {}): FaultRule[] {
    this.prune();
    return [...this.rules.values()].filter((r) => !filter.runId || r.runId === filter.runId).map((r) => this.strip(r));
  }

  remove(id: string): boolean {
    return this.rules.delete(id);
  }

  clear(filter: { runId?: string } = {}): number {
    let n = 0;
    for (const [id, r] of this.rules) {
      if (!filter.runId || r.runId === filter.runId) {
        this.rules.delete(id);
        n++;
      }
    }
    return n;
  }

  /** Finds (and consumes) the first matching rule for a request. */
  match(req: { method: string; path: string; runId?: string; userId?: number }): FaultRule | null {
    if (this.rules.size === 0) return null;
    this.prune();
    for (const r of this.rules.values()) {
      const inScope =
        r.global || (r.runId !== undefined && r.runId === req.runId) || (r.userId !== undefined && r.userId === req.userId);
      if (!inScope) continue;
      if (r.method && r.method !== req.method.toUpperCase()) continue;
      if (!r.regex.test(req.path)) continue;
      r.hits++;
      if (r.remaining !== null) {
        r.remaining--;
        if (r.remaining <= 0) this.rules.delete(r.id);
      }
      return this.strip(r);
    }
    return null;
  }

  private prune(): void {
    const now = Date.now();
    for (const [id, r] of this.rules) if (r.expiresAt.getTime() <= now) this.rules.delete(id);
  }

  private strip(r: FaultRule & { regex?: RegExp }): FaultRule {
    const { regex: _regex, ...rest } = r;
    return { ...rest };
  }
}
