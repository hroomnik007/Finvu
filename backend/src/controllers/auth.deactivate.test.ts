import bcrypt from "bcrypt";
import type { Request, Response } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthRequest } from "../middleware/authenticate";

vi.hoisted(() => {
  process.env.BCRYPT_ROUNDS = "4";
  process.env.GOOGLE_CLIENT_ID = "finvu-client-id";
});

// Same drizzle stand-in as the other auth tests: selects resolve to the next
// queued row list; every update's .set() payload is recorded so a test can see
// whether (and how) the account row was changed.
const state = vi.hoisted(() => ({ selects: [] as unknown[][], sets: [] as Record<string, unknown>[] }));
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
      update: () => ({ set: (v: Record<string, unknown>) => { state.sets.push(v); return chain(() => [{ email: "a@b.sk" }]); } }),
      delete: () => chain(() => []),
    },
  };
});
vi.mock("../lib/lockoutStore", () => import("../test/memoryLockoutStore"));
vi.mock("../lib/geoip", () => ({ lookupLocation: async () => null, formatLocation: () => null }));

const { deactivateAccount, resetPassword, googleAuth } = await import("./auth.controller");
const lockouts = await import("../test/memoryLockoutStore");

function fakeRes() {
  const out: { status: number; body: any } = { status: 200, body: undefined };
  const res = {
    status(code: number) { out.status = code; return res; },
    json(body: unknown) { out.body = body; return res; },
    cookie() { return res; },
    clearCookie() { return res; },
  };
  return { res: res as unknown as Response, out };
}
const authReq = (body: unknown) =>
  ({ userId: "u1", userEmail: "a@b.sk", body, query: {}, headers: {}, cookies: {}, ip: "127.0.0.1", socket: {} }) as unknown as AuthRequest;

const passwordHash = bcrypt.hashSync("correct-horse", 4);
const PASSWORD_ACCOUNT = { passwordHash, pinHash: null, googleId: null };
const GOOGLE_ACCOUNT = { passwordHash: null, pinHash: null, googleId: "google-sub-1" };
const deactivated = () => state.sets.some(s => s.isDeactivated === true);

async function deactivate(userRow: unknown, body: unknown) {
  state.selects = [userRow ? [userRow] : []];
  const r = fakeRes();
  await deactivateAccount(authReq(body), r.res);
  return r.out;
}

beforeEach(() => { state.selects = []; state.sets = []; lockouts.rows.clear(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe("deactivateAccount needs a fresh proof of identity", () => {
  it("refuses a bare access token and tells the client which proofs exist", async () => {
    const out = await deactivate({ ...PASSWORD_ACCOUNT, googleId: "g" }, {});
    expect(out.status).toBe(400);
    expect(out.body).toMatchObject({ code: "REAUTH_REQUIRED", methods: ["password", "google"] });
    expect(deactivated()).toBe(false);
  });

  it("refuses a wrong password and accepts the right one", async () => {
    expect((await deactivate(PASSWORD_ACCOUNT, { currentPassword: "nope" })).status).toBe(401);
    expect(deactivated()).toBe(false);
    expect((await deactivate(PASSWORD_ACCOUNT, { currentPassword: "correct-horse" })).status).toBe(200);
    expect(deactivated()).toBe(true);
  });

  it("a password can't be 'proved' on a passwordless account", async () => {
    expect((await deactivate(GOOGLE_ACCOUNT, { currentPassword: "" })).status).toBe(401);
    expect(deactivated()).toBe(false);
  });

  it("refuses a PIN from a device that isn't bound to it", async () => {
    const out = await deactivate({ ...GOOGLE_ACCOUNT, pinHash: bcrypt.hashSync("1234", 4) }, { pin: "1234" });
    expect(out.status).toBe(401);
    expect(out.body).toMatchObject({ code: "PIN_DEVICE_NOT_BOUND" });
    expect(deactivated()).toBe(false);
  });

  describe("with Google", () => {
    const google = (info: object, tokenInfo: object) => vi.stubGlobal("fetch", vi.fn(async (url: string) => ({
      ok: true,
      json: async () => (url.includes("userinfo") ? info : tokenInfo),
    })));
    const me = { sub: "google-sub-1", email: "a@b.sk", email_verified: true, name: "A" };
    const fresh = { aud: "finvu-client-id", expires_in: "3599" };

    it("accepts a fresh token for the linked account, refuses another account", async () => {
      google({ ...me, sub: "google-sub-2" }, fresh);
      expect((await deactivate(GOOGLE_ACCOUNT, { googleAccessToken: "t" })).status).toBe(401);
      expect(deactivated()).toBe(false);
      google(me, fresh);
      expect((await deactivate(GOOGLE_ACCOUNT, { googleAccessToken: "t" })).status).toBe(200);
      expect(deactivated()).toBe(true);
    });
  });
});

describe("the way back", () => {
  it("a password reset by e-mail link lifts the deactivation", async () => {
    state.selects = [[{ id: "r1", userId: "u1" }]];
    const r = fakeRes();
    await resetPassword({ body: { token: "t", newPassword: "long-enough-1" }, cookies: {}, headers: {}, query: {} } as unknown as Request, r.res);
    expect(r.out.status).toBe(200);
    expect(state.sets.find(s => "passwordHash" in s)).toMatchObject({ isDeactivated: false });
  });

  describe("Google sign-in", () => {
    const google = (sub: string) => vi.stubGlobal("fetch", vi.fn(async (url: string) => ({
      ok: true,
      json: async () => (url.includes("userinfo")
        ? { sub, email: "a@b.sk", email_verified: true, name: "A" }
        : { aud: "finvu-client-id", expires_in: "3599" }),
    })));
    const row = { id: "u1", email: "a@b.sk", name: "A", emailVerified: true, isDeactivated: true, googleId: "google-sub-1", passwordHash: null, pinHash: null };
    const signIn = async () => {
      state.selects = [[row]];
      const r = fakeRes();
      await googleAuth({ body: { accessToken: "t" }, cookies: {}, headers: {}, query: {}, ip: "127.0.0.1", socket: {} } as unknown as Request, r.res);
      return r.out;
    };

    it("reactivates a deactivated account for its own Google account", async () => {
      google("google-sub-1");
      const out = await signIn();
      expect(out.status).toBe(200);
      expect(state.sets.some(s => s.isDeactivated === false)).toBe(true);
    });

    it("keeps it locked for a different Google account", async () => {
      google("google-sub-2");
      const out = await signIn();
      expect(out.status).toBe(403);
      expect(state.sets.some(s => s.isDeactivated === false)).toBe(false);
    });
  });

  it("password and PIN sign-in still refuse a deactivated account", async () => {
    const { login } = await import("./auth.controller");
    state.selects = [[{ id: "u1", email: "a@b.sk", emailVerified: true, isDeactivated: true, passwordHash, pinHash: null, googleId: null }]];
    const r = fakeRes();
    await login({ body: { email: "a@b.sk", password: "correct-horse" }, query: {}, headers: {}, cookies: {}, ip: "127.0.0.1", socket: {} } as unknown as Request, r.res);
    expect(r.out.status).toBe(403);
    expect(r.out.body).toMatchObject({ code: "ACCOUNT_DEACTIVATED" });
    expect(state.sets.some(s => s.isDeactivated === false)).toBe(false);
  });
});
