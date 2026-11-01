// In-memory stand-in for lib/lockoutStore.ts in unit tests, following the same
// rules as its SQL. The SQL itself is checked against Postgres separately.
import { MAX_FAILURES, WINDOW_MS, LOCK_MS } from "../lib/lockoutPolicy";

type Row = { failedCount: number; windowStartedAt: number; lockedUntil: number | null };
export const rows = new Map<string, Row>();

export async function isLocked(key: string, now = new Date()): Promise<boolean> {
  const r = rows.get(key);
  return !!r && r.lockedUntil !== null && r.lockedUntil > now.getTime();
}

export async function recordFailure(key: string, now = new Date()): Promise<void> {
  const t = now.getTime();
  const r = rows.get(key);
  if (!r) { rows.set(key, { failedCount: 1, windowStartedAt: t, lockedUntil: null }); return; }
  const expired = r.windowStartedAt <= t - WINDOW_MS;
  r.failedCount = expired ? 1 : r.failedCount + 1;
  if (expired) r.windowStartedAt = t;
  if (r.failedCount >= MAX_FAILURES) r.lockedUntil = t + LOCK_MS;
}

// Same rules as reserveAttempt in lockoutStore.ts. No await before the write, so
// parallel callers get consecutive numbers just like the atomic upsert.
export async function reserveAttempt(key: string, now = new Date()): Promise<{ locked: boolean }> {
  const t = now.getTime();
  const r = rows.get(key);
  if (!r) { rows.set(key, { failedCount: 1, windowStartedAt: t, lockedUntil: null }); return { locked: false }; }
  const lockActive = r.lockedUntil !== null && r.lockedUntil > t;
  const restart = r.windowStartedAt <= t - WINDOW_MS && !lockActive;
  r.failedCount = restart ? 1 : r.failedCount + 1;
  if (restart) r.windowStartedAt = t;
  if (r.failedCount >= MAX_FAILURES && !lockActive) r.lockedUntil = t + LOCK_MS;
  return { locked: r.failedCount > MAX_FAILURES };
}

export async function clearFailures(key: string): Promise<void> {
  rows.delete(key);
}

export async function pruneLockouts(): Promise<number> {
  return 0;
}
