// Idempotency-Key on create endpoints against a real Postgres
// (npm run test:integration, see accessControl.int.test.ts).
import express from "express";
import type { AddressInfo } from "net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { users, categories, transactions, savingsGoals, savingsDeposits, idempotencyKeys } from "../db/schema";
import { signAccessToken } from "../lib/tokens";
import { errorHandler } from "../middleware/errorHandler";
import { KEY_TTL_MS } from "../middleware/idempotency";
import { runCleanup } from "../jobs/cleanup";
import transactionsRouter from "../routes/transactions";
import categoriesRouter from "../routes/categories";
import savingsRouter from "../routes/savings";

const app = express();
app.use(express.json());
app.use("/api/transactions", transactionsRouter);
app.use("/api/categories", categoriesRouter);
app.use("/api/savings", savingsRouter);
app.use(errorHandler);

const run = Date.now().toString(36);
type U = { id: string; token: string; category: string };
let alice: U, bob: U;
let base = "";
let server: ReturnType<typeof app.listen>;

async function seed(name: string): Promise<U> {
  const email = `${name}-${run}@idem.test`;
  const [u] = await db.insert(users).values({ email, name, emailVerified: true, passwordHash: "x" }).returning({ id: users.id });
  const [c] = await db.insert(categories).values({ userId: u.id, name: `Food ${name}`, type: "expense" }).returning({ id: categories.id });
  return { id: u.id, token: signAccessToken({ userId: u.id, email }), category: c.id };
}

beforeAll(async () => {
  alice = await seed("alice"); bob = await seed("bob");
  server = app.listen(0);
  await new Promise(r => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await new Promise<void>(r => server.close(() => r()));
  await db.delete(users).where(inArray(users.id, [alice.id, bob.id]));
});

async function post(as: U, path: string, body: unknown, key?: string) {
  const headers: Record<string, string> = { "content-type": "application/json", authorization: `Bearer ${as.token}` };
  if (key !== undefined) headers["idempotency-key"] = key;
  const res = await fetch(`${base}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
  return { status: res.status, replayed: res.headers.get("idempotent-replayed"), json: await res.json() as any };
}
const txBody = (u: U, description: string) => ({ type: "expense", amount: 12.5, description, date: "2026-10-05", categoryId: u.category });
const txCount = async (u: U, description: string) =>
  (await db.select({ id: transactions.id }).from(transactions).where(and(eq(transactions.userId, u.id), eq(transactions.description, description)))).length;
const newKey = () => crypto.randomUUID();

describe("POST /api/transactions with Idempotency-Key", () => {
  it("creates one row for the same key sent twice and replays the original answer", async () => {
    const key = newKey();
    const first = await post(alice, "/api/transactions", txBody(alice, `twice-${run}`), key);
    const second = await post(alice, "/api/transactions", txBody(alice, `twice-${run}`), key);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.replayed).toBe("true");
    expect(second.json).toEqual(first.json);
    expect(await txCount(alice, `twice-${run}`)).toBe(1);
  });

  it("creates one row when the same key races in parallel", async () => {
    const key = newKey();
    const results = await Promise.all(Array.from({ length: 5 }, () => post(alice, "/api/transactions", txBody(alice, `race-${run}`), key)));
    expect(await txCount(alice, `race-${run}`)).toBe(1);
    for (const r of results) expect([201, 409]).toContain(r.status);
    const created = results.filter(r => r.status === 201);
    for (const r of created) expect(r.json.data.id).toBe(created[0].json.data.id);
    // a retry after the race gets the stored answer
    const retry = await post(alice, "/api/transactions", txBody(alice, `race-${run}`), key);
    expect(retry.status).toBe(201);
    expect(retry.json.data.id).toBe(created[0].json.data.id);
  });

  it("keys are per user: another user's identical key is independent", async () => {
    const key = newKey();
    const a = await post(alice, "/api/transactions", txBody(alice, `shared-${run}`), key);
    const b = await post(bob, "/api/transactions", txBody(bob, `shared-${run}`), key);
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(b.replayed).toBeNull();
    expect(b.json.data.id).not.toBe(a.json.data.id);
    expect(await txCount(alice, `shared-${run}`)).toBe(1);
    expect(await txCount(bob, `shared-${run}`)).toBe(1);
  });

  it("without the header every request creates a row", async () => {
    await post(alice, "/api/transactions", txBody(alice, `nokey-${run}`));
    await post(alice, "/api/transactions", txBody(alice, `nokey-${run}`));
    expect(await txCount(alice, `nokey-${run}`)).toBe(2);
  });

  it("refuses the same key for a different request", async () => {
    const key = newKey();
    expect((await post(alice, "/api/transactions", txBody(alice, `a-${run}`), key)).status).toBe(201);
    const other = await post(alice, "/api/transactions", txBody(alice, `b-${run}`), key);
    expect(other).toMatchObject({ status: 422, json: { code: "IDEMPOTENCY_KEY_REUSED" } });
    expect(await txCount(alice, `b-${run}`)).toBe(0);
  });

  it("does not store a failed request, so the key can be retried", async () => {
    const key = newKey();
    const bad = await post(alice, "/api/transactions", { ...txBody(alice, `retry-${run}`), amount: -1 }, key);
    expect(bad.status).toBe(400);
    const fixed = await post(alice, "/api/transactions", { ...txBody(alice, `retry-${run}`), amount: -1 }, key);
    expect(fixed.status).toBe(400); // re-validated, not replayed
    expect(fixed.replayed).toBeNull();
    const rows = await db.select().from(idempotencyKeys).where(and(eq(idempotencyKeys.userId, alice.id), eq(idempotencyKeys.key, key)));
    expect(rows).toHaveLength(0);
  });

  it("rejects a malformed key", async () => {
    expect((await post(alice, "/api/transactions", txBody(alice, `bad-${run}`), "x y")).json.code).toBe("IDEMPOTENCY_KEY_INVALID");
    expect(await txCount(alice, `bad-${run}`)).toBe(0);
  });

  it("expired keys are ignored and removed by the nightly cleanup", async () => {
    const key = newKey();
    await post(alice, "/api/transactions", txBody(alice, `old-${run}`), key);
    const old = new Date(Date.now() - KEY_TTL_MS - 60_000);
    await db.update(idempotencyKeys).set({ createdAt: old }).where(and(eq(idempotencyKeys.userId, alice.id), eq(idempotencyKeys.key, key)));
    const again = await post(alice, "/api/transactions", txBody(alice, `old-${run}`), key);
    expect(again.replayed).toBeNull();
    expect(await txCount(alice, `old-${run}`)).toBe(2);

    const stale = newKey();
    await db.insert(idempotencyKeys).values({ userId: bob.id, key: stale, requestMethod: "POST", requestPath: "/x", requestHash: "0".repeat(64), createdAt: old });
    const removed = await runCleanup();
    expect(removed.idempotencyKeys).toBeGreaterThanOrEqual(1);
    expect(await db.select().from(idempotencyKeys).where(eq(idempotencyKeys.key, stale))).toHaveLength(0);
  });
});

describe("other creates", () => {
  it("categories, savings goals and deposits replay instead of duplicating", async () => {
    const ck = newKey();
    const c1 = await post(alice, "/api/categories", { name: `Idem ${run}`, type: "expense" }, ck);
    const c2 = await post(alice, "/api/categories", { name: `Idem ${run}`, type: "expense" }, ck);
    expect(c1.status).toBeLessThan(300);
    expect(c2.json).toEqual(c1.json);
    expect(await db.select().from(categories).where(and(eq(categories.userId, alice.id), eq(categories.name, `Idem ${run}`)))).toHaveLength(1);

    const gk = newKey();
    const g1 = await post(alice, "/api/savings", { name: `Goal ${run}`, targetAmount: 500 }, gk);
    const g2 = await post(alice, "/api/savings", { name: `Goal ${run}`, targetAmount: 500 }, gk);
    expect(g1.status).toBeLessThan(300);
    expect(g2.json).toEqual(g1.json);
    const goals = await db.select().from(savingsGoals).where(and(eq(savingsGoals.userId, alice.id), eq(savingsGoals.name, `Goal ${run}`)));
    expect(goals).toHaveLength(1);

    const dk = newKey();
    const d1 = await post(alice, `/api/savings/${goals[0].id}/deposits`, { amount: 25 }, dk);
    const d2 = await post(alice, `/api/savings/${goals[0].id}/deposits`, { amount: 25 }, dk);
    expect(d1.status).toBeLessThan(300);
    expect(d2.json).toEqual(d1.json);
    expect(await db.select().from(savingsDeposits).where(eq(savingsDeposits.goalId, goals[0].id))).toHaveLength(1);
  });
});
