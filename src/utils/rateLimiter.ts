export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAfterSeconds: number;
}

export class SlidingWindowRateLimiter {
  private readonly windowMs: number;
  private readonly maxRequests: number;
  private readonly maxBuckets: number;
  private readonly buckets = new Map<string, number[]>();

  constructor(options: { windowMs: number; maxRequests: number; maxBuckets?: number }) {
    this.windowMs = Math.max(1000, options.windowMs);
    this.maxRequests = Math.max(1, options.maxRequests);
    this.maxBuckets = Math.max(100, options.maxBuckets ?? 5000);
  }

  consume(key: string, nowMs = Date.now()): RateLimitResult {
    const cutoff = nowMs - this.windowMs;
    const recent = (this.buckets.get(key) ?? []).filter((ts) => ts > cutoff);

    if (recent.length >= this.maxRequests) {
      this.buckets.set(key, recent);
      const oldest = recent[0] ?? nowMs;
      const resetAfterSeconds = Math.max(1, Math.ceil((oldest + this.windowMs - nowMs) / 1000));
      return {
        allowed: false,
        limit: this.maxRequests,
        remaining: 0,
        resetAfterSeconds,
      };
    }

    recent.push(nowMs);
    this.buckets.set(key, recent);

    if (this.buckets.size > this.maxBuckets) {
      this.prune(cutoff);
    }

    return {
      allowed: true,
      limit: this.maxRequests,
      remaining: Math.max(0, this.maxRequests - recent.length),
      resetAfterSeconds: Math.ceil(this.windowMs / 1000),
    };
  }

  private prune(cutoff: number): void {
    for (const [bucketKey, stamps] of this.buckets.entries()) {
      const active = stamps.filter((ts) => ts > cutoff);
      if (active.length === 0) {
        this.buckets.delete(bucketKey);
      } else {
        this.buckets.set(bucketKey, active);
      }
    }
    while (this.buckets.size > this.maxBuckets) {
      const oldestKey = this.buckets.keys().next().value;
      if (oldestKey === undefined) break;
      this.buckets.delete(oldestKey);
    }
  }
}

export interface DailyQuotaResult {
  allowed: boolean;
  reason?: 'ip_daily_cap' | 'global_daily_cap';
  resetAfterSeconds: number;
}

export class DailyCostQuota {
  private readonly perKeyDailyLimit: number;
  private readonly globalDailyLimit: number;
  private readonly maxKeys: number;
  private currentDayKey: string;
  private globalCount = 0;
  private perKeyCounts = new Map<string, number>();

  constructor(options: {
    perKeyDailyLimit: number;
    globalDailyLimit: number;
    maxKeys?: number;
  }) {
    this.perKeyDailyLimit = Math.max(1, options.perKeyDailyLimit);
    this.globalDailyLimit = Math.max(1, options.globalDailyLimit);
    this.maxKeys = Math.max(100, options.maxKeys ?? 10_000);
    this.currentDayKey = this.getDayKey(Date.now());
  }

  consume(key: string, nowMs = Date.now()): DailyQuotaResult {
    const dayKey = this.getDayKey(nowMs);
    if (dayKey !== this.currentDayKey) {
      this.currentDayKey = dayKey;
      this.globalCount = 0;
      this.perKeyCounts.clear();
    }

    const resetAfterSeconds = this.secondsUntilUtcMidnight(nowMs);

    if (this.globalCount >= this.globalDailyLimit) {
      return { allowed: false, reason: 'global_daily_cap', resetAfterSeconds };
    }

    const currentForKey = this.perKeyCounts.get(key) ?? 0;
    if (currentForKey >= this.perKeyDailyLimit) {
      return { allowed: false, reason: 'ip_daily_cap', resetAfterSeconds };
    }

    if (!this.perKeyCounts.has(key) && this.perKeyCounts.size >= this.maxKeys) {
      const oldestKey = this.perKeyCounts.keys().next().value;
      if (oldestKey !== undefined) {
        this.perKeyCounts.delete(oldestKey);
      }
    }

    this.perKeyCounts.set(key, currentForKey + 1);
    this.globalCount += 1;

    return { allowed: true, resetAfterSeconds };
  }

  private getDayKey(nowMs: number): string {
    return new Date(nowMs).toISOString().slice(0, 10);
  }

  private secondsUntilUtcMidnight(nowMs: number): number {
    const d = new Date(nowMs);
    const nextMidnight = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 0, 0, 0);
    return Math.max(60, Math.ceil((nextMidnight - nowMs) / 1000));
  }
}
