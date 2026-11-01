import type { Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => { process.env.BCRYPT_ROUNDS = "4"; });

// Records the order of events so a test can tell whether the answer went out
// before any database or e-mail work happened.
const state = vi.hoisted(() => ({ selects: [] as unknown[][], events: [] as string[] }));
vi.mock("../db", () => {
  const chain = (result: () => unknown): unknown => new Proxy(function () {}, {
    get: (_t, prop) => prop === "then"
      ? (ok: (v: unknown) => void, bad: (e: unknown) => void) => Promise.resolve(result()).then(ok, bad)
      : () => chain(result),
  });
  return {
    db: {
      select: () => chain(() => { state.events.push("select"); return state.selects.shift() ?? []; }),
      insert: () => chain(() => []),
      update: () => chain(() => []),
      delete: () => chain(() => []),
    },
  };
});
vi.mock("../lib/lockoutStore", () => import("../test/memoryLockoutStore"));
const sendEmail = vi.hoisted(() => vi.fn(async (..._args: unknown[]) => {}));
vi.mock("../lib/email", async (orig) => ({ ...(await orig<typeof import("../lib/email")>()), sendEmail }));

const { forgotPassword } = await import("./auth.controller");

function fakeRes() {
  const out: { status: number; body: unknown } = { status: 200, body: undefined };
  const res = {
    status(code: number) { out.status = code; return res; },
    json(body: unknown) { out.body = body; state.events.push("respond"); return res; },
  };
  return { res: res as unknown as Response, out };
}
const call = async (email: unknown) => {
  const r = fakeRes();
  await forgotPassword({ body: { email }, query: {}, headers: {}, cookies: {} } as unknown as Request, r.res);
  return r.out;
};
const settle = () => new Promise<void>(resolve => setImmediate(resolve));

beforeEach(() => { state.selects = []; state.events = []; sendEmail.mockReset(); sendEmail.mockImplementation(async () => {}); });

describe("forgotPassword", () => {
  it("answers the same for an existing and an unknown address", async () => {
    state.selects = [[{ id: "u1" }]];
    const known = await call("a@b.sk");
    await settle();
    state.selects = [[]];
    const unknown = await call("nobody@b.sk");
    await settle();
    expect(unknown).toEqual(known);
    expect(known).toEqual({ status: 200, body: { message: "Ak email existuje, bol odoslaný odkaz na obnovenie hesla." } });
  });

  it("answers before any database or e-mail work, for both", async () => {
    state.selects = [[{ id: "u1" }]];
    await call("a@b.sk");
    await settle();
    expect(state.events[0]).toBe("respond");
    state.events = [];
    state.selects = [[]];
    await call("nobody@b.sk");
    await settle();
    expect(state.events[0]).toBe("respond");
  });

  it("sends the mail for an existing account and never reaches SMTP for an unknown one", async () => {
    state.selects = [[{ id: "u1" }]];
    await call("a@b.sk");
    await settle();
    expect(sendEmail).toHaveBeenCalledTimes(1);
    sendEmail.mockClear();
    state.selects = [[]];
    await call("nobody@b.sk");
    await settle();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("a failing e-mail is only logged and doesn't change the answer", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    sendEmail.mockRejectedValueOnce(new Error("SMTP down"));
    state.selects = [[{ id: "u1" }]];
    const out = await call("a@b.sk");
    await settle();
    await settle();
    process.off("unhandledRejection", unhandled);
    expect(out.status).toBe(200);
    expect(out.body).toEqual({ message: "Ak email existuje, bol odoslaný odkaz na obnovenie hesla." });
    expect(log).toHaveBeenCalled();
    expect(unhandled).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it("ignores an invalid address with the same answer and no work", async () => {
    expect((await call("not-an-email")).body).toEqual({ message: "Ak email existuje, bol odoslaný odkaz na obnovenie hesla." });
    await settle();
    expect(state.events).toEqual(["respond"]);
  });
});
