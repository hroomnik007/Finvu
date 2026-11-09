// Household search member filter and activity categories against a real
// Postgres. Run with `npm run test:integration` (needs DATABASE_URL pointing at a
// throw-away database built by `npm run db:setup`).
import express from "express";
import type { AddressInfo } from "net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { users, households, householdMembers, categories, transactions } from "../db/schema";
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
type U = { id: string; token: string };
let me: U, partner: U, outsider: U;
let householdId = 0;
let base = "";
let server: ReturnType<typeof app.listen>;

async function seedUser(name: string): Promise<U> {
  const email = `${name}-${run}@member.test`;
  const [u] = await db.insert(users).values({ email, name, emailVerified: true, passwordHash: "x" }).returning({ id: users.id });
  return { id: u.id, token: signAccessToken({ userId: u.id, email }) };
}

async function get(as: U, path: string) {
  const res = await fetch(`${base}${path}`, { headers: { authorization: `Bearer ${as.token}` } });
  const text = await res.text();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { status: res.status, text, json: (text ? JSON.parse(text) : null) as any };
}

const descs = (rows: Array<{ description: string }>) => rows.map((r) => r.description).sort();

beforeAll(async () => {
  me = await seedUser("me");
  partner = await seedUser("partner");
  outsider = await seedUser("outsider");
  const [h] = await db.insert(households).values({ name: "Home", inviteCode: `M${run}`.slice(0, 20), createdBy: me.id }).returning({ id: households.id });
  householdId = h.id;
  for (const u of [me, partner]) {
    await db.insert(householdMembers).values({ householdId: h.id, userId: u.id });
    await db.update(users).set({ householdId: h.id, householdEnabled: true }).where(eq(users.id, u.id));
  }
  const [shop] = await db.insert(categories).values({ userId: partner.id, name: "Nákupy", type: "expense" }).returning({ id: categories.id });
  const row = { type: "expense" as const, amount: "10.00", date: "2026-03-10" };
  await db.insert(transactions).values([
    { ...row, userId: me.id, createdBy: me.id, householdId: h.id, description: "mine srch" },
    { ...row, userId: partner.id, createdBy: partner.id, householdId: h.id, categoryId: shop.id, description: "partner srch" },
    { ...row, userId: outsider.id, createdBy: outsider.id, description: "outsider srch" },
  ]);

  server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  const userIds = [me, partner, outsider].filter(Boolean).map((u) => u.id);
  if (userIds.length) {
    await db.delete(transactions).where(inArray(transactions.userId, userIds));
    await db.delete(households).where(inArray(households.createdBy, userIds));
    await db.delete(users).where(inArray(users.id, userIds));
  }
});

describe("family search member filter", () => {
  const q = "/api/transactions?scope=family&q=srch&limit=50";

  it("without a member lists every sharing member's rows (unchanged)", async () => {
    const res = await get(me, q);
    expect(res.status).toBe(200);
    expect(descs(res.json.data)).toEqual(["mine srch", "partner srch"]);
    expect(res.json.total).toBe(2);
  });

  it("narrows to one member, with userId on each row", async () => {
    const mine = await get(me, `${q}&member=${me.id}`);
    expect(descs(mine.json.data)).toEqual(["mine srch"]);
    expect(mine.json.total).toBe(1);
    const theirs = await get(me, `${q}&member=${partner.id}`);
    expect(descs(theirs.json.data)).toEqual(["partner srch"]);
    expect(theirs.json.data[0].userId).toBe(partner.id);
  });

  it("can't reach anyone outside the household", async () => {
    const res = await get(me, `${q}&member=${outsider.id}`);
    expect(res.status).toBe(200);
    expect(res.json.data).toEqual([]);
    expect(res.json.total).toBe(0);
    // Personal scope stays limited to the caller as well
    expect((await get(me, `/api/transactions?q=srch&member=${partner.id}`)).json.total).toBe(0);
  });

  it("rejects a malformed member id", async () => {
    expect((await get(me, `${q}&member=nope`)).status).toBe(400);
  });
});

describe("household activity", () => {
  it("includes the category name (null when uncategorized)", async () => {
    const res = await get(me, `/api/households/${householdId}/activity?year=2026&month=3&limit=50`);
    expect(res.status).toBe(200);
    const byDesc = Object.fromEntries(res.json.map((a: { description: string; category_name: string | null }) => [a.description, a.category_name]));
    expect(byDesc).toEqual({ "mine srch": null, "partner srch": "Nákupy" });
  });

  it("stays closed to non-members", async () => {
    expect((await get(outsider, `/api/households/${householdId}/activity?year=2026&month=3`)).status).toBe(403);
  });
});
