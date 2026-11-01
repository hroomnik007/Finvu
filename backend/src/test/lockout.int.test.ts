// The sign-in lock against a real Postgres: reserveAttempt (the atomic upsert in
// lib/lockoutStore.ts) and the handlers built on it. The unit tests only run the
// rules on an in-memory stand-in; here the SQL itself and its behaviour under
// parallel requests are checked. Run with `npm run test:integration` against a
// throw-away database built by `npm run db:setup`.
import bcrypt from "bcrypt";
import type { Request, Response } from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, inArray, like, or } from "drizzle-orm";
import { db } from "../db";
import { loginLockouts, users } from "../db/schema";
import { reserveAttempt, isLocked, clearFailures } from "../lib/lockoutStore";
import { MAX_FAILURES, WINDOW_MS, LOCK_MS } from "../lib/lockoutPolicy";
import { LOCKED_RESPONSE, adminKey, passwordKey } from "../lib/loginLockout";
import { adminLogin, login } from "../controllers/auth.controller";

const run = Date.now().toString(36);
const key = (name: string) => `it:${run}:${name}`;
const T0 = new Date("2030-01-01T10:00:00Z");
const later = (ms: number, from = T0) => new Date(from.getTime() + ms);

async function row(k: string) {
  const [r] = await db.select().from(loginLockouts).where(eq(loginLockouts.key, k)).limit(1);
  return r;
}

beforeAll(() => {
  // Never against anything but a local throw-away database.
  const host = new URL(process.env.DATABASE_URL ?? "postgresql://invalid").hostname;
  if (host !== "127.0.0.1" && host !== "localhost") {
    throw new Error(`lockout.int.test refuses to run against DATABASE_URL host "${host}"`);
  }
});

const IP_A = "203.0.113.10";
const IP_B = "198.51.100.20";
const testKeys = [adminKey(IP_A), adminKey(IP_B), "admin"];
const EMAIL = `lock-${run}@lockout.test`;

async function cleanup() {
  await db.delete(loginLockouts).where(or(like(loginLockouts.key, `it:${run}:%`), inArray(loginLockouts.key, [...testKeys, passwordKey(EMAIL)])));
}
beforeEach(cleanup);
afterAll(async () => {
  await cleanup();
  await db.delete(users).where(eq(users.email, EMAIL));
});

describe("reserveAttempt (SQL upsert)", () => {
  it("20 parallel attempts on one key: exactly 5 are attempts, 15 are locked, no counter value is duplicated or skipped", async () => {
    const k = key("parallel");
    const results = await Promise.all(Array.from({ length: 20 }, () => reserveAttempt(k, T0)));
    expect(results.filter(r => !r.locked)).toHaveLength(MAX_FAILURES);
    expect(results.filter(r => r.locked)).toHaveLength(20 - MAX_FAILURES);
    const r = await row(k);
    expect(r.failedCount).toBe(20); // every request counted exactly once
    expect(r.lockedUntil!.getTime()).toBe(later(LOCK_MS).getTime());
  });

  it("parallel waves lose no updates (the final count equals the number of requests)", async () => {
    const k = key("wave");
    for (let wave = 0; wave < 3; wave++) await Promise.all(Array.from({ length: 4 }, () => reserveAttempt(k, T0)));
    expect((await row(k)).failedCount).toBe(12);
  });

  it("the 6th and later attempts during a lock don't extend it", async () => {
    const k = key("noextend");
    for (let i = 0; i < MAX_FAILURES; i++) await reserveAttempt(k, later(i * 1000));
    const lockedAt = (await row(k)).lockedUntil!.getTime();
    expect(lockedAt).toBe(later(LOCK_MS + (MAX_FAILURES - 1) * 1000).getTime()); // set by the 5th attempt
    for (let i = 0; i < 5; i++) {
      expect((await reserveAttempt(k, later(60_000 + i * 1000))).locked).toBe(true);
    }
    const r = await row(k);
    expect(r.lockedUntil!.getTime()).toBe(lockedAt);
    expect(r.failedCount).toBe(MAX_FAILURES + 5);
  });

  it("after the window (and lock) expire the count restarts and the next attempt is attempt 1", async () => {
    const k = key("expiry");
    for (let i = 0; i < MAX_FAILURES; i++) await reserveAttempt(k, T0);
    expect((await reserveAttempt(k, later(1000))).locked).toBe(true);
    // lock and window are both over
    const after = later(Math.max(WINDOW_MS, LOCK_MS) + 1000);
    expect((await reserveAttempt(k, after)).locked).toBe(false);
    const r = await row(k);
    expect(r.failedCount).toBe(1);
    expect(r.windowStartedAt.getTime()).toBe(after.getTime());
    // and a full fresh budget again
    for (let i = 1; i < MAX_FAILURES; i++) expect((await reserveAttempt(k, after)).locked).toBe(false);
    expect((await reserveAttempt(k, after)).locked).toBe(true);
  });

  it("the window restarts without a lock too (failures older than the window are forgotten)", async () => {
    const k = key("window");
    for (let i = 0; i < MAX_FAILURES - 1; i++) await reserveAttempt(k, T0);
    const after = later(WINDOW_MS + 1000);
    expect((await reserveAttempt(k, after)).locked).toBe(false);
    expect((await row(k)).failedCount).toBe(1);
  });

  it("a lock that outlives the window keeps counting as locked (the window isn't restarted under an active lock)", async () => {
    const k = key("outlives");
    for (let i = 0; i < MAX_FAILURES - 1; i++) await reserveAttempt(k, T0);
    await reserveAttempt(k, later(WINDOW_MS - 1000)); // 5th attempt, late in the window: lock until WINDOW+LOCK-1s
    const inside = later(WINDOW_MS + 1000); // window is over, lock still on
    expect((await reserveAttempt(k, inside)).locked).toBe(true);
    expect(await isLocked(k, inside)).toBe(true);
  });

  it("a successful sign-in (clearFailures) wipes the count", async () => {
    const k = key("success");
    for (let i = 0; i < MAX_FAILURES - 1; i++) await reserveAttempt(k, T0);
    await clearFailures(k);
    expect(await row(k)).toBeUndefined();
    for (let i = 0; i < MAX_FAILURES; i++) expect((await reserveAttempt(k, T0)).locked).toBe(false);
  });

  it("1 to 4 wrong attempts don't lock; the lock appears with the 5th", async () => {
    const k = key("fifth");
    for (let i = 1; i < MAX_FAILURES; i++) {
      expect((await reserveAttempt(k, T0)).locked).toBe(false);
      expect(await isLocked(k, T0)).toBe(false);
    }
    expect((await reserveAttempt(k, T0)).locked).toBe(false); // the 5th is still evaluated
    expect(await isLocked(k, T0)).toBe(true); // ...and from then on the key is locked
    expect((await reserveAttempt(k, T0)).locked).toBe(true);
  });

  it("different keys don't affect each other", async () => {
    const a = key("iso-a"), b = key("iso-b");
    await Promise.all([
      ...Array.from({ length: 12 }, () => reserveAttempt(a, T0)),
      ...Array.from({ length: 3 }, () => reserveAttempt(b, T0)),
    ]);
    expect((await row(a)).failedCount).toBe(12);
    expect((await row(b)).failedCount).toBe(3);
    expect(await isLocked(a, T0)).toBe(true);
    expect(await isLocked(b, T0)).toBe(false);
    expect((await reserveAttempt(b, T0)).locked).toBe(false);
  });
});

function fakeRes() {
  const out: { status: number; body: unknown } = { status: 200, body: undefined };
  const res = {
    status(code: number) { out.status = code; return res; },
    json(body: unknown) { out.body = body; return res; },
    cookie() { return res; },
    clearCookie() { return res; },
  };
  return { res: res as unknown as Response, out };
}
const LOCKED = { status: 429, body: LOCKED_RESPONSE };

describe("admin sign-in lock (real adminLogin, two addresses)", () => {
  const GOOD = process.env.ADMIN_PASSWORD!;
  const attempt = async (password: string, ip: string) => {
    const r = fakeRes();
    await adminLogin({ body: { username: "admin", password }, ip, headers: {}, cookies: {}, query: {} } as unknown as Request, r.res);
    return r.out;
  };

  it("5 wrong passwords from IP A lock A, and even the right one from A is refused", async () => {
    for (let i = 0; i < MAX_FAILURES; i++) expect((await attempt("nope", IP_A)).status).toBe(401);
    expect(await attempt(GOOD, IP_A)).toEqual(LOCKED);
    expect(await attempt("nope", IP_A)).toEqual(LOCKED);
  });

  it("the same admin gets in from IP B with the right password, and that leaves A's lock untouched", async () => {
    for (let i = 0; i < MAX_FAILURES; i++) await attempt("nope", IP_A);
    const before = await row(adminKey(IP_A));
    expect((await attempt(GOOD, IP_B)).status).toBe(200);
    expect(await row(adminKey(IP_B))).toBeUndefined(); // B's own row is cleared
    expect(await row(adminKey(IP_A))).toEqual(before); // A's row is exactly as it was
    expect(await attempt(GOOD, IP_A)).toEqual(LOCKED);
  });

  it("wrong guesses from A never count against B", async () => {
    for (let i = 0; i < 30; i++) await attempt("nope", IP_A);
    for (let i = 0; i < MAX_FAILURES - 1; i++) expect((await attempt("nope", IP_B)).status).toBe(401);
    expect((await attempt(GOOD, IP_B)).status).toBe(200);
  });

  it("20 parallel wrong passwords from one address: only 5 are evaluated", async () => {
    const results = await Promise.all(Array.from({ length: 20 }, () => attempt("nope", IP_A)));
    expect(results.filter(o => o.status === 401)).toHaveLength(MAX_FAILURES);
    expect(results.filter(o => JSON.stringify(o) === JSON.stringify(LOCKED))).toHaveLength(20 - MAX_FAILURES);
  });

  it("A's lock expires: the right password then gets in", async () => {
    for (let i = 0; i < MAX_FAILURES; i++) await attempt("nope", IP_A);
    expect(await attempt(GOOD, IP_A)).toEqual(LOCKED);
    const past = new Date(Date.now() - Math.max(WINDOW_MS, LOCK_MS) - 1000);
    await db.update(loginLockouts).set({ windowStartedAt: past, lockedUntil: new Date(Date.now() - 1000) }).where(eq(loginLockouts.key, adminKey(IP_A)));
    expect((await attempt(GOOD, IP_A)).status).toBe(200);
  });

  it("the old global 'admin' row blocks nobody and is left alone", async () => {
    const lockedUntil = new Date(Date.now() + 60 * 60 * 1000);
    await db.insert(loginLockouts).values({ key: "admin", failedCount: 99, windowStartedAt: new Date(), lockedUntil });
    expect((await attempt(GOOD, IP_A)).status).toBe(200);
    expect((await attempt(GOOD, IP_B)).status).toBe(200);
    const legacy = await row("admin");
    expect(legacy.failedCount).toBe(99);
    expect(legacy.lockedUntil!.getTime()).toBe(lockedUntil.getTime());
  });
});

describe("password login on the real table", () => {
  const attempt = async (password: string) => {
    const r = fakeRes();
    await login({ body: { email: EMAIL, password }, ip: "127.0.0.1", headers: {}, cookies: {}, query: {}, socket: {} } as unknown as Request, r.res);
    return r.out;
  };

  it("20 parallel wrong passwords: 5 are evaluated (401), 15 get the lock answer, then even the right password is refused", async () => {
    await db.insert(users).values({ email: EMAIL, name: "Lock", emailVerified: true, passwordHash: bcrypt.hashSync("correct-horse", 4) });
    const results = await Promise.all(Array.from({ length: 20 }, () => attempt("wrong-password")));
    expect(results.filter(o => o.status === 401)).toHaveLength(MAX_FAILURES);
    expect(results.filter(o => JSON.stringify(o) === JSON.stringify(LOCKED))).toHaveLength(20 - MAX_FAILURES);
    expect(await attempt("correct-horse")).toEqual(LOCKED);
  });
});
