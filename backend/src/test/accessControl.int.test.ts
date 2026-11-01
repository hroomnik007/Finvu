// Access control against a real Postgres: one user must not be able to read,
// change or delete another user's data, and household data stays inside the
// household. Run with `npm run test:integration` (needs DATABASE_URL pointing at
// a throw-away database built by `npm run db:setup`).
import express from "express";
import cookieParser from "cookie-parser";
import type { AddressInfo } from "net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "../db";
import {
  users, households, householdMembers, categories, categoryRules, transactions,
  savingsGoals, savingsDeposits, userSessions, pinDeviceTokens, webauthnCredentials,
} from "../db/schema";
import { signAccessToken } from "../lib/tokens";
import { ORIGIN, RP_ID } from "../lib/webauthnChallenges";
import { softPasskey } from "./softAuthenticator";
import { authenticateToken } from "../middleware/authenticate";
import { errorHandler } from "../middleware/errorHandler";
import authRouter from "../routes/auth";
import transactionsRouter from "../routes/transactions";
import categoriesRouter from "../routes/categories";
import categoryRulesRouter from "../routes/categoryRules";
import adminRouter from "../routes/admin";
import householdsRouter from "../routes/households";
import savingsRouter from "../routes/savings";
import notificationsRouter from "../routes/notifications";
import achievementsRouter from "../routes/achievements";

// Same mounting as src/index.ts (which can't be imported: it starts listening and the cron jobs)
const app = express();
app.use(express.json());
app.use(cookieParser());
app.use("/api/auth", authRouter);
app.use("/api/transactions", transactionsRouter);
app.use("/api/categories", categoriesRouter);
app.use("/api/category-rules", categoryRulesRouter);
app.use("/api/admin", adminRouter);
app.use("/api/households", authenticateToken, householdsRouter);
app.use("/api/savings", savingsRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/achievements", achievementsRouter);
app.use(errorHandler);

const run = Date.now().toString(36);
const MONTH = "2026-03";

type Ids = {
  user: string; token: string; household: number;
  category: string; tx: string; fixedTx: string; goal: string; deposit: string;
  rule: string; session: string; pinDevice: string; passkey: string;
};
// alice owns household 1, bob is a member of it, carol owns household 2
let alice: Ids, bob: Ids, carol: Ids;
let base = "";
let server: ReturnType<typeof app.listen>;

async function seedUser(name: string): Promise<Omit<Ids, "household">> {
  const email = `${name}-${run}@access.test`;
  const [u] = await db.insert(users).values({ email, name, emailVerified: true, passwordHash: "x" }).returning({ id: users.id });
  const [cat] = await db.insert(categories).values({ userId: u.id, name: `Food ${name}`, type: "expense" }).returning({ id: categories.id });
  const [tx] = await db.insert(transactions).values({
    userId: u.id, createdBy: u.id, categoryId: cat.id, type: "expense", amount: "11.00", description: `secret ${name}`, date: `${MONTH}-10`,
  }).returning({ id: transactions.id });
  const [fixedTx] = await db.insert(transactions).values({
    userId: u.id, createdBy: u.id, categoryId: cat.id, type: "expense", amount: "500.00", description: `rent ${name}`, date: `${MONTH}-01`, isFixed: true,
  }).returning({ id: transactions.id });
  const [goal] = await db.insert(savingsGoals).values({ userId: u.id, name: `Car ${name}`, targetAmount: "1000", savedAmount: "50" }).returning({ id: savingsGoals.id });
  const [deposit] = await db.insert(savingsDeposits).values({ goalId: goal.id, userId: u.id, amount: "50" }).returning({ id: savingsDeposits.id });
  const [rule] = await db.insert(categoryRules).values({ userId: u.id, keyword: `shop${name}`, categoryId: cat.id }).returning({ id: categoryRules.id });
  const [session] = await db.insert(userSessions).values({ userId: u.id, deviceName: "test" }).returning({ id: userSessions.id });
  const [pinDevice] = await db.insert(pinDeviceTokens).values({ userId: u.id, tokenHash: "x", expiresAt: new Date(Date.now() + 86400000) }).returning({ id: pinDeviceTokens.id });
  const [passkey] = await db.insert(webauthnCredentials).values({ userId: u.id, credentialId: `cred-${name}-${run}`, publicKey: "x" }).returning({ id: webauthnCredentials.id });
  return {
    user: u.id, token: signAccessToken({ userId: u.id, email }), category: cat.id, tx: tx.id, fixedTx: fixedTx.id,
    goal: goal.id, deposit: deposit.id, rule: rule.id, session: session.id, pinDevice: pinDevice.id, passkey: passkey.id,
  };
}

async function seedHousehold(owner: string, members: string[]): Promise<number> {
  const [h] = await db.insert(households).values({ name: "Home", inviteCode: `T${run}${owner.slice(0, 4)}`.slice(0, 20), createdBy: owner }).returning({ id: households.id });
  for (const m of [owner, ...members]) {
    await db.insert(householdMembers).values({ householdId: h.id, userId: m });
    await db.update(users).set({ householdId: h.id, householdEnabled: true }).where(eq(users.id, m));
  }
  await db.update(transactions).set({ householdId: h.id }).where(inArray(transactions.userId, [owner, ...members]));
  return h.id;
}

beforeAll(async () => {
  const a = await seedUser("alice"), b = await seedUser("bob"), c = await seedUser("carol");
  const h1 = await seedHousehold(a.user, [b.user]);
  const h2 = await seedHousehold(c.user, []);
  alice = { ...a, household: h1 }; bob = { ...b, household: h1 }; carol = { ...c, household: h2 };

  server = app.listen(0);
  await new Promise(r => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>(r => server.close(() => r()));
  const ids = [alice, bob, carol].filter(Boolean).map(u => u.user);
  if (ids.length) {
    await db.delete(households).where(inArray(households.createdBy, ids));
    await db.delete(users).where(inArray(users.id, ids));
  }
});

async function call(as: Ids | null, method: string, path: string, body?: unknown) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (as) headers.authorization = `Bearer ${as.token}`;
  const res = await fetch(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  return { status: res.status, text, json: (text ? JSON.parse(text) : null) as any };
}

const row = async <T>(q: Promise<T[]>) => (await q)[0];
const txRow = (id: string) => row(db.select().from(transactions).where(eq(transactions.id, id)));
const catRow = (id: string) => row(db.select().from(categories).where(eq(categories.id, id)));
const goalRow = (id: string) => row(db.select().from(savingsGoals).where(eq(savingsGoals.id, id)));

describe("unauthenticated requests", () => {
  const protectedRoutes: [string, string][] = [
    ["GET", "/api/transactions"], ["POST", "/api/transactions"], ["GET", "/api/transactions/suggest-category?q=obed"], ["PUT", "/api/transactions/00000000-0000-0000-0000-000000000000"],
    ["DELETE", "/api/transactions/00000000-0000-0000-0000-000000000000"], ["GET", `/api/transactions/summary?month=${MONTH}`],
    ["GET", "/api/categories"], ["DELETE", "/api/categories"], ["GET", "/api/category-rules"],
    ["GET", "/api/savings"], ["GET", "/api/households/me"], ["GET", "/api/households/1/members"],
    ["GET", "/api/notifications/feed"], ["GET", "/api/achievements"],
    ["GET", "/api/auth/me"], ["GET", "/api/auth/sessions"], ["DELETE", "/api/auth/account"],
  ];

  it.each(protectedRoutes)("%s %s without a token is 401", async (method, path) => {
    expect((await call(null, method, path)).status).toBe(401);
  });

  it("rejects a forged token, a token of a deleted user and a deactivated account", async () => {
    const forged = { ...carol, token: carol.token.slice(0, -4) + "AAAA" };
    expect((await call(forged, "GET", "/api/transactions")).status).toBe(401);
    const ghost = { ...carol, token: signAccessToken({ userId: "00000000-0000-0000-0000-000000000000", email: "ghost@access.test" }) };
    expect((await call(ghost, "GET", "/api/transactions")).status).toBe(401);

    await db.update(users).set({ isDeactivated: true }).where(eq(users.id, carol.user));
    try {
      const r = await call(carol, "GET", "/api/transactions");
      expect(r.status).toBe(401);
      expect(r.json.code).toBe("ACCOUNT_DEACTIVATED");
    } finally {
      await db.update(users).set({ isDeactivated: false }).where(eq(users.id, carol.user));
    }
  });

  it("a user token is not an admin token", async () => {
    const r = await call(carol, "GET", "/api/admin/stats");
    expect([401, 403]).toContain(r.status);
  });
});

describe("transactions of another user", () => {
  it("are not listed, summed or searchable, personal or family scope", async () => {
    for (const scope of ["personal", "family"]) {
      const list = await call(carol, "GET", `/api/transactions?month=${MONTH}&scope=${scope}&limit=200`);
      expect(list.status).toBe(200);
      expect(list.json.data.map((t: { userId: string }) => t.userId)).toEqual(expect.arrayContaining([carol.user]));
      expect(list.json.data.every((t: { userId: string }) => t.userId === carol.user)).toBe(true);
    }
    const search = await call(carol, "GET", `/api/transactions?q=secret&limit=200`);
    expect(search.text).not.toContain("secret alice");
  });

  it("can't be changed, deleted, repriced or ended", async () => {
    expect((await call(carol, "PUT", `/api/transactions/${alice.tx}`, { amount: 1 })).status).toBe(403);
    expect((await call(carol, "DELETE", `/api/transactions/${alice.tx}`)).status).toBe(403);
    expect((await call(carol, "POST", `/api/transactions/${alice.fixedTx}/price-change`, { amount: 1, from: MONTH })).status).toBe(403);
    expect((await call(carol, "POST", `/api/transactions/${alice.fixedTx}/end`, { lastMonth: MONTH })).status).toBe(403);
    await call(carol, "PATCH", "/api/transactions/bulk", { ids: [alice.tx], categoryId: carol.category });
    await call(carol, "POST", "/api/transactions/bulk-delete", { ids: [alice.tx] });

    const tx = await txRow(alice.tx);
    expect(tx).toMatchObject({ amount: "11.00", categoryId: alice.category });
    expect(await txRow(alice.fixedTx)).toMatchObject({ amount: "500.00", endedOn: null });
  });

  it("household members see each other's rows in family scope but can't edit them", async () => {
    const list = await call(bob, "GET", `/api/transactions?month=${MONTH}&scope=family&limit=200`);
    expect(list.json.data.map((t: { id: string }) => t.id)).toEqual(expect.arrayContaining([alice.tx, bob.tx]));
    expect(list.json.data.map((t: { id: string }) => t.id)).not.toContain(carol.tx);

    expect((await call(bob, "PUT", `/api/transactions/${alice.tx}`, { amount: 1 })).status).toBe(403);
    expect((await call(bob, "DELETE", `/api/transactions/${alice.tx}`)).status).toBe(403);
    expect((await call(bob, "POST", `/api/transactions/${alice.fixedTx}/end`, { lastMonth: MONTH })).status).toBe(403);
    await call(bob, "POST", "/api/transactions/bulk-delete", { ids: [alice.tx] });
    expect(await txRow(alice.tx)).toMatchObject({ amount: "11.00" });
  });

  it("someone else's category can't be attached to your transaction", async () => {
    const one = await call(carol, "POST", "/api/transactions", { type: "expense", amount: 1, date: `${MONTH}-05`, categoryId: alice.category });
    expect(one.status).toBe(400);
    const bulk = await call(carol, "POST", "/api/transactions/bulk", { items: [{ type: "expense", amount: 1, date: `${MONTH}-05`, categoryId: alice.category }] });
    expect(bulk.status).toBe(400);
    const upd = await call(carol, "PUT", `/api/transactions/${carol.tx}`, { categoryId: alice.category });
    expect(upd.status).toBe(400);
    // Even a household member's category
    expect((await call(bob, "PUT", `/api/transactions/${bob.tx}`, { categoryId: alice.category })).status).toBe(400);
  });
});

describe("categories and import rules of another user", () => {
  it("are not listed", async () => {
    const list = await call(carol, "GET", "/api/categories");
    expect(list.json.data.map((c: { id: string }) => c.id)).not.toContain(alice.category);
    const rules = await call(carol, "GET", "/api/category-rules");
    expect(JSON.stringify(rules.json)).not.toContain(alice.rule);
  });

  it("can't be changed, reordered, shared or deleted, also by a household member", async () => {
    for (const who of [carol, bob]) {
      expect((await call(who, "PUT", `/api/categories/${alice.category}`, { name: "hacked", budgetLimit: 1 })).status).toBe(403);
      expect((await call(who, "DELETE", `/api/categories/${alice.category}`)).status).toBe(403);
      expect((await call(who, "PATCH", "/api/categories/reorder", { items: [{ id: alice.category, order: 99 }] })).status).toBe(403);
      await call(who, "POST", "/api/categories/share", { ids: [alice.category], shared: true });
      expect((await call(who, "DELETE", `/api/category-rules/${alice.rule}`)).status).toBe(404);
      expect((await call(who, "POST", "/api/category-rules", { keyword: "hackrule", categoryId: alice.category })).status).toBe(400);
    }
    // "Delete all" only removes the caller's own
    expect((await call(carol, "DELETE", "/api/categories")).status).toBe(200);

    expect(await catRow(alice.category)).toMatchObject({ name: "Food alice", budgetLimit: null, shared: false, sortOrder: null });
    expect(await row(db.select().from(categoryRules).where(eq(categoryRules.id, alice.rule)))).toBeTruthy();
    expect(await catRow(carol.category)).toBeUndefined();
  });
});

describe("savings of another user", () => {
  it("are not listed and can't be read, changed or deleted", async () => {
    const list = await call(carol, "GET", "/api/savings");
    expect(JSON.stringify(list.json)).not.toContain(alice.goal);
    for (const who of [carol, bob]) {
      expect((await call(who, "PATCH", `/api/savings/${alice.goal}`, { name: "hacked" })).status).toBe(403);
      expect((await call(who, "PATCH", `/api/savings/${alice.goal}/pause`)).status).toBe(403);
      expect((await call(who, "PATCH", `/api/savings/${alice.goal}/resume`)).status).toBe(403);
      expect((await call(who, "GET", `/api/savings/${alice.goal}/deposits`)).status).toBe(403);
      expect((await call(who, "POST", `/api/savings/${alice.goal}/deposits`, { amount: 5 })).status).toBe(403);
      expect((await call(who, "DELETE", `/api/savings/${alice.goal}/deposits/${alice.deposit}`)).status).toBe(404);
      expect((await call(who, "DELETE", `/api/savings/${alice.goal}`)).status).toBe(403);
    }
    // Own goal id + someone else's deposit id
    expect((await call(carol, "DELETE", `/api/savings/${carol.goal}/deposits/${alice.deposit}`)).status).toBe(404);

    expect(await goalRow(alice.goal)).toMatchObject({ name: "Car alice", savedAmount: "50.00", paused: false });
    expect(await row(db.select().from(savingsDeposits).where(eq(savingsDeposits.id, alice.deposit)))).toBeTruthy();
  });
});

describe("households", () => {
  it("non-members can't read members, stats or activity", async () => {
    for (const path of ["members", `stats/monthly?year=2026&month=3`, "activity?year=2026&month=3"]) {
      expect((await call(carol, "GET", `/api/households/${alice.household}/${path}`)).status).toBe(403);
    }
    const mine = await call(carol, "GET", "/api/households/me");
    expect(mine.text).not.toContain(alice.user);
    expect(mine.text).not.toContain("alice");
  });

  it("members can read their household, without other households' data", async () => {
    const members = await call(bob, "GET", `/api/households/${alice.household}/members`);
    expect(members.status).toBe(200);
    expect(members.text).toContain(alice.user);
    const activity = await call(bob, "GET", `/api/households/${alice.household}/activity?year=2026&month=3&limit=50`);
    expect(activity.status).toBe(200);
    expect(activity.text).toContain("secret alice");
    expect(activity.text).not.toContain("secret carol");
    // ...but not another household
    expect((await call(bob, "GET", `/api/households/${carol.household}/activity?year=2026&month=3`)).status).toBe(403);
  });

  it("only the owner manages members and the invite code", async () => {
    const [before] = await db.select({ code: households.inviteCode }).from(households).where(eq(households.id, alice.household));
    // A plain member (wrong role)
    expect((await call(bob, "POST", `/api/households/${alice.household}/invite-code`)).status).toBe(403);
    expect((await call(bob, "DELETE", `/api/households/${alice.household}/members/${alice.user}`)).status).toBe(403);
    // An outsider, even one who owns another household
    expect((await call(carol, "POST", `/api/households/${alice.household}/invite-code`)).status).toBe(403);
    expect((await call(carol, "DELETE", `/api/households/${alice.household}/members/${bob.user}`)).status).toBe(403);
    // An owner can't remove someone from their household who isn't in it
    expect((await call(carol, "DELETE", `/api/households/${carol.household}/members/${bob.user}`)).status).toBe(404);

    const [after] = await db.select({ code: households.inviteCode }).from(households).where(eq(households.id, alice.household));
    expect(after.code).toBe(before.code);
    const membership = await db.select().from(householdMembers).where(eq(householdMembers.householdId, alice.household));
    expect(membership.map(m => m.userId).sort()).toEqual([alice.user, bob.user].sort());
    const [b] = await db.select({ householdId: users.householdId }).from(users).where(eq(users.id, bob.user));
    expect(b.householdId).toBe(alice.household);
  });

  it("a member who left loses access", async () => {
    expect((await call(bob, "DELETE", "/api/households/leave")).status).toBe(200);
    try {
      expect((await call(bob, "GET", `/api/households/${alice.household}/members`)).status).toBe(403);
      const list = await call(bob, "GET", `/api/transactions?month=${MONTH}&scope=family&limit=200`);
      expect(list.json.data.map((t: { id: string }) => t.id)).not.toContain(alice.tx);
    } finally {
      await db.insert(householdMembers).values({ householdId: alice.household, userId: bob.user });
      await db.update(users).set({ householdId: alice.household, householdEnabled: true }).where(eq(users.id, bob.user));
    }
  });
});

describe("account items of another user", () => {
  it("sessions, PIN devices and passkeys can't be listed or removed", async () => {
    const sessions = await call(carol, "GET", "/api/auth/sessions");
    expect(sessions.text).not.toContain(alice.session);
    expect((await call(carol, "DELETE", `/api/auth/sessions/${alice.session}`)).status).toBe(404);
    expect((await call(carol, "GET", "/api/auth/pin-devices")).text).not.toContain(alice.pinDevice);
    expect((await call(carol, "DELETE", `/api/auth/pin-devices/${alice.pinDevice}`)).status).toBe(404);
    expect((await call(carol, "GET", "/api/auth/webauthn/credentials")).text).not.toContain(alice.passkey);
    expect((await call(carol, "DELETE", `/api/auth/webauthn/credentials/${alice.passkey}`)).status).toBe(404);

    expect(await row(db.select().from(userSessions).where(eq(userSessions.id, alice.session)))).toBeTruthy();
    expect(await row(db.select().from(pinDeviceTokens).where(eq(pinDeviceTokens.id, alice.pinDevice)))).toBeTruthy();
    expect(await row(db.select().from(webauthnCredentials).where(eq(webauthnCredentials.id, alice.passkey)))).toBeTruthy();
  });

  it("passkeys can only be renamed by their owner", async () => {
    const theirs = await call(carol, "PATCH", `/api/auth/webauthn/credentials/${alice.passkey}`, { name: "pwned" });
    expect(theirs.status).toBe(404);
    expect((await row(db.select().from(webauthnCredentials).where(eq(webauthnCredentials.id, alice.passkey))))?.name).not.toBe("pwned");

    expect((await call(alice, "PATCH", `/api/auth/webauthn/credentials/${alice.passkey}`, { name: "  " })).status).toBe(400);
    const own = await call(alice, "PATCH", `/api/auth/webauthn/credentials/${alice.passkey}`, { name: " Alice's  iPhone " });
    expect(own.status).toBe(200);
    expect(own.json).toEqual({ id: alice.passkey, name: "Alice's iPhone" });
  });

  it("a malformed id is a 4xx, not a server error", async () => {
    for (const path of ["sessions", "pin-devices", "webauthn/credentials"]) {
      const { status } = await call(carol, "DELETE", `/api/auth/${path}/not-a-uuid`);
      expect(status).toBeGreaterThanOrEqual(400);
      expect(status).toBeLessThan(500);
    }
  });
});

describe("deleting a passwordless account", () => {
  const key = softPasskey();
  let dave: Ids;

  beforeAll(async () => {
    const email = `dave-${run}@access.test`;
    const [u] = await db.insert(users).values({ email, name: "dave", emailVerified: true, passwordHash: null, googleId: `g-dave-${run}` }).returning({ id: users.id });
    await db.insert(webauthnCredentials).values({ userId: u.id, credentialId: key.credentialId, publicKey: key.publicKeyBase64 });
    dave = { user: u.id, token: signAccessToken({ userId: u.id, email }) } as Ids;
  });
  afterAll(async () => { if (dave) await db.delete(users).where(eq(users.id, dave.user)); });

  const sign = (challenge: string) => key.assert({ challenge, origin: ORIGIN, rpId: RP_ID });
  const daveExists = async () => !!(await row(db.select({ id: users.id }).from(users).where(eq(users.id, dave.user))));

  it("needs a proof, and only dave's own passkey on dave's own challenge counts", async () => {
    const none = await call(dave, "DELETE", "/api/auth/account", {});
    expect(none.status).toBe(400);
    expect(none.json).toMatchObject({ code: "REAUTH_REQUIRED", methods: ["passkey", "google"] });

    // carol (a password account) can't swap her password for some passkey assertion
    const carolOpts = await call(carol, "POST", "/api/auth/webauthn/reauth-options");
    expect(carolOpts.status).toBe(200);
    expect((await call(carol, "DELETE", "/api/auth/account", { passkey: sign(carolOpts.json.challenge) })).status).toBe(400); // carol has a password
    // and carol's challenge can't be used to delete dave
    expect((await call(dave, "DELETE", "/api/auth/account", { passkey: sign(carolOpts.json.challenge) })).status).toBe(401);
    expect(await daveExists()).toBe(true);

    const opts = await call(dave, "POST", "/api/auth/webauthn/reauth-options");
    expect(opts.json.allowCredentials).toEqual([expect.objectContaining({ id: key.credentialId })]);
    expect(opts.json.userVerification).toBe("required");
    const ok = await call(dave, "DELETE", "/api/auth/account", { passkey: sign(opts.json.challenge) });
    expect(ok.status).toBe(200);
    expect(await daveExists()).toBe(false);
  });
});

