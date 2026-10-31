import bcrypt from "bcrypt";
import type { Request, Response } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => { process.env.BCRYPT_ROUNDS = "4"; });

// Same tiny drizzle stand-in as auth.enumeration.test.ts: each select resolves
// to the next queued row list. The lockout counter itself runs in memory.
const state = vi.hoisted(() => ({ selects: [] as unknown[][] }));
vi.mock("../db", () => {
  const chain = (result: () => unknown): unknown => new Proxy(function () {}, {
    get: (_t, prop) => prop === "then"
      ? (ok: (v: unknown) => void, bad: (e: unknown) => void) => Promise.resolve(result()).then(ok, bad)
      : () => chain(result),
  });
  return {
    db: {
      select: () => chain(() => state.selects.shift() ?? []),
      insert: () => chain(() => [{ id: "s1" }]),
      update: () => chain(() => []),
      delete: () => chain(() => []),
    },
  };
});
vi.mock("../lib/lockoutStore", () => import("../test/memoryLockoutStore"));
vi.mock("../lib/geoip", () => ({ lookupLocation: async () => null, formatLocation: () => null }));

const { login, pinLogin, adminLogin } = await import("./auth.controller");
const lockouts = await import("../test/memoryLockoutStore");
const { LOCKED_RESPONSE, MAX_FAILURES, LOCK_MS, WINDOW_MS } = await import("../lib/loginLockout");

function fakeRes() {
  const out: { status: number; body: unknown } = { status: 200, body: undefined };
  const res = {
    status(code: number) { out.status = code; return res; },
    json(body: unknown) { out.body = body; return res; },
    cookie() { return res; },
  };
  return { res: res as unknown as Response, out };
}
const req = (body: unknown, cookies: Record<string, string> = {}) =>
  ({ body, query: {}, headers: {}, cookies, ip: "127.0.0.1", socket: {} }) as unknown as Request;

const passwordHash = bcrypt.hashSync("correct-horse", 4);
const pinHash = bcrypt.hashSync("1234", 4);
const user = { id: "u1", email: "a@b.sk", name: "A", emailVerified: true, isDeactivated: false, googleId: null, passwordHash, pinHash };

const FAIL = { status: 401, body: { error: "Invalid email or password.", code: "INVALID_CREDENTIALS" } };
const LOCKED = { status: 429, body: LOCKED_RESPONSE };

beforeEach(() => {
  state.selects = [];
  lockouts.rows.clear();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-01-01T10:00:00Z"));
});
afterEach(() => { vi.useRealTimers(); });

const later = (ms: number) => vi.setSystemTime(new Date(Date.now() + ms));

describe("lockout policy", () => {
  it("is still 5 failures within 15 minutes, answered with the rate-limit code", () => {
    expect(MAX_FAILURES).toBe(5);
    expect(WINDOW_MS).toBe(15 * 60 * 1000);
    expect(LOCKED_RESPONSE).toEqual({ error: "Too many attempts. Try again later.", code: "AUTH_RATE_LIMITED" });
  });
});

describe("password login lockout", () => {
  const attempt = async (password: string, row: unknown = user, email = "a@b.sk") => {
    state.selects = [row ? [row] : []];
    const r = fakeRes();
    await login(req({ email, password }), r.res);
    return r.out;
  };

  it(`locks after ${MAX_FAILURES} failures and then refuses even the right password`, async () => {
    for (let i = 0; i < MAX_FAILURES; i++) expect(await attempt("wrong-password")).toEqual(FAIL);
    expect(await attempt("correct-horse")).toEqual(LOCKED);
    expect(await attempt("wrong-password")).toEqual(LOCKED);
  });

  it("doesn't look the account up or run bcrypt while locked", async () => {
    for (let i = 0; i < MAX_FAILURES; i++) await attempt("wrong-password");
    const spy = vi.spyOn(bcrypt, "compare");
    state.selects = [[user]];
    await login(req({ email: "a@b.sk", password: "correct-horse" }), fakeRes().res);
    expect(spy).not.toHaveBeenCalled();
    expect(state.selects).toHaveLength(1);
    spy.mockRestore();
  });

  it("lets the right password in again once the lock expires", async () => {
    for (let i = 0; i < MAX_FAILURES; i++) await attempt("wrong-password");
    later(LOCK_MS - 1000);
    expect(await attempt("correct-horse")).toEqual(LOCKED);
    later(2000);
    expect((await attempt("correct-horse")).status).toBe(200);
  });

  it("resets the count after a successful login", async () => {
    for (let i = 0; i < MAX_FAILURES - 1; i++) await attempt("wrong-password");
    expect((await attempt("correct-horse")).status).toBe(200);
    for (let i = 0; i < MAX_FAILURES - 1; i++) expect(await attempt("wrong-password")).toEqual(FAIL);
    expect((await attempt("correct-horse")).status).toBe(200);
  });

  it("only counts failures within the window", async () => {
    for (let i = 0; i < MAX_FAILURES - 1; i++) await attempt("wrong-password");
    later(WINDOW_MS + 1000);
    for (let i = 0; i < MAX_FAILURES - 1; i++) expect(await attempt("wrong-password")).toEqual(FAIL);
    expect((await attempt("correct-horse")).status).toBe(200);
  });

  it("answers an unknown email exactly like an existing one, locked or not", async () => {
    const known: unknown[] = [], unknown: unknown[] = [];
    for (let i = 0; i <= MAX_FAILURES; i++) known.push(await attempt("wrong-password", user, "a@b.sk"));
    for (let i = 0; i <= MAX_FAILURES; i++) unknown.push(await attempt("wrong-password", null, "nobody@b.sk"));
    expect(unknown).toEqual(known);
    expect(known.at(-1)).toEqual(LOCKED);
  });

  it("keys by the normalized email, so case and spaces don't reset it", async () => {
    for (let i = 0; i < MAX_FAILURES; i++) await attempt("wrong-password", user, i % 2 ? " A@B.SK " : "a@b.sk");
    expect(await attempt("correct-horse", user, "A@b.sk")).toEqual(LOCKED);
  });

  it("doesn't lock other accounts", async () => {
    for (let i = 0; i < MAX_FAILURES; i++) await attempt("wrong-password");
    expect((await attempt("correct-horse", { ...user, id: "u2", email: "c@d.sk" }, "c@d.sk")).status).toBe(200);
  });

  it("stores only a hash of the email", async () => {
    await attempt("wrong-password");
    const keys = [...lockouts.rows.keys()];
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatch(/^pw:[0-9a-f]{64}$/);
  });
});

describe("PIN login lockout", () => {
  const attempt = async (pin: string) => {
    // user row, then the matching pinDevice token
    state.selects = [[user], [{ id: "d1" }]];
    const r = fakeRes();
    await pinLogin(req({ email: "a@b.sk", pin }, { pinDevice: "device-token" }), r.res);
    return r.out;
  };
  const WRONG_PIN = { status: 401, body: { error: "Invalid PIN.", code: "INVALID_PIN" } };

  it(`locks after ${MAX_FAILURES} wrong PINs, then expires`, async () => {
    for (let i = 0; i < MAX_FAILURES; i++) expect(await attempt("0000")).toEqual(WRONG_PIN);
    expect(await attempt("1234")).toEqual(LOCKED);
    later(LOCK_MS + 1000);
    expect((await attempt("1234")).status).toBe(200);
  });

  it("resets after a correct PIN", async () => {
    for (let i = 0; i < MAX_FAILURES - 1; i++) await attempt("0000");
    expect((await attempt("1234")).status).toBe(200);
    for (let i = 0; i < MAX_FAILURES - 1; i++) expect(await attempt("0000")).toEqual(WRONG_PIN);
    expect((await attempt("1234")).status).toBe(200);
  });

  it("is separate from the password lockout", async () => {
    for (let i = 0; i < MAX_FAILURES; i++) await attempt("0000");
    state.selects = [[user]];
    const r = fakeRes();
    await login(req({ email: "a@b.sk", password: "correct-horse" }), r.res);
    expect(r.out.status).toBe(200);
  });

  it("doesn't count requests from an unbound device", async () => {
    for (let i = 0; i < MAX_FAILURES + 2; i++) {
      state.selects = [[user], []];
      const r = fakeRes();
      await pinLogin(req({ email: "a@b.sk", pin: "0000" }, { pinDevice: "other" }), r.res);
      expect(r.out).toEqual(WRONG_PIN);
    }
    expect((await attempt("1234")).status).toBe(200);
  });
});

describe("admin login lockout", () => {
  const attempt = async (password: string) => {
    const r = fakeRes();
    await adminLogin(req({ username: "admin", password }), r.res);
    return r.out;
  };

  it(`locks after ${MAX_FAILURES} failures, resets on success, expires`, async () => {
    for (let i = 0; i < MAX_FAILURES - 1; i++) expect((await attempt("nope")).status).toBe(401);
    expect((await attempt("test-admin-password")).status).toBe(200);
    for (let i = 0; i < MAX_FAILURES; i++) expect((await attempt("nope")).status).toBe(401);
    expect(await attempt("test-admin-password")).toEqual(LOCKED);
    later(LOCK_MS + 1000);
    expect((await attempt("test-admin-password")).status).toBe(200);
  });
});
