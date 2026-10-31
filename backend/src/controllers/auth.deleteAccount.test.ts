import bcrypt from "bcrypt";
import type { Response } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthRequest } from "../middleware/authenticate";

vi.hoisted(() => {
  process.env.BCRYPT_ROUNDS = "4";
  process.env.GOOGLE_CLIENT_ID = "finvu-client-id";
});

// Same drizzle stand-in as auth.lockout.test.ts: each select resolves to the
// next queued row list; deletes are counted so a test can see whether the
// account was actually removed.
const state = vi.hoisted(() => ({ selects: [] as unknown[][], deletes: 0 }));
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
      delete: () => { state.deletes++; return chain(() => []); },
    },
  };
});
vi.mock("../lib/lockoutStore", () => import("../test/memoryLockoutStore"));
vi.mock("../lib/geoip", () => ({ lookupLocation: async () => null, formatLocation: () => null }));
vi.mock("../lib/avatarStorage", () => ({ deleteAvatarFiles: async () => {}, saveAvatarFile: async () => "", parseImageDataUrl: () => null }));
vi.mock("../lib/household", () => ({ releaseOwnedHouseholds: async () => {} }));

const { deleteAccount } = await import("./auth.controller");
const { passkeyReauthOptions, REAUTH_CHALLENGE_TTL_MS } = await import("../lib/passkeyReauth");
const { ORIGIN, RP_ID } = await import("../lib/webauthnChallenges");
const { LOCKED_RESPONSE, MAX_FAILURES } = await import("../lib/loginLockout");
const { PIN_DEVICE_COOKIE } = await import("../lib/tokens");
const lockouts = await import("../test/memoryLockoutStore");
const { softPasskey } = await import("../test/softAuthenticator");

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
const authReq = (userId: string, body: unknown, cookies: Record<string, string> = {}) =>
  ({ userId, userEmail: "a@b.sk", body, query: {}, headers: {}, cookies, ip: "127.0.0.1", socket: {} }) as unknown as AuthRequest;

const pinHash = bcrypt.hashSync("1234", 4);
const PASSWORDLESS = { passwordHash: null, pinHash, googleId: "google-sub-1" };
const deleted = () => state.deletes > 0;

async function del(userRow: unknown, body: unknown, extraSelects: unknown[][] = [], cookies: Record<string, string> = {}, userId = "u1") {
  state.selects = [userRow ? [userRow] : [], ...extraSelects];
  const r = fakeRes();
  await deleteAccount(authReq(userId, body, cookies), r.res);
  return r.out;
}

beforeEach(() => {
  state.selects = [];
  state.deletes = 0;
  lockouts.rows.clear();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-01-01T10:00:00Z"));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("password accounts", () => {
  const row = { passwordHash: bcrypt.hashSync("correct-horse", 4), pinHash: null, googleId: null };
  it("still need the current password", async () => {
    expect((await del(row, {})).status).toBe(400);
    expect((await del(row, { currentPassword: "nope" })).status).toBe(401);
    expect(deleted()).toBe(false);
    expect((await del(row, { currentPassword: "correct-horse" })).status).toBe(200);
    expect(deleted()).toBe(true);
  });
  it("can't skip the password with another proof", async () => {
    expect((await del(row, { pin: "1234" })).status).toBe(400);
    expect(deleted()).toBe(false);
  });
});

describe("passwordless accounts", () => {
  it("are refused without a proof and told which proofs they have", async () => {
    const out = await del(PASSWORDLESS, {}, [[{ n: 1 }]]);
    expect(out.status).toBe(400);
    expect(out.body).toMatchObject({ code: "REAUTH_REQUIRED", methods: ["passkey", "pin", "google"] });
    expect(deleted()).toBe(false);
  });

  describe("with a passkey", () => {
    const key = softPasskey();
    const stored = { id: "c1", userId: "u1", credentialId: key.credentialId, publicKey: key.publicKeyBase64, counter: 0 };
    const challengeFor = async (userId = "u1") => {
      state.selects = [[{ credentialId: key.credentialId }]];
      return (await passkeyReauthOptions(userId))!.challenge;
    };
    const assertion = (challenge: string, userVerified = true) => key.assert({ challenge, origin: ORIGIN, rpId: RP_ID, userVerified });

    it("accepts a fresh, user-verified assertion of the user's own passkey", async () => {
      expect((await del(PASSWORDLESS, { passkey: assertion(await challengeFor()) }, [[stored]])).status).toBe(200);
      expect(deleted()).toBe(true);
    });

    it("rejects a replayed assertion (the challenge is single-use)", async () => {
      const proof = assertion(await challengeFor());
      expect((await del(PASSWORDLESS, { passkey: proof }, [[stored]])).status).toBe(200);
      state.deletes = 0;
      expect((await del(PASSWORDLESS, { passkey: proof }, [[stored]])).status).toBe(401);
      expect(deleted()).toBe(false);
    });

    it("rejects a stale assertion (challenge older than 2 minutes)", async () => {
      const proof = assertion(await challengeFor());
      vi.setSystemTime(new Date(Date.now() + REAUTH_CHALLENGE_TTL_MS + 1000));
      expect((await del(PASSWORDLESS, { passkey: proof }, [[stored]])).status).toBe(401);
      expect(deleted()).toBe(false);
    });

    it("rejects another user's proof", async () => {
      // A challenge issued to u2, used for u1's deletion
      const proof = assertion(await challengeFor("u2"));
      expect((await del(PASSWORDLESS, { passkey: proof }, [[stored]])).status).toBe(401);
      // A passkey that isn't one of u1's (the lookup is scoped by user id)
      const proof2 = assertion(await challengeFor());
      expect((await del(PASSWORDLESS, { passkey: proof2 }, [[]])).status).toBe(401);
      expect(deleted()).toBe(false);
    });

    it("rejects an assertion without user verification", async () => {
      expect((await del(PASSWORDLESS, { passkey: assertion(await challengeFor(), false) }, [[stored]])).status).toBe(401);
      expect(deleted()).toBe(false);
    });

    it("rejects garbage", async () => {
      await challengeFor();
      expect((await del(PASSWORDLESS, { passkey: "x" }, [[stored]])).status).toBe(401);
      expect(deleted()).toBe(false);
    });
  });

  describe("with the PIN", () => {
    const device = [[{ id: "d1" }]]; // the pinDevice cookie matches a bound device
    const cookie = { [PIN_DEVICE_COOKIE]: "device-token" };

    it("accepts the right PIN from a bound device", async () => {
      expect((await del(PASSWORDLESS, { pin: "1234" }, device, cookie)).status).toBe(200);
      expect(deleted()).toBe(true);
    });

    it("refuses it from a device that isn't bound", async () => {
      expect((await del(PASSWORDLESS, { pin: "1234" }, [], {})).body.code).toBe("PIN_DEVICE_NOT_BOUND");
      expect((await del(PASSWORDLESS, { pin: "1234" }, [[]], cookie)).status).toBe(401);
      expect(deleted()).toBe(false);
    });

    it("refuses it when the account has no PIN", async () => {
      expect((await del({ ...PASSWORDLESS, pinHash: null }, { pin: "1234" }, device, cookie)).status).toBe(401);
      expect(deleted()).toBe(false);
    });

    it(`locks after ${MAX_FAILURES} wrong PINs, shared with PIN sign-in`, async () => {
      for (let i = 0; i < MAX_FAILURES; i++) expect((await del(PASSWORDLESS, { pin: "0000" }, device, cookie)).status).toBe(401);
      expect(await del(PASSWORDLESS, { pin: "1234" }, device, cookie)).toEqual({ status: 429, body: LOCKED_RESPONSE });
      expect(deleted()).toBe(false);
    });
  });

  describe("with Google", () => {
    const google = (info: object, tokenInfo: object) => vi.stubGlobal("fetch", vi.fn(async (url: string) => ({
      ok: true,
      json: async () => (url.includes("userinfo") ? info : tokenInfo),
    })));
    const me = { sub: "google-sub-1", email: "a@b.sk", email_verified: true, name: "A" };
    const fresh = { aud: "finvu-client-id", expires_in: "3599" };

    it("accepts a token just issued for the linked Google account", async () => {
      google(me, fresh);
      expect((await del(PASSWORDLESS, { googleAccessToken: "t" })).status).toBe(200);
      expect(deleted()).toBe(true);
    });

    it("rejects someone else's Google account", async () => {
      google({ ...me, sub: "google-sub-2" }, fresh);
      expect((await del(PASSWORDLESS, { googleAccessToken: "t" })).status).toBe(401);
      google(me, fresh);
      expect((await del({ ...PASSWORDLESS, googleId: null }, { googleAccessToken: "t" })).status).toBe(401);
      expect(deleted()).toBe(false);
    });

    it("rejects a stale token or one issued to another app", async () => {
      google(me, { ...fresh, expires_in: "1200" });
      expect((await del(PASSWORDLESS, { googleAccessToken: "t" })).status).toBe(401);
      google(me, { aud: "some-other-app", expires_in: "3599" });
      expect((await del(PASSWORDLESS, { googleAccessToken: "t" })).status).toBe(401);
      expect(deleted()).toBe(false);
    });
  });
});
