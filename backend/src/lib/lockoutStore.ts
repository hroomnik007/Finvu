import { and, eq, gt, lt, or, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import { loginLockouts } from "../db/schema";
import { MAX_FAILURES, WINDOW_MS, LOCK_MS } from "./lockoutPolicy";

// Postgres storage for lib/loginLockout.ts. The rules (MAX_FAILURES failures
// within WINDOW_MS lock the key for LOCK_MS) are done in SQL so that one
// statement both counts and locks, even with parallel requests.

export async function isLocked(key: string, now = new Date()): Promise<boolean> {
  const [row] = await db
    .select({ key: loginLockouts.key })
    .from(loginLockouts)
    .where(and(eq(loginLockouts.key, key), gt(loginLockouts.lockedUntil, now)))
    .limit(1);
  return !!row;
}

// One atomic upsert, so parallel wrong attempts can't slip past the limit.
// A failure after the window has passed starts a new window at 1.
export async function recordFailure(key: string, now = new Date()): Promise<void> {
  const windowStart = new Date(now.getTime() - WINDOW_MS);
  const lockUntil = new Date(now.getTime() + LOCK_MS);
  const expired = sql`${loginLockouts.windowStartedAt} <= ${windowStart}`;
  const nextCount = sql`CASE WHEN ${expired} THEN 1 ELSE ${loginLockouts.failedCount} + 1 END`;
  await db
    .insert(loginLockouts)
    .values({ key, failedCount: 1, windowStartedAt: now, lockedUntil: null })
    .onConflictDoUpdate({
      target: loginLockouts.key,
      set: {
        failedCount: nextCount,
        windowStartedAt: sql`CASE WHEN ${expired} THEN ${now} ELSE ${loginLockouts.windowStartedAt} END`,
        lockedUntil: sql`CASE WHEN ${nextCount} >= ${MAX_FAILURES} THEN ${lockUntil} ELSE ${loginLockouts.lockedUntil} END`,
      },
    });
}

export async function clearFailures(key: string): Promise<void> {
  await db.delete(loginLockouts).where(eq(loginLockouts.key, key));
}

// Nightly cleanup: rows whose window and lock are both long over.
export async function pruneLockouts(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - Math.max(WINDOW_MS, LOCK_MS) - 60 * 60 * 1000);
  const removed = await db
    .delete(loginLockouts)
    .where(and(
      lt(loginLockouts.windowStartedAt, cutoff),
      or(isNull(loginLockouts.lockedUntil), lt(loginLockouts.lockedUntil, now)),
    ))
    .returning({ key: loginLockouts.key });
  return removed.length;
}
