import bcrypt from "bcrypt";
import type { Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z, ZodError } from "zod";

vi.hoisted(() => { process.env.BCRYPT_ROUNDS = "4"; });

// A tiny stand-in for drizzle: every select resolves to the next queued row
// list, inserts resolve to a fake user. Nothing touches a real database.
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
      insert: () => chain(() => [{ id: "new-user", email: "x", name: "x" }]),
      update: () => chain(() => []),
      delete: () => chain(() => []),
    },
  };
});
vi.mock("../lib/lockoutStore", () => import("../test/memoryLockoutStore"));
const sendEmail = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("../lib/email", async (orig) => ({ ...(await orig<typeof import("../lib/email")>()), sendEmail }));

const { register, login, getAuthMethods } = await import("./auth.controller");
const { errorHandler } = await import("../middleware/errorHandler");
const lockouts = await import("../test/memoryLockoutStore");

function fakeRes() {
  const out: { status: number; body: unknown } = { status: 200, body: undefined };
  const res = {
    status(code: number) { out.status = code; return res; },
    json(body: unknown) { out.body = body; return res; },
    cookie() { return res; },
  };
  return { res: res as unknown as Response, out };
}
const req = (body: unknown, query: Record<string, string> = {}) =>
  ({ body, query, headers: {}, cookies: {}, ip: "127.0.0.1", socket: {} }) as unknown as Request;

const passwordHash = bcrypt.hashSync("correct-horse", 4);
const baseUser = { id: "u1", email: "a@b.sk", name: "A", emailVerified: true, isDeactivated: false, googleId: null };

beforeEach(() => { state.selects = []; lockouts.rows.clear(); sendEmail.mockClear(); });

describe("GET /api/auth/methods", () => {
  it("answers the same for every email, without looking anything up", async () => {
    const a = fakeRes(); await getAuthMethods(req({}, { email: "exists@b.sk" }), a.res);
    const b = fakeRes(); await getAuthMethods(req({}, { email: "nobody@b.sk" }), b.res);
    const c = fakeRes(); await getAuthMethods(req({}, {}), c.res);
    expect(a.out).toEqual(b.out);
    expect(a.out).toEqual(c.out);
    expect(a.out.body).toEqual({ pin: true, google: true, password: true, passkey: true });
  });
});

describe("POST /api/auth/register", () => {
  const body = { email: "a@b.sk", password: "long-enough-pw", name: "Anna", gdprConsent: true };

  it("gives an existing email the same response as a new one", async () => {
    state.selects = [[]];
    const fresh = fakeRes(); await register(req(body), fresh.res);
    state.selects = [[{ id: "u1" }]];
    const taken = fakeRes(); await register(req(body), taken.res);
    expect(taken.out).toEqual(fresh.out);
    expect(taken.out.status).toBe(201);
  });

  it("emails the existing owner a notice instead of a verification link", async () => {
    state.selects = [[{ id: "u1" }]];
    await register(req(body), fakeRes().res);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const [to, subject, html] = sendEmail.mock.calls[0] as unknown as [string, string, string];
    expect(to).toBe("a@b.sk");
    expect(subject).toMatch(/už existuje/);
    expect(html).not.toMatch(/verify-email/);
  });
});

describe("POST /api/auth/login", () => {
  const attempt = async (user: unknown, password = "wrong-password") => {
    state.selects = [user ? [user] : []];
    const r = fakeRes();
    await login(req({ email: "a@b.sk", password }), r.res);
    return r.out;
  };

  it("answers unknown email, Google-only account and wrong password identically", async () => {
    const unknown = await attempt(null);
    const googleOnly = await attempt({ ...baseUser, passwordHash: null, googleId: "g1" });
    const wrong = await attempt({ ...baseUser, passwordHash });
    expect(unknown).toEqual({ status: 401, body: { error: "Nesprávne prihlasovacie údaje." } });
    expect(googleOnly).toEqual(unknown);
    expect(wrong).toEqual(unknown);
  });

  it("still runs a bcrypt compare when the account doesn't exist", async () => {
    const spy = vi.spyOn(bcrypt, "compare");
    await attempt(null);
    await attempt({ ...baseUser, passwordHash: null });
    expect(spy).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });
});

describe("validation error details", () => {
  it("only return path and message", async () => {
    const r = fakeRes();
    await login(req({ email: "not-an-email" }), r.res);
    expect(r.out.status).toBe(400);
    const details = (r.out.body as { details: Record<string, unknown>[] }).details;
    expect(details.length).toBe(2);
    for (const d of details) expect(Object.keys(d).sort()).toEqual(["message", "path"]);
    expect(JSON.stringify(r.out.body)).not.toMatch(/"(pattern|code|format|origin|expected)"/);
  });

  it("are trimmed the same way by the global error handler", () => {
    const err = z.object({ id: z.guid() }).safeParse({ id: "x" }).error as ZodError;
    const r = fakeRes();
    errorHandler(err, req({}), r.res, () => {});
    expect(r.out).toEqual({ status: 400, body: { error: "Validation error", details: [{ path: ["id"], message: "Invalid GUID" }] } });
  });
});
