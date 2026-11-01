// Backup and restore against a real Postgres: the export holds only the
// caller's own data and no secrets, and export -> encrypt -> decrypt -> restore
// into a fresh account gives back the same data. Run with `npm run test:integration`.
import express from "express";
import type { AddressInfo } from "net";
import path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asc, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import {
  users, households, householdMembers, categories, categoryRules, transactions,
  savingsGoals, savingsDeposits, userSessions, pinDeviceTokens, webauthnCredentials, subscriptionDismissals,
} from "../db/schema";
import { signAccessToken } from "../lib/tokens";
import { errorHandler } from "../middleware/errorHandler";
import backupRouter from "../routes/backup";

// The browser-side encryption, used as is (the frontend has no build step for tests)
type Crypto = {
  encryptBackup(b: unknown, pw: string): Promise<string>;
  decryptBackup(f: string, pw?: string): Promise<unknown>;
};
const cryptoPath = path.resolve(__dirname, "../../../finance-tracker/src/utils/backupCrypto.ts");

const app = express();
app.use(express.json({ limit: "25mb" }));
app.use("/api/backup", backupRouter);
app.use(errorHandler);

const run = Date.now().toString(36);
let base = "";
let server: ReturnType<typeof app.listen>;
type U = { id: string; token: string; email: string };
let alice: U, bob: U, dave: U, erin: U, frank: U, gina: U;

async function makeUser(name: string): Promise<U> {
  const email = `${name}-${run}@backup.test`;
  const [u] = await db.insert(users).values({ email, name, emailVerified: true, passwordHash: `$argon2-${name}-hash` }).returning({ id: users.id });
  return { id: u.id, email, token: signAccessToken({ userId: u.id, email }) };
}

async function seedRich(u: U, tag: string) {
  await db.update(users).set({ theme: "light", language: "cs", trackingStartDate: "2026-01-01", currencyFormat: "en", defaultPage: "variable", savingsEnabled: true }).where(eq(users.id, u.id));
  const [food, rent, salary] = await db.insert(categories).values([
    { userId: u.id, name: `Jedlo ${tag}`, type: "expense", color: "#ff0000", icon: "🍔", budgetLimit: "300.00", sortOrder: 1 },
    { userId: u.id, name: `Bývanie ${tag}`, type: "expense", autoLimit: true, limitReserve: "20.00", shared: true },
    { userId: u.id, name: `Výplata ${tag}`, type: "income" },
  ]).returning({ id: categories.id });
  await db.insert(categoryRules).values([
    { userId: u.id, keyword: `lidl${tag}`, categoryId: food.id },
    { userId: u.id, keyword: `nájom${tag}`, categoryId: rent.id },
  ]);
  await db.insert(transactions).values([
    { userId: u.id, createdBy: u.id, categoryId: food.id, type: "expense", amount: "12.50", description: `Lidl ${tag}`, date: "2026-03-04" },
    { userId: u.id, createdBy: u.id, categoryId: food.id, type: "expense", amount: "7.30", description: `Billa ${tag}`, date: "2026-03-09" },
    { userId: u.id, createdBy: u.id, categoryId: null, type: "expense", amount: "3.00", description: null, date: "2026-04-01" },
    { userId: u.id, createdBy: u.id, categoryId: salary.id, type: "income", amount: "2100.00", description: `Plat ${tag}`, date: "2026-03-15" },
    // a fixed series with a price change from May, ended in September
    { userId: u.id, createdBy: u.id, categoryId: rent.id, type: "expense", amount: "500.00", description: `Nájom ${tag}`, date: "2026-01-01", isFixed: true, endedOn: "2026-09-01" },
    { userId: u.id, createdBy: u.id, categoryId: rent.id, type: "expense", amount: "550.00", description: `Nájom ${tag}`, date: "2026-05-01", isFixed: true, endedOn: "2026-09-01" },
    { userId: u.id, createdBy: u.id, categoryId: salary.id, type: "income", amount: "2000.00", description: `Plat fix ${tag}`, date: "2026-01-10", isFixed: true },
  ]);
  const [goal] = await db.insert(savingsGoals).values({ userId: u.id, name: `Auto ${tag}`, targetAmount: "8000", savedAmount: "150", deadline: "2027-06-30", note: "pozn" }).returning({ id: savingsGoals.id });
  await db.insert(savingsGoals).values({ userId: u.id, name: `Dovolenka ${tag}`, targetAmount: "1200", savedAmount: "0", paused: true });
  await db.insert(savingsDeposits).values([
    { goalId: goal.id, userId: u.id, amount: "100", createdAt: new Date("2026-02-01T10:00:00Z") },
    { goalId: goal.id, userId: u.id, amount: "50", createdAt: new Date("2026-03-01T10:00:00Z") },
  ]);
  // hidden subscription suggestions
  await db.insert(subscriptionDismissals).values([
    { userId: u.id, patternKey: `netflix ${tag.toLowerCase()}` },
    { userId: u.id, patternKey: `spotify ${tag.toLowerCase()}` },
  ]);
  // secrets that must never end up in a backup
  await db.insert(userSessions).values({ userId: u.id, deviceName: `phone-${tag}` });
  await db.insert(pinDeviceTokens).values({ userId: u.id, tokenHash: `pinhash-${tag}`, expiresAt: new Date(Date.now() + 86400000) });
  await db.insert(webauthnCredentials).values({ userId: u.id, credentialId: `cred-${tag}-${run}`, publicKey: `pubkey-${tag}` });
}

// Everything a backup should carry, independent of ids
async function aggregates(userId: string) {
  const cats = await db.select().from(categories).where(eq(categories.userId, userId));
  const catName = new Map(cats.map(c => [c.id, `${c.type}:${c.name}`]));
  const txs = await db.select().from(transactions).where(eq(transactions.userId, userId));
  const rules = await db.select().from(categoryRules).where(eq(categoryRules.userId, userId));
  const goals = await db.select().from(savingsGoals).where(eq(savingsGoals.userId, userId)).orderBy(asc(savingsGoals.name));
  const deps = await db.select().from(savingsDeposits).where(eq(savingsDeposits.userId, userId));
  const goalName = new Map(goals.map(g => [g.id, g.name]));
  const hidden = await db.select({ k: subscriptionDismissals.patternKey }).from(subscriptionDismissals).where(eq(subscriptionDismissals.userId, userId));
  const [s] = await db.select({ theme: users.theme, language: users.language, trackingStartDate: users.trackingStartDate, currencyFormat: users.currencyFormat, defaultPage: users.defaultPage, savingsEnabled: users.savingsEnabled }).from(users).where(eq(users.id, userId));
  const sum = (rows: { amount: string }[]) => rows.reduce((a, r) => a + Math.round(Number(r.amount) * 100), 0);
  return {
    settings: s,
    categories: cats.map(c => [c.type, c.name, c.color, c.icon, c.budgetLimit, c.autoLimit, c.limitReserve, c.shared, c.sortOrder].join("|")).sort(),
    rules: rules.map(r => `${r.keyword}->${catName.get(r.categoryId)}`).sort(),
    txCount: txs.length,
    expenseCents: sum(txs.filter(t => t.type === "expense")),
    incomeCents: sum(txs.filter(t => t.type === "income")),
    rows: txs.map(t => [t.date, t.type, t.amount, t.description, t.isFixed, t.endedOn, t.categoryId ? catName.get(t.categoryId) : null].join("|")).sort(),
    goals: goals.map(g => [g.name, g.targetAmount, g.savedAmount, g.deadline, g.note, g.paused].join("|")),
    deposits: deps.map(d => `${goalName.get(d.goalId)}|${d.amount}|${d.createdAt.toISOString()}`).sort(),
    dismissals: hidden.map(h => h.k).sort(),
  };
}

const get = (token?: string) => fetch(`${base}/api/backup`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
const restore = (token: string | undefined, body: unknown) => fetch(`${base}/api/backup/restore`, {
  method: "POST",
  headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  body: JSON.stringify(body),
});

beforeAll(async () => {
  alice = await makeUser("alice");
  bob = await makeUser("bob");
  dave = await makeUser("dave");
  erin = await makeUser("erin");
  frank = await makeUser("frank");
  gina = await makeUser("gina");
  await seedRich(alice, "A");
  await seedRich(bob, "B");
  // alice and bob share a household: bob's rows are visible to alice in the app, but are not hers to back up
  const [h] = await db.insert(households).values({ name: "Home", inviteCode: `B${run}`.slice(0, 20), createdBy: alice.id }).returning({ id: households.id });
  for (const m of [alice.id, bob.id]) {
    await db.insert(householdMembers).values({ householdId: h.id, userId: m });
    await db.update(users).set({ householdId: h.id, householdEnabled: true }).where(eq(users.id, m));
  }
  await db.update(transactions).set({ householdId: h.id }).where(inArray(transactions.userId, [alice.id, bob.id]));
  await new Promise<void>(resolve => { server = app.listen(0, () => resolve()) });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  server?.close();
  const ids = [alice, bob, dave, erin, frank, gina].filter(Boolean).map(u => u.id);
  await db.update(users).set({ householdId: null }).where(inArray(users.id, ids));
  await db.delete(households).where(inArray(households.createdBy, ids));
  await db.delete(users).where(inArray(users.id, ids));
});

describe("backup access control", () => {
  it("needs a login", async () => {
    expect((await get()).status).toBe(401);
    expect((await restore(undefined, {})).status).toBe(401);
    expect((await get("not-a-token")).status).toBe(401);
  });

  it("exports only the caller's own data and no secrets", async () => {
    const res = await get(alice.token);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const text = await res.text();
    const b = JSON.parse(text);
    expect(b.format).toBe("finvu-backup");
    expect(b.version).toBe(1);
    expect(b.data.transactions).toHaveLength(7);
    expect(b.data.categories).toHaveLength(3);
    expect(b.data.savingsDeposits).toHaveLength(2);
    // nothing of bob's, even though he shares alice's household
    for (const s of [" B", "lidlB", "Auto B", bob.id, bob.email]) expect(text).not.toContain(s);
    // no credentials, sessions, tokens, passkeys or ids that tie it to the account
    for (const s of ["argon2", "pinhash", "pubkey", "cred-", "phone-", "passwordHash", "householdId", "userId", "email", alice.id]) {
      expect(text).not.toContain(s);
    }
  });

  it("a restore only ever writes into the caller's account", async () => {
    const before = { alice: await aggregates(alice.id), bob: await aggregates(bob.id) };
    const backup = await (await get(alice.token)).json();
    const res = await restore(erin.token, { mode: "replace", backup });
    expect(res.status).toBe(200);
    expect(await aggregates(alice.id)).toEqual(before.alice);
    expect(await aggregates(bob.id)).toEqual(before.bob);
    // erin has no household, so nothing restored joins alice's
    const rows = await db.select({ h: transactions.householdId }).from(transactions).where(eq(transactions.userId, erin.id));
    expect(rows.every(r => r.h === null)).toBe(true);
  });

  it("rejects malformed backups", async () => {
    const backup = await (await get(alice.token)).json();
    let res = await restore(frank.token, { mode: "wipe", backup });
    expect(res.status).toBe(400);
    res = await restore(frank.token, { mode: "merge", backup: { ...backup, version: 2 } });
    expect(res.status).toBe(400);
    const bad = structuredClone(backup);
    bad.data.transactions[0].amount = "12,50; DROP TABLE";
    res = await restore(frank.token, { mode: "merge", backup: bad });
    expect(res.status).toBe(400);
    expect((await aggregates(frank.id)).txCount).toBe(0);
  });
});

describe("backup round trip", () => {
  it("export -> encrypt -> decrypt -> restore into a fresh account gives the same data", async () => {
    const { encryptBackup, decryptBackup } = (await import(cryptoPath)) as Crypto;
    const exported = await (await get(alice.token)).json();
    const file = await encryptBackup(exported, "heslo na zálohu");
    expect(file).not.toContain("Lidl");
    const decrypted = await decryptBackup(file, "heslo na zálohu");

    const res = await restore(dave.token, { mode: "replace", backup: decrypted });
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data).toEqual({ categories: 3, categoryRules: 2, transactions: 7, savingsGoals: 2, savingsDeposits: 2, subscriptionDismissals: 2, skippedTransactions: 0 });

    const a = await aggregates(alice.id);
    const d = await aggregates(dave.id);
    expect(d).toEqual(a);
    expect(d.expenseCents).toBe(1250 + 730 + 300 + 50000 + 55000);
    expect(d.dismissals).toEqual(["netflix a", "spotify a"]);
    expect(d.settings).toEqual({ theme: "light", language: "cs", trackingStartDate: "2026-01-01", currencyFormat: "en", defaultPage: "variable", savingsEnabled: true });
  }, 30_000);

  it("merge skips what is already there", async () => {
    const before = await aggregates(dave.id);
    const backup = await (await get(alice.token)).json();
    const res = await restore(dave.token, { mode: "merge", backup });
    expect((await res.json()).data).toEqual({ categories: 0, categoryRules: 0, transactions: 0, savingsGoals: 0, savingsDeposits: 0, subscriptionDismissals: 0, skippedTransactions: 7 });
    expect(await aggregates(dave.id)).toEqual(before);
  });

  it("merge adds new rows and keeps the current settings", async () => {
    await db.update(users).set({ theme: "dark" }).where(eq(users.id, dave.id));
    const backup = await (await get(alice.token)).json();
    backup.data.transactions.push({ categoryId: backup.data.categories[0].id, type: "expense", amount: "4.20", description: "Káva", date: "2026-06-02", isFixed: false, endedOn: null });
    const res = await restore(dave.token, { mode: "merge", backup });
    expect((await res.json()).data).toMatchObject({ transactions: 1, skippedTransactions: 7 });
    const d = await aggregates(dave.id);
    expect(d.txCount).toBe(8);
    expect(d.rows).toContain("2026-06-02|expense|4.20|Káva|false||expense:Jedlo A");
    expect(d.settings?.theme).toBe("dark");
  });

  it("replace wipes the account's data first", async () => {
    const backup = await (await get(alice.token)).json();
    const res = await restore(dave.token, { mode: "replace", backup });
    expect(res.status).toBe(200);
    expect(await aggregates(dave.id)).toEqual(await aggregates(alice.id));
  });

  it("carries hidden subscription suggestions, and older files without them still restore", async () => {
    await db.insert(subscriptionDismissals).values({ userId: gina.id, patternKey: "stara appka" });
    const backup = await (await get(alice.token)).json();
    expect(backup.data.subscriptionDismissals).toEqual(["netflix a", "spotify a"]);
    // merge keeps what gina already hid and adds alice's
    let res = await restore(gina.token, { mode: "merge", backup });
    expect((await res.json()).data).toMatchObject({ subscriptionDismissals: 2 });
    expect((await aggregates(gina.id)).dismissals).toEqual(["netflix a", "spotify a", "stara appka"]);
    // a file made before dismissals were backed up: replace clears them, nothing else breaks
    const { subscriptionDismissals: _omit, ...oldData } = backup.data;
    res = await restore(gina.token, { mode: "replace", backup: { ...backup, data: oldData } });
    expect(res.status).toBe(200);
    expect((await res.json()).data).toMatchObject({ transactions: 7, subscriptionDismissals: 0 });
    expect((await aggregates(gina.id)).dismissals).toEqual([]);
  });

  it("is rate limited", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) statuses.push((await restore(bob.token, { mode: "merge" })).status);
    expect(statuses.slice(0, 5).every(s => s === 400)).toBe(true);
    expect(statuses[5]).toBe(429);
  });
});
