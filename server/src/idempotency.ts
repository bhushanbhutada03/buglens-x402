import crypto from 'crypto';
import { Report } from './schemas.js';

export type StoredOutcome =
  | {
      status: 'completed';
      report: Report;
      settledAt: string;
      bodyHash: string;
      resource: string;
    }
  | {
      status: 'pending';
      reason: string;
      recordedAt: string;
      bodyHash: string;
      resource: string;
    }
  | {
      status: 'failed';
      reason: string;
      recordedAt: string;
      bodyHash: string;
      resource: string;
    };

interface CacheEntry {
  outcome: StoredOutcome;
  expiresAt: number;
}

export class IdempotencyStore {
  private readonly store = new Map<string, CacheEntry>();
  private readonly inFlightLocks = new Map<string, Promise<Report>>();
  private readonly ttlMs: number;
  private readonly maxSize: number;

  constructor(ttlMs = 3600 * 1000, maxSize = 10000) {
    this.ttlMs = ttlMs;
    this.maxSize = maxSize;
  }

  /**
   * Generates a stable authorization key from signature or nonce/payer.
   */
  public computeAuthKey(payload: Record<string, unknown>): string {
    const auth =
      typeof payload.authorization === 'object' && payload.authorization !== null
        ? (payload.authorization as Record<string, unknown>)
        : {};

    const signature =
      typeof payload.signature === 'string'
        ? payload.signature
        : typeof auth.signature === 'string'
          ? auth.signature
          : '';

    const nonce =
      typeof payload.nonce === 'string'
        ? payload.nonce
        : typeof auth.nonce === 'string'
          ? auth.nonce
          : '';

    const payer =
      typeof payload.from === 'string'
        ? payload.from
        : typeof payload.payer === 'string'
          ? payload.payer
          : typeof auth.from === 'string'
            ? auth.from
            : '';

    let raw = '';
    if (signature.length > 0) {
      raw = signature;
    } else if (payer.length > 0 || nonce.length > 0) {
      raw = `${payer}:${nonce}`;
    } else {
      raw = JSON.stringify(payload);
    }
    return crypto.createHash('sha256').update(raw, 'utf8').digest('hex');
  }

  /**
   * Checks if an outcome exists for this authKey.
   * Enforces binding to bodyHash and resource (method + path).
   */
  public get(
    authKey: string,
    currentBodyHash: string,
    currentResource: string
  ): { outcome?: StoredOutcome; mismatch?: 'body' | 'resource' } {
    this.evictExpired();

    const entry = this.store.get(authKey);
    if (!entry) {
      return {};
    }

    if (Date.now() > entry.expiresAt) {
      this.store.delete(authKey);
      return {};
    }

    const { outcome } = entry;
    if (outcome.resource !== currentResource) {
      return { mismatch: 'resource' };
    }

    if (outcome.bodyHash !== currentBodyHash) {
      return { mismatch: 'body' };
    }

    return { outcome };
  }

  /**
   * Stores a completed, pending, or failed outcome.
   */
  public set(authKey: string, outcome: StoredOutcome) {
    this.evictExpired();

    // Capacity cap eviction (FIFO)
    if (this.store.size >= this.maxSize) {
      const firstKey = this.store.keys().next().value;
      if (firstKey) this.store.delete(firstKey);
    }

    this.store.set(authKey, {
      outcome,
      expiresAt: Date.now() + this.ttlMs,
    });
  }

  /**
   * Concurrency lock: guarantees that concurrent duplicate requests
   * share one in-flight execution promise so settlement happens at most once.
   */
  public async executeWithLock(
    authKey: string,
    fn: () => Promise<Report>
  ): Promise<Report> {
    const existingPromise = this.inFlightLocks.get(authKey);
    if (existingPromise) {
      return existingPromise;
    }

    const lockPromise = (async () => {
      try {
        const report = await fn();
        return report;
      } finally {
        this.inFlightLocks.delete(authKey);
      }
    })();

    this.inFlightLocks.set(authKey, lockPromise);
    return lockPromise;
  }

  private evictExpired() {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.expiresAt) {
        this.store.delete(key);
      }
    }
  }

  public clear() {
    this.store.clear();
    this.inFlightLocks.clear();
  }
}
