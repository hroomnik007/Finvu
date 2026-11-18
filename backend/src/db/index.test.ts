import { afterEach, describe, expect, it, vi } from "vitest";
import { pool, POOL_OPTIONS, warnIfSuperuser } from "./index";

afterEach(() => vi.restoreAllMocks());

describe("application pool", () => {
  it("is configured with explicit limits and server-side timeouts", () => {
    expect(POOL_OPTIONS).toEqual({
      max: 10,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
      statement_timeout: 30000,
      idle_in_transaction_session_timeout: 60000,
    });
    const opts = (pool as unknown as { options: Record<string, unknown> }).options;
    expect(opts).toMatchObject(POOL_OPTIONS);
  });

  it("logs the idle-client error without the connection string", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    pool.emit("error", new Error("lost postgresql://app:s3cretpw@db:5432/app"));
    const logged = spy.mock.calls.flat().map(String).join("\n");
    expect(logged).toContain("[db] idle client error:");
    expect(logged).not.toContain("s3cretpw");
  });
});

describe("warnIfSuperuser", () => {
  it("warns once, without secrets, when the role is a superuser", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await warnIfSuperuser(async () => ({ rows: [{ rolsuper: true }] }));
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toMatch(/superuser/);
  });

  it("stays silent for a normal role and when the query fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await warnIfSuperuser(async () => ({ rows: [{ rolsuper: false }] }));
    await expect(warnIfSuperuser(async () => { throw new Error("connection refused"); })).resolves.toBeUndefined();
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });
});
