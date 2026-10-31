// Subscription suggestions against a real Postgres: computed from the caller's
// own rows only, and a dismissal hides a pattern for that user alone.
// Run with `npm run test:integration`.
import express from "express";
import type { AddressInfo } from "net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { users, households, householdMembers, transactions, subscriptionDismissals } from "../db/schema";
import { signAccessToken } from "../lib/tokens";
import { localDateISO } from "../lib/localDate";
import { errorHandler } from "../middleware/errorHandler";
import subscriptionsRouter from "../routes/subscriptions";

const app = express();
app.use(express.json());
app.use("/api/subscriptions", subscriptionsRouter);
app.use(errorHandler);

const run = Date.now().toString(36);
let base = "";
let server: ReturnType<typeof app.listen>;
type U = { id: string; token: string };
let alice: U, bob: U, carol: U;

async function makeUser(name: string): Promise<U> {
  const email = `${name}-${run}@subs.test`;
  const [u] = await db.insert(users).values({ email, name, emailVerified: true }).returning({ id: users.id });
  return { id: u.id, token: signAccessToken({ userId: u.id, email }) };
}

// The 10th of this month and the two before it (or the 1st when today is the 1st-9th
// of a month and the 10th hasn't come yet: still within the ±4 days of a charge)
function lastThreeMonths(day = 10): string[] {
  const today = localDateISO();
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  const shift = Number(today.slice(8, 10)) >= day ? 0 : 1;
  return [2, 1, 0].map(k => {
    const d = new Date(Date.UTC(y, m - 1 - k - shift, day));
    return d.toISOString().slice(0, 10);
  });
}

const monthly = (u: U, description: string, amount: string) => lastThreeMonths().map(date =>
  ({ userId: u.id, createdBy: u.id, type: "expense", amount, description, date }));

const suggestions = async (token?: string) => {
  const res = await fetch(`${base}/api/subscriptions/suggestions`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  return { status: res.status, body: res.status === 200 ? await res.json() as { data: { key: string; amount: number }[] } : null };
};
const dismiss = (token: string | undefined, key: unknown) => fetch(`${base}/api/subscriptions/dismissals`, {
  method: "POST",
  headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  body: JSON.stringify({ key }),
});

beforeAll(async () => {
  alice = await makeUser("alice");
  bob = await makeUser("bob");
  carol = await makeUser("carol");
  // alice and bob share a household: the app shows alice bob's rows, but suggestions are personal
  const [h] = await db.insert(households).values({ name: "Home", inviteCode: `S${run}`.slice(0, 20), createdBy: alice.id }).returning({ id: households.id });
  for (const m of [alice.id, bob.id]) {
    await db.insert(householdMembers).values({ householdId: h.id, userId: m });
    await db.update(users).set({ householdId: h.id, householdEnabled: true }).where(eq(users.id, m));
  }
  await db.insert(transactions).values([
    ...monthly(alice, "NETFLIX.COM", "12.99"),
    ...monthly(bob, "Spotify", "10.99").map(r => ({ ...r, householdId: h.id })),
    ...monthly(bob, "Netflix", "12.99").map(r => ({ ...r, householdId: h.id })),
    ...monthly(carol, "Fitko", "29.00"),
    // carol already pays the gym as a fixed expense
    { userId: carol.id, createdBy: carol.id, type: "expense", amount: "29.00", description: JSON.stringify({ l: "Fitko", n: "", d: 10 }), date: "2026-01-01", isFixed: true },
  ]);
  await new Promise<void>(resolve => { server = app.listen(0, () => resolve()) });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  server?.close();
  const ids = [alice, bob, carol].filter(Boolean).map(u => u.id);
  await db.update(users).set({ householdId: null }).where(inArray(users.id, ids));
  await db.delete(households).where(inArray(households.createdBy, ids));
  await db.delete(users).where(inArray(users.id, ids));
});

describe("subscription suggestions", () => {
  it("need a login", async () => {
    expect((await suggestions()).status).toBe(401);
    expect((await suggestions("not-a-token")).status).toBe(401);
    expect((await dismiss(undefined, "netflix")).status).toBe(401);
  });

  it("come from the caller's own rows only, not the household's", async () => {
    const a = await suggestions(alice.token);
    expect(a.status).toBe(200);
    expect(a.body!.data.map(s => s.key)).toEqual(["netflix"]);
    const b = await suggestions(bob.token);
    expect(b.body!.data.map(s => s.key).sort()).toEqual(["netflix", "spotify"]);
  });

  it("leave out what is already a fixed expense", async () => {
    expect((await suggestions(carol.token)).body!.data).toEqual([]);
  });

  it("stay hidden after Skryť, for that user alone", async () => {
    expect((await dismiss(alice.token, "netflix")).status).toBe(204);
    expect((await dismiss(alice.token, "netflix")).status).toBe(204); // twice is fine
    expect((await suggestions(alice.token)).body!.data).toEqual([]);
    expect((await suggestions(bob.token)).body!.data.map(s => s.key).sort()).toEqual(["netflix", "spotify"]);
    const rows = await db.select().from(subscriptionDismissals).where(inArray(subscriptionDismissals.userId, [alice.id, bob.id]));
    expect(rows.map(r => [r.userId, r.patternKey])).toEqual([[alice.id, "netflix"]]);
  });

  it("only accept keys in the detector's form", async () => {
    for (const bad of ["", "NETFLIX.COM 1234", "x".repeat(121), 42, null, { key: "a" }]) {
      expect((await dismiss(bob.token, bad)).status).toBe(400);
    }
    const rows = await db.select().from(subscriptionDismissals).where(eq(subscriptionDismissals.userId, bob.id));
    expect(rows).toEqual([]);
  });
});
