import { describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

// The mid-month job must not mail deactivated accounts: capture the WHERE of
// its subscriber query and check it excludes them.
const captured = vi.hoisted(() => ({ where: undefined as unknown, job: undefined as undefined | (() => void) }));
vi.mock("node-cron", () => ({ default: { schedule: (_expr: string, fn: () => void) => { captured.job = fn; } } }));
vi.mock("../db", () => {
  const chain = (): unknown => new Proxy(function () {}, {
    get: (_t, prop) => {
      if (prop === "then") return (ok: (v: unknown) => void) => Promise.resolve([]).then(ok);
      if (prop === "where") return (w: unknown) => { captured.where ??= w; return chain(); };
      return () => chain();
    },
  });
  return { db: { select: () => chain() } };
});
vi.mock("../lib/email", () => ({ sendEmail: async () => {} }));

const { startWeeklyReportJob } = await import("./weeklyReport");

describe("mid-month report subscribers", () => {
  it("exclude deactivated users", async () => {
    startWeeklyReportJob();
    captured.job!();
    await new Promise(r => setImmediate(r));
    const { sql, params } = new PgDialect().sqlToQuery(captured.where as never);
    expect(sql).toMatch(/"weekly_email_enabled" = \$1/);
    expect(sql).toMatch(/"is_deactivated" = \$2/);
    expect(params).toEqual([true, false]);
  });
});
