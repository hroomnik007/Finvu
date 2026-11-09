// Shared category limit with fixed expenses against a real Postgres: the limit is
// the household's fixed expenses plus one common reserve, which any sharing member
// can set (and lower). Run with `npm run test:integration` (needs DATABASE_URL
// pointing at a throw-away database built by `npm run db:setup`).
import express from "express";
import type { AddressInfo } from "net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { users, households, householdMembers, categories, transactions } from "../db/schema";
import { signAccessToken } from "../lib/tokens";
import { errorHandler } from "../middleware/errorHandler";
import categoriesRouter from "../routes/categories";

const app = express();
app.use(express.json());
app.use("/api/categories", categoriesRouter);
app.use(errorHandler);

const run = Date.now().toString(36);
type U = { id: string; token: string };
let me: U, partner: U;
let base = "";
let server: ReturnType<typeof app.listen>;
const ids: Record<string, string> = {};

async function seedUser(name: string): Promise<U> {
  const email = `${name}-${run}@reserve.test`;
  const [u] = await db.insert(users).values({ email, name, emailVerified: true, passwordHash: "x" }).returning({ id: users.id });
  return { id: u.id, token: signAccessToken({ userId: u.id, email }) };
}

async function call(as: U, method: string, path: string, body?: unknown) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { "content-type": "application/json", authorization: `Bearer ${as.token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { status: res.status, text, json: (text ? JSON.parse(text) : null) as any };
}

const copies = (name: string) =>
  db.select().from(categories).where(and(inArray(categories.userId, [me.id, partner.id]), eq(categories.name, name)));

beforeAll(async () => {
  me = await seedUser("me");
  partner = await seedUser("partner");
  const [h] = await db.insert(households).values({ name: "Home", inviteCode: `R${run}`.slice(0, 20), createdBy: me.id }).returning({ id: households.id });
  for (const u of [me, partner]) {
    await db.insert(householdMembers).values({ householdId: h.id, userId: u.id });
    await db.update(users).set({ householdId: h.id, householdEnabled: true }).where(eq(users.id, u.id));
  }
  const [mine] = await db.insert(categories).values({ userId: me.id, name: "Telekomunikácie", type: "expense" }).returning({ id: categories.id });
  const [theirs] = await db.insert(categories).values({ userId: partner.id, name: "Telekomunikácie", type: "expense" }).returning({ id: categories.id });
  const [food] = await db.insert(categories).values({ userId: me.id, name: "Jedlo", type: "expense" }).returning({ id: categories.id });
  const [own] = await db.insert(categories).values({ userId: me.id, name: "Hobby", type: "expense" }).returning({ id: categories.id });
  ids.mine = mine.id; ids.theirs = theirs.id; ids.food = food.id; ids.own = own.id;
  // Only the partner has a fixed expense in the category
  await db.insert(transactions).values({
    userId: partner.id, createdBy: partner.id, categoryId: theirs.id, householdId: h.id,
    type: "expense", amount: "37.00", description: "Telekom", date: "2026-07-03", isFixed: true,
  });

  server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  expect((await call(me, "POST", "/api/categories/share", { ids: [ids.mine, ids.food], shared: true })).status).toBe(200);
});

afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  const userIds = [me, partner].filter(Boolean).map((u) => u.id);
  if (userIds.length) {
    await db.delete(transactions).where(inArray(transactions.userId, userIds));
    await db.delete(households).where(inArray(households.createdBy, userIds));
    await db.delete(users).where(inArray(users.id, userIds));
  }
});

describe("shared category with a member's fixed expenses", () => {
  it("tells the client the household's fixed total (and nothing more) for the category", async () => {
    const list = await call(me, "GET", "/api/categories");
    expect(list.status).toBe(200);
    const tel = list.json.data.find((c: { id: string }) => c.id === ids.mine);
    expect(tel).toMatchObject({ shared: true, budgetLimit: 37, sharedFixedTotal: 37, sharedReserve: 0, hasFixedExpenses: false });
    expect(list.text).not.toContain("Telekom\""); // the partner's transaction itself isn't exposed
  });

  it("the common reserve set by one member raises everyone's limit to fixed + reserve", async () => {
    const res = await call(me, "PUT", `/api/categories/${ids.mine}`, { autoLimit: false, limitReserve: 23 });
    expect(res.status).toBe(200);
    expect(res.json.data).toMatchObject({ budgetLimit: 60, limitReserve: 23, sharedFixedTotal: 37, sharedReserve: 23 });
    const rows = await copies("Telekomunikácie");
    expect(rows.map((r) => [Number(r.budgetLimit), Number(r.limitReserve)])).toEqual([[60, 23], [60, 23]]);
  });

  it("lowering the reserve (from the other member) lowers the limit for both", async () => {
    const res = await call(partner, "PUT", `/api/categories/${ids.theirs}`, { limitReserve: 10 });
    expect(res.status).toBe(200);
    expect(res.json.data).toMatchObject({ budgetLimit: 47, sharedReserve: 10 });
    const rows = await copies("Telekomunikácie");
    expect(rows.map((r) => Number(r.budgetLimit))).toEqual([47, 47]);
    expect((await call(me, "PUT", `/api/categories/${ids.mine}`, { limitReserve: 0 })).json.data.budgetLimit).toBe(37);
  });

  it("a typed limit still doesn't override the fixed expenses", async () => {
    await call(me, "PUT", `/api/categories/${ids.mine}`, { limitReserve: 5 });
    const res = await call(me, "PUT", `/api/categories/${ids.mine}`, { budgetLimit: 500 });
    expect(res.json.data.budgetLimit).toBe(42);
  });

  it("keeps the guards: no auto limit on a shared category, no editing another member's copy", async () => {
    expect((await call(me, "PUT", `/api/categories/${ids.mine}`, { autoLimit: true })).status).toBe(400);
    expect((await call(me, "PUT", `/api/categories/${ids.theirs}`, { limitReserve: 99 })).status).toBe(403);
  });
});

describe("other categories are unchanged", () => {
  it("a shared variable-only category keeps the typed common limit", async () => {
    const res = await call(me, "PUT", `/api/categories/${ids.food}`, { budgetLimit: 300 });
    expect(res.json.data).toMatchObject({ budgetLimit: 300, sharedFixedTotal: 0 });
    expect((await copies("Jedlo")).map((r) => Number(r.budgetLimit))).toEqual([300, 300]);
  });

  it("a non-shared category has no household info and keeps its own limit", async () => {
    const res = await call(me, "PUT", `/api/categories/${ids.own}`, { budgetLimit: 80 });
    expect(res.json.data.budgetLimit).toBe(80);
    expect(res.json.data).not.toHaveProperty("sharedFixedTotal");
  });
});
