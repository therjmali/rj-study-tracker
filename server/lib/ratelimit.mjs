/**
 * Fixed-window rate limiter.
 *
 * In-memory is deliberate: RJ Tracker is a single-process personal server, and
 * a hard restart clearing counters is acceptable (it cannot be used to escalate
 * anything). Limits are applied per IP *and* per route bucket.
 */
export class RateLimiter {
  constructor() {
    this.buckets = new Map();
    this.timer = setInterval(() => this.sweep(), 60_000);
    this.timer.unref?.();
  }

  /** @returns {{ ok: boolean, remaining: number, retryAfter: number }} */
  hit(key, limit, windowMs) {
    const now = Date.now();
    const bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + windowMs });
      return { ok: true, remaining: limit - 1, retryAfter: 0 };
    }
    bucket.count++;
    if (bucket.count > limit) {
      return { ok: false, remaining: 0, retryAfter: Math.ceil((bucket.resetAt - now) / 1000) };
    }
    return { ok: true, remaining: limit - bucket.count, retryAfter: 0 };
  }

  /** Remove a key early — used after a successful login so typos do not lock a user out. */
  reset(key) {
    this.buckets.delete(key);
  }

  sweep() {
    const now = Date.now();
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(key);
    }
  }

  stop() {
    clearInterval(this.timer);
  }
}
