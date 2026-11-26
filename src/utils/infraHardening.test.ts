import assert from 'node:assert/strict';
import test from 'node:test';
import { DailyCostQuota, SlidingWindowRateLimiter } from './rateLimiter.js';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, clampPageSize, paginateItems } from './pagination.js';
import {
  buildLast30DaysProgress,
  createInitialSelfImprovementState,
  formatIsoDate,
} from './selfImprovementEngine.js';

test('SlidingWindowRateLimiter enforces per-key limits and resets after window expires', () => {
  const limiter = new SlidingWindowRateLimiter({
    windowMs: 10_000,
    maxRequests: 3,
    maxBuckets: 100,
  });

  const t0 = 1_700_000_000_000;
  assert.equal(limiter.consume('ip-a', t0).allowed, true);
  assert.equal(limiter.consume('ip-a', t0 + 100).remaining, 1);
  assert.equal(limiter.consume('ip-a', t0 + 200).remaining, 0);

  const blocked = limiter.consume('ip-a', t0 + 500);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.remaining, 0);
  assert.ok(blocked.resetAfterSeconds >= 9 && blocked.resetAfterSeconds <= 10);

  // Separate client remains unaffected
  assert.equal(limiter.consume('ip-b', t0 + 500).allowed, true);

  // Earliest request (t0) expires at t0 + 10_001, freeing 1 slot
  const partialRecovery = limiter.consume('ip-a', t0 + 10_001);
  assert.equal(partialRecovery.allowed, true);
  assert.equal(partialRecovery.remaining, 0);

  // Full burst expires after windowMs + 10_000 past t0 + 10_001
  const fullRecovery = limiter.consume('ip-a', t0 + 20_002);
  assert.equal(fullRecovery.allowed, true);
  assert.equal(fullRecovery.remaining, 2);
});

test('SlidingWindowRateLimiter prunes stale buckets when maxBuckets is exceeded', () => {
  const limiter = new SlidingWindowRateLimiter({
    windowMs: 5_000,
    maxRequests: 2,
    maxBuckets: 100,
  });

  const t0 = 1_700_000_000_000;
  for (let i = 0; i < 120; i += 1) {
    assert.equal(limiter.consume(`stale-${i}`, t0).allowed, true);
  }

  // After window elapses, new keys trigger prune without errors or unbounded retention
  const res = limiter.consume('fresh-client', t0 + 6_000);
  assert.equal(res.allowed, true);
  assert.equal(res.remaining, 1);
});

test('DailyCostQuota enforces per-IP and global daily limits and resets at UTC midnight', () => {
  const quota = new DailyCostQuota({
    perKeyDailyLimit: 2,
    globalDailyLimit: 3,
  });

  const day1 = Date.UTC(2026, 4, 10, 23, 50, 0);
  assert.equal(quota.consume('client-1', day1).allowed, true);
  assert.equal(quota.consume('client-1', day1 + 1000).allowed, true);

  const perIpBlocked = quota.consume('client-1', day1 + 2000);
  assert.equal(perIpBlocked.allowed, false);
  assert.equal(perIpBlocked.reason, 'ip_daily_cap');

  // Another IP can consume remaining global budget (3rd total)
  assert.equal(quota.consume('client-2', day1 + 3000).allowed, true);

  const globalBlocked = quota.consume('client-3', day1 + 4000);
  assert.equal(globalBlocked.allowed, false);
  assert.equal(globalBlocked.reason, 'global_daily_cap');

  // Rolls over cleanly on next UTC day
  const day2 = Date.UTC(2026, 4, 11, 0, 0, 5);
  assert.equal(quota.consume('client-1', day2).allowed, true);
});

test('paginateItems defaults to 20 items per page and clamps bounds safely', () => {
  assert.equal(DEFAULT_PAGE_SIZE, 20);
  assert.equal(MAX_PAGE_SIZE, 50);
  assert.equal(clampPageSize(Number.NaN), 20);
  assert.equal(clampPageSize(500), 50);
  assert.equal(clampPageSize(0), 1);

  const items = Array.from({ length: 45 }, (_, i) => i + 1);

  const page1 = paginateItems(items, 1);
  assert.equal(page1.page, 1);
  assert.equal(page1.pageSize, 20);
  assert.equal(page1.totalPages, 3);
  assert.equal(page1.items.length, 20);
  assert.equal(page1.items[0], 1);
  assert.equal(page1.items[19], 20);
  assert.equal(page1.hasPrev, false);
  assert.equal(page1.hasNext, true);

  const page3 = paginateItems(items, 99);
  assert.equal(page3.page, 3);
  assert.deepEqual(page3.items, [41, 42, 43, 44, 45]);
  assert.equal(page3.hasPrev, true);
  assert.equal(page3.hasNext, false);

  const empty = paginateItems([], 2);
  assert.equal(empty.page, 1);
  assert.equal(empty.totalPages, 1);
  assert.deepEqual(empty.items, []);
});

test('buildLast30DaysProgress pre-indexes habit dates without double-counting duplicates', () => {
  const anchor = new Date(2026, 4, 10, 12, 0, 0);
  const today = formatIsoDate(anchor);
  const yesterday = formatIsoDate(new Date(2026, 4, 9, 12, 0, 0));

  const base = createInitialSelfImprovementState();
  const state = {
    ...base,
    cleanStreakDays: 2,
    lastCleanCheckInDate: today,
    cleanCheckInDates: [yesterday, today],
    habits: [
      { ...base.habits[0], completedDates: [yesterday, yesterday, today] },
      { ...base.habits[1], completedDates: [yesterday] },
    ],
  };

  const series = buildLast30DaysProgress(state, anchor);
  assert.equal(series.length, 30);

  const yesterdayPoint = series.find((p) => p.date === yesterday);
  const todayPoint = series.find((p) => p.date === today);

  assert.equal(yesterdayPoint?.completedHabits, 2);
  assert.equal(yesterdayPoint?.habitCompletionRate, 100);
  assert.equal(yesterdayPoint?.cleanStreakDay, 1);

  assert.equal(todayPoint?.completedHabits, 1);
  assert.equal(todayPoint?.habitCompletionRate, 50);
  assert.equal(todayPoint?.cleanStreakDay, 2);
});
