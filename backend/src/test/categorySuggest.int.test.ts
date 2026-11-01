// GET /api/transactions/suggest-category against a real Postgres.
import express from "express";
import type { AddressInfo } from "net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { users, categories, categoryRules, transactions, households, householdMembers } from "../db/schema";
import { signAccessToken } from "../lib/tokens";
import { errorHandler } from "../middleware/errorHandler";
import transactionsRouter from "../routes/transactions";

const app = express();
app.use(express.json());
app.use("/api/transactions", transactionsRouter);
app.use(errorHandler);

const run = Date.now().toString(36);
type U = { id: string; token: string; food: string; work: string; salary: string };
let alice: U, bob: U;
let base = "";
let server: ReturnType<typeof app.listen>;

async function seed(name: string): Promise<U> {
  const email = `${name}-${run}@suggest.test`;
  const [u] = await db.insert(users).values({ email, name, emailVerified: true, passwordHash: "x" }).returning({ id: users.id });
  const cat = async (n: string, type: string) =>
    (await db.insert(categories).values({ userId: u.id, name: `${n} ${name}`, type }).returning({ id: categories.id }))[0].id;
  return { id: u.id, token: signAccessToken({ userId: u.id, email }), food: await cat("Food", "expense"), work: await cat("Work", "expense"), salary: await cat("Salary", "income") };
}
const tx = (u: U, description: string, categoryId: string, date: string, type = "expense") =>
  db.insert(transactions).values({ userId: u.id, categoryId, type, amount: "5", description, date });

beforeAll(async () => {
  alice = await seed("alice"); bob = await seed("bob");
  const [hh] = await db.insert(households).values({ name: "S", inviteCode: `S${run}`.slice(0, 20), createdBy: alice.id }).returning({ id: households.id });
  for (const u of [alice, bob]) {
    await db.insert(householdMembers).values({ householdId: hh.id, userId: u.id });
    await db.update(users).set({ householdId: hh.id, householdEnabled: true }).where(eq(users.id, u.id));
  }
  await tx(alice, "Obed v práci", alice.work, "2026-10-28");
  await tx(alice, "obed v praci", alice.work, "2026-10-21");
  await tx(alice, "Obed v práci", alice.food, "2025-06-01");
  await tx(alice, "Výplata", alice.salary, "2026-10-10", "income");
  // Bob, same household, uses a description Alice never did
  for (const d of ["2026-10-01", "2026-10-02", "2026-10-03"]) await tx(bob, "Kino", bob.food, d);
  await db.insert(categoryRules).values({ userId: alice.id, keyword: "lidl", categoryId: alice.food });
  await db.insert(categoryRules).values({ userId: bob.id, keyword: "kaufland", categoryId: bob.work });

  server = app.listen(0);
  await new Promise(r => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await new Promise<void>(r => server.close(() => r()));
  await db.delete(households).where(eq(households.createdBy, alice.id));
  await db.delete(users).where(inArray(users.id, [alice.id, bob.id]));
});

async function suggest(as: U | null, q: string, type?: string) {
  const params = new URLSearchParams({ q, ...(type ? { type } : {}) });
  const res = await fetch(`${base}/api/transactions/suggest-category?${params}`, { headers: as ? { authorization: `Bearer ${as.token}` } : {} });
  return { status: res.status, json: await res.json() as any };
}

describe("GET /api/transactions/suggest-category", () => {
  it("needs a login", async () => {
    expect((await suggest(null, "obed")).status).toBe(401);
  });

  it("suggests the most frequent recent category for the same description", async () => {
    expect((await suggest(alice, "  OBED V PRACI ")).json.data).toEqual({ categoryId: alice.work, source: "history", matches: 2 });
  });

  it("a rule keyword comes first", async () => {
    expect((await suggest(alice, "Platba LIDL Ružinov")).json.data).toEqual({ categoryId: alice.food, source: "rule" });
  });

  it("keeps expense and income apart", async () => {
    expect((await suggest(alice, "výplata")).json.data).toBeNull();
    expect((await suggest(alice, "výplata", "income")).json.data).toMatchObject({ categoryId: alice.salary });
  });

  it("never uses another user's history or rules, even in the same household", async () => {
    expect((await suggest(alice, "kino")).json.data).toBeNull();
    expect((await suggest(alice, "kaufland")).json.data).toBeNull();
    expect((await suggest(bob, "kino")).json.data).toMatchObject({ categoryId: bob.food });
    expect((await suggest(bob, "obed v praci")).json.data).toBeNull();
  });

  it("returns nothing for short text and rejects bad input", async () => {
    expect((await suggest(alice, "o")).json).toEqual({ data: null });
    expect((await suggest(alice, "obed", "other")).status).toBe(400);
    expect((await suggest(alice, "x".repeat(501))).status).toBe(400);
  });
});
