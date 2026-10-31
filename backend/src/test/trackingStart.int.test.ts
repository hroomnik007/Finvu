// Months before a user's tracking start are empty in every monthly aggregate —
// one-off and recurring rows alike — and a recurring row dated earlier counts
// from the start month on. Family figures apply each member's own start; with
// no tracking_start_date the month the account was created is the start.
// Run with `npm run test:integration` (see accessControl.int.test.ts).
import express from "express";
import type { AddressInfo } from "net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { users, households, householdMembers, transactions } from "../db/schema";
import { signAccessToken } from "../lib/tokens";
import { authenticateToken } from "../middleware/authenticate";
import { errorHandler } from "../middleware/errorHandler";
import transactionsRouter from "../routes/transactions";
import householdsRouter from "../routes/households";

const app = express();
app.use(express.json());
app.use("/api/transactions", transactionsRouter);
app.use("/api/households", authenticateToken, householdsRouter);
app.use(errorHandler);

const run = Date.now().toString(36);
let server: ReturnType<typeof app.listen>;
let base = "";
let alice = { id: "", token: "" };
let bob = { id: "", token: "" };
let household = 0;

async function seed(name: string, values: Partial<typeof users.$inferInsert>) {
  const email = `${name}-${run}@start.test`;
  const [u] = await db.insert(users).values({ email, name, emailVerified: true, passwordHash: "x", ...values }).returning({ id: users.id });
  return { id: u.id, token: signAccessToken({ userId: u.id, email }) };
}
const tx = (userId: string, o: Partial<typeof transactions.$inferInsert>) =>
  db.insert(transactions).values({ userId, createdBy: userId, type: "expense", amount: "0", date: "2026-01-01", ...o });

beforeAll(async () => {
  // Alice started in April; her recurring income 'Babka' is dated January.
  alice = await seed("alice", { trackingStartDate: "2026-04-01" });
  await tx(alice.id, { type: "income", amount: "200.00", description: "Babka", date: "2026-01-05", isFixed: true });
  await tx(alice.id, { amount: "30.00", description: "pred štartom", date: "2026-02-10" });
  await tx(alice.id, { amount: "40.00", description: "obed", date: "2026-05-10" });
  // Bob never set a tracking start: his account was created in February.
  bob = await seed("bob", { createdAt: new Date("2026-02-15T10:00:00Z") });
  await tx(bob.id, { amount: "100.00", description: "Nájom", date: "2026-01-01", isFixed: true });

  const [h] = await db.insert(households).values({ name: "Home", inviteCode: `S${run}`.slice(0, 20), createdBy: alice.id }).returning({ id: households.id });
  household = h.id;
  for (const m of [alice.id, bob.id]) {
    await db.insert(householdMembers).values({ householdId: h.id, userId: m });
    await db.update(users).set({ householdId: h.id, householdEnabled: true }).where(eq(users.id, m));
  }
  await db.update(transactions).set({ householdId: h.id }).where(inArray(transactions.userId, [alice.id, bob.id]));

  server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  await db.delete(households).where(eq(households.id, household));
  await db.delete(users).where(inArray(users.id, [alice.id, bob.id].filter(Boolean)));
});

async function get(as: { token: string }, path: string) {
  const res = await fetch(`${base}${path}`, { headers: { authorization: `Bearer ${as.token}` } });
  expect(res.status).toBe(200);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (await res.json()) as any;
}

describe("aggregates respect each user's tracking start", () => {
  it("series: a January recurring income gives zeros for Jan–Mar when tracking starts in April", async () => {
    const s = await get(alice, "/api/transactions/monthly-series?from=2026-01&to=2026-06");
    expect(s.months.map((m: { income: number }) => m.income)).toEqual([0, 0, 0, 200, 200, 200]);
    expect(s.months.map((m: { expense: number }) => m.expense)).toEqual([0, 0, 0, 0, 40, 0]);
  });

  it("series, family: each member counts from their own start (created_at month as fallback)", async () => {
    const s = await get(alice, "/api/transactions/monthly-series?from=2026-01&to=2026-06&scope=family");
    expect(s.months.map((m: { income: number }) => m.income)).toEqual([0, 0, 0, 200, 200, 200]);
    expect(s.months.map((m: { expense: number }) => m.expense)).toEqual([0, 100, 100, 100, 140, 100]);
  });

  it("summary cards and cumulative balance", async () => {
    expect(await get(alice, "/api/transactions/summary-cards?year=2026&month=3")).toEqual({ balance: 0, income: 0, expenses: 0, savingsRate: 0 });
    const may = await get(alice, "/api/transactions/summary-cards?year=2026&month=5");
    expect(may).toMatchObject({ income: 200, expenses: 40, balance: 360 });
    // family: alice +360, bob −100 × Feb..May
    expect((await get(alice, "/api/transactions/balance-at-month?year=2026&month=5&scope=family")).balance).toBe(-40);
    expect((await get(alice, "/api/transactions/summary-cards?year=2026&month=3&scope=family"))).toMatchObject({ income: 0, expenses: 100 });
  });

  it("month summary leaves out one-off rows dated before the start", async () => {
    expect((await get(alice, "/api/transactions/summary?month=2026-02")).totalExpenses).toBe(0);
    expect((await get(alice, "/api/transactions/summary?month=2026-05")).totalExpenses).toBe(40);
  });

  it("household stats", async () => {
    const jan = await get(alice, `/api/households/${household}/stats/monthly?year=2026&month=1`);
    expect(jan).toMatchObject({ total_income: 0, total_expenses: 0 });
    const mar = await get(alice, `/api/households/${household}/stats/monthly?year=2026&month=3`);
    expect(mar).toMatchObject({ total_income: 0, total_expenses: 100 });
    const apr = await get(alice, `/api/households/${household}/stats/monthly?year=2026&month=4`);
    expect(apr).toMatchObject({ total_income: 200, total_expenses: 100 });
  });
});
