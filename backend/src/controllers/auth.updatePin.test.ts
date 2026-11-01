import bcrypt from "bcrypt";
import type { Response } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthRequest } from "../middleware/authenticate";

vi.hoisted(() => {
  process.env.BCRYPT_ROUNDS = "4";
  process.env.GOOGLE_CLIENT_ID = "finvu-client-id";
});

// Same drizzle stand-in as auth.deleteAccount.test.ts; updates are counted so a
// test can see whether the PIN was actually written.
const state = vi.hoisted(() => ({ selects: [] as unknown[][], updates: 0 }));
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
      update: () => { state.updates++; return chain(() => []); },
      delete: () => chain(() => []),
    },
  };
});
vi.mock("../lib/lockoutStore", () => import("../test/memoryLockoutStore"));
vi.mock("../lib/geoip", () => ({ lookupLocation: async () => null, formatLocation: () => null }));
vi.mock("../lib/avatarStorage", () => ({ deleteAvatarFiles: async () => {}, saveAvatarFile: async () => "", parseImageDataUrl: () => null }));
vi.mock("../lib/household", () => ({ releaseOwnedHouseholds: async () => {} }));

const { updatePin } = await import("./auth.controller");
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

async function setPin(userRow: unknown, body: unknown) {
  // 1st select: the user row; 2nd: whatever token-device bookkeeping asks for
  state.selects = [[userRow], [], []];
  const r = fakeRes();
  await updatePin(authReq(body), r.res);
  return r.out;
}

const GOOGLE_ONLY = { passwordHash: null, pinHash: null, googleId: "google-sub-1" };

beforeEach(() => {
  state.selects = [];
  state.updates = 0;
  lockouts.rows.clear();
});
afterEach(() => { vi.unstubAllGlobals(); });

describe("first PIN on a Google-only account", () => {
  const google = (info: object, tokenInfo: object) => vi.stubGlobal("fetch", vi.fn(async (url: string) => ({
    ok: true,
    json: async () => (url.includes("userinfo") ? info : tokenInfo),
  })));
  const me = { sub: "google-sub-1", email: "a@b.sk", email_verified: true, name: "A" };
  const fresh = { aud: "finvu-client-id", expires_in: "3599" };

  it("is refused without a Google token and nothing is written", async () => {
    const out = await setPin(GOOGLE_ONLY, { pin: "1234" });
    expect(out.status).toBe(400);
    expect(out.body).toMatchObject({ code: "REAUTH_REQUIRED", methods: ["google"] });
    expect(state.updates).toBe(0);
  });

  it("is refused for someone else's Google account", async () => {
    google({ ...me, sub: "google-sub-2" }, fresh);
    expect((await setPin(GOOGLE_ONLY, { pin: "1234", googleAccessToken: "t" })).status).toBe(401);
    google(me, fresh);
    expect((await setPin({ ...GOOGLE_ONLY, googleId: null }, { pin: "1234", googleAccessToken: "t" })).status).toBe(401);
    expect(state.updates).toBe(0);
  });

  it("is refused for a stale token or one issued to another app", async () => {
    google(me, { ...fresh, expires_in: "1200" });
    expect((await setPin(GOOGLE_ONLY, { pin: "1234", googleAccessToken: "t" })).status).toBe(401);
    google(me, { aud: "some-other-app", expires_in: "3599" });
    expect((await setPin(GOOGLE_ONLY, { pin: "1234", googleAccessToken: "t" })).status).toBe(401);
    expect(state.updates).toBe(0);
  });

  it("sets the PIN with a token just issued for the linked Google account", async () => {
    google(me, fresh);
    const out = await setPin(GOOGLE_ONLY, { pin: "1234", googleAccessToken: "t" });
    expect(out.status).toBe(200);
    expect(out.body).toEqual({ success: true });
    expect(state.updates).toBeGreaterThan(0);
  });
});

describe("existing branches are unchanged", () => {
  it("password accounts still need the current password", async () => {
    const row = { passwordHash: bcrypt.hashSync("correct-horse", 4), pinHash: null, googleId: null };
    expect((await setPin(row, { pin: "1234" })).status).toBe(401);
    expect((await setPin(row, { pin: "1234", currentPassword: "correct-horse" })).status).toBe(200);
  });

  it("accounts with a PIN still need the current PIN or password", async () => {
    const row = { passwordHash: null, pinHash: bcrypt.hashSync("4321", 4), googleId: "g" };
    expect((await setPin(row, { pin: "1234" })).status).toBe(401);
    expect((await setPin(row, { pin: "1234", googleAccessToken: "t" })).status).toBe(401);
    expect((await setPin(row, { pin: "1234", currentPin: "4321" })).status).toBe(200);
  });
});
