// Shared-report cap against a real Postgres (npm run test:integration, see
// lockout.int.test.ts): counting of active vs expired reports and the advisory
// lock that keeps parallel inserts from passing the cap together.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { randomBytes } from "crypto";
import { db } from "../db";
import { sharedReports, users } from "../db/schema";
import { insertSharedReportWithinCap, MAX_ACTIVE_SHARED_REPORTS } from "../lib/sharedReportLimit";

const run = Date.now().toString(36);
const HOUR = 3600 * 1000;
const ids: string[] = [];

beforeAll(() => {
  const host = new URL(process.env.DATABASE_URL ?? "postgresql://invalid").hostname;
  if (host !== "127.0.0.1" && host !== "localhost") {
    throw new Error(`sharedReportLimit.int.test refuses to run against DATABASE_URL host "${host}"`);
  }
});
afterAll(async () => { if (ids.length) await db.delete(users).where(inArray(users.id, ids)); });

async function seedUser(name: string): Promise<string> {
  const [u] = await db.insert(users).values({ email: `${name}-${run}@reports.test`, name, emailVerified: true, passwordHash: "x" }).returning({ id: users.id });
  ids.push(u.id);
  return u.id;
}
const add = (userId: string, offsetMs = 24 * HOUR) =>
  insertSharedReportWithinCap({ userId, token: randomBytes(32).toString("hex"), data: "d", expiresAt: new Date(Date.now() + offsetMs) });
const count = async (userId: string) => (await db.select({ id: sharedReports.id }).from(sharedReports).where(eq(sharedReports.userId, userId))).length;

describe("insertSharedReportWithinCap", () => {
  it("passes under the cap and fails at it", async () => {
    const u = await seedUser("cap");
    for (let i = 0; i < MAX_ACTIVE_SHARED_REPORTS; i++) expect(await add(u)).toEqual({ ok: true });
    expect(await add(u)).toEqual({ ok: false, reason: "limit" });
    expect(await count(u)).toBe(MAX_ACTIVE_SHARED_REPORTS);
  });

  it("does not count expired reports", async () => {
    const u = await seedUser("expired");
    for (let i = 0; i < MAX_ACTIVE_SHARED_REPORTS; i++) await add(u, -HOUR);
    expect(await add(u)).toEqual({ ok: true });
  });

  it("the cap is per user", async () => {
    const a = await seedUser("a"), b = await seedUser("b");
    for (let i = 0; i < MAX_ACTIVE_SHARED_REPORTS; i++) await add(a);
    expect(await add(b)).toEqual({ ok: true });
  });

  it("parallel inserts cannot exceed the cap", async () => {
    const u = await seedUser("race");
    for (let i = 0; i < MAX_ACTIVE_SHARED_REPORTS - 3; i++) await add(u);
    const results = await Promise.all(Array.from({ length: 12 }, () => add(u)));
    expect(results.filter(r => r.ok)).toHaveLength(3);
    expect(await count(u)).toBe(MAX_ACTIVE_SHARED_REPORTS);
  });
});
