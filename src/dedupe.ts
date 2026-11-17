export const DEDUPE_TTL_MS = 10 * 60 * 1000;

/**
 * In-memory "seen recently" set with a TTL. Only effective within a single instance,
 * which is why the service is deployed with --max-instances=1.
 */
export class Deduper {
  private readonly seen = new Map<string, number>();

  constructor(
    private readonly ttlMs: number = DEDUPE_TTL_MS,
    private readonly now: () => number = Date.now,
  ) {}

  /** Returns true and records the key if it hasn't been seen within the TTL; false if it's a duplicate. */
  tryReserve(key: string): boolean {
    const now = this.now();
    this.prune(now);
    if (this.seen.has(key)) return false;
    this.seen.set(key, now + this.ttlMs);
    return true;
  }

  /** Forget a key, e.g. when forwarding failed and a redelivery should be allowed through. */
  release(key: string): void {
    this.seen.delete(key);
  }

  private prune(now: number): void {
    for (const [key, expiresAt] of this.seen) {
      if (expiresAt <= now) this.seen.delete(key);
    }
  }
}

export function dedupeKey(personId: unknown, jobId: unknown, stageId: string): string {
  return `${String(personId)}:${String(jobId)}:${stageId}`;
}
