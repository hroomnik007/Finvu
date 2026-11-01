import type { Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => { process.env.BCRYPT_ROUNDS = "4"; });

// Fake drizzle that records every insert(...).values(...) payload.
const state = vi.hoisted(() => ({ selects: [] as unknown[][], inserts: [] as unknown[] }));
vi.mock("../db", () => {
  const chain = (result: () => unknown, onValues?: (v: unknown) => void): unknown => new Proxy(function () {}, {
    get: (_t, prop) => {
      if (prop === "then") return (ok: (v: unknown) => void, bad: (e: unknown) => void) => Promise.resolve(result()).then(ok, bad);
      if (prop === "values") return (v: unknown) => { onValues?.(v); return chain(result); };
      return () => chain(result, onValues);
    },
  });
  return {
    db: {
      select: () => chain(() => state.selects.shift() ?? []),
      insert: () => {
        let vals: Record<string, unknown> = {};
        return chain(
          () => [{ id: "new-user", email: "a@b.sk", name: "Anna", theme: (vals.theme as string | undefined) ?? "dark" }],
          (v) => { vals = v as Record<string, unknown>; state.inserts.push(v); },
        );
      },
      update: () => chain(() => []),
      delete: () => chain(() => []),
    },
  };
});
vi.mock("../lib/lockoutStore", () => import("../test/memoryLockoutStore"));
vi.mock("../lib/email", async (orig) => ({ ...(await orig<typeof import("../lib/email")>()), sendEmail: vi.fn(async () => {}) }));
vi.mock("../lib/googleToken", async (orig) => ({
  ...(await orig<typeof import("../lib/googleToken")>()),
  verifyGoogleAccessToken: vi.fn(async () => ({ ok: true, sub: "g-1", email: "a@b.sk", name: "Anna", expiresIn: 3000 })),
}));

const { register, googleAuth } = await import("./auth.controller");

function fakeRes() {
  const out: { status: number; body: unknown } = { status: 200, body: undefined };
  const res = {
    status(code: number) { out.status = code; return res; },
    json(body: unknown) { out.body = body; return res; },
    cookie() { return res; },
  };
  return { res: res as unknown as Response, out };
}
const req = (body: unknown) =>
  ({ body, query: {}, headers: {}, cookies: {}, ip: "127.0.0.1", socket: {} }) as unknown as Request;
const userInsert = () => state.inserts.find(v => typeof v === "object" && v !== null && "email" in v) as Record<string, unknown> | undefined;

beforeEach(() => { state.selects = []; state.inserts = []; });

describe("theme chosen before sign-up", () => {
  const body = { email: "a@b.sk", password: "long-enough-pw", name: "Anna", gdprConsent: true };

  it("register stores the chosen theme on the new account", async () => {
    state.selects = [[]];
    const r = fakeRes(); await register(req({ ...body, theme: "light" }), r.res);
    expect(r.out.status).toBe(201);
    expect(userInsert()?.theme).toBe("light");
  });

  it("register without a theme leaves the column default alone", async () => {
    state.selects = [[]];
    await register(req(body), fakeRes().res);
    expect(userInsert()).toBeDefined();
    expect(userInsert()).not.toHaveProperty("theme");
  });

  it("register rejects an unknown theme value", async () => {
    const r = fakeRes(); await register(req({ ...body, theme: "neon" }), r.res);
    expect(r.out.status).toBe(400);
    expect(state.inserts).toHaveLength(0);
  });

  it("a new Google account gets the chosen theme and returns it", async () => {
    state.selects = [[]];
    const r = fakeRes(); await googleAuth(req({ accessToken: "tok", theme: "system" }), r.res);
    expect(userInsert()?.theme).toBe("system");
    expect((r.out.body as { user: { theme: string } }).user.theme).toBe("system");
  });

  it("Google ignores a bad theme instead of failing the sign-in", async () => {
    state.selects = [[]];
    const r = fakeRes(); await googleAuth(req({ accessToken: "tok", theme: 42 }), r.res);
    expect(r.out.status).toBe(200);
    expect(userInsert()).not.toHaveProperty("theme");
  });

  it("an existing Google user's theme is not touched", async () => {
    state.selects = [[{ id: "u1", email: "a@b.sk", name: "Anna", googleId: "g-1", emailVerified: true, isDeactivated: false, theme: "dark" }]];
    const r = fakeRes(); await googleAuth(req({ accessToken: "tok", theme: "light" }), r.res);
    expect(userInsert()).toBeUndefined();
    expect((r.out.body as { user: { theme: string } }).user.theme).toBe("dark");
  });
});
