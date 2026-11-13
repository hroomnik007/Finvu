// Recurring items are a series identified by user + type + description:
//  - a second running item with the same name is refused (it would silently
//    replace the first one in every total),
//  - an update that does not mention isFixed keeps the row recurring,
//  - a recurring income counts from its payday, and a price change keeps the day,
//  - the opening balance is part of the cumulative balance.
// Run with `npm run test:integration` (see accessControl.int.test.ts).
import express from "express";
import type { AddressInfo } from "net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { users, transactions } from "../db/schema";
import { signAccessToken } from "../lib/tokens";
import { errorHandler } from "../middleware/errorHandler";
import transactionsRouter from "../routes/transactions";

const app = express();
app.use(express.json());
app.use("/api/transactions", transactionsRouter);
app.use(errorHandler);

const run = Date.now().toString(36);
let server: ReturnType<typeof app.listen>;
let base = "";
let user = { id: "", token: "" };

const rent = JSON.stringify({ l: "Nájom", n: "", d: 1 });

beforeAll(async () => {
  const email = `series-${run}@series.test`;
  const [u] = await db.insert(users)
    .values({ email, name: "Series", emailVerified: true, passwordHash: "x", trackingStartDate: "2020-01-01", openingBalance: "1000.00" })
    .returning({ id: users.id });
  user = { id: u.id, token: signAccessToken({ userId: u.id, email }) };
  server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  if (user.id) await db.delete(users).where(eq(users.id, user.id));
});

async function call(method: string, path: string, body?: unknown) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { authorization: `Bearer ${user.token}`, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> & { data?: Record<string, unknown>; code?: string } };
}

describe("recurring series", () => {
  let rentId = "";

  it("refuses a second running item with the same name", async () => {
    const first = await call("POST", "/api/transactions", { type: "expense", amount: 650, description: rent, date: "2020-01-01", isFixed: true });
    expect(first.status).toBe(201);
    rentId = first.body.data!.id as string;

    const second = await call("POST", "/api/transactions", { type: "expense", amount: 700, description: rent, date: "2020-02-01", isFixed: true });
    expect(second.status).toBe(409);
    expect(second.body.code).toBe("RECURRING_NAME_EXISTS");

    // The same text on a one-off row, or on the other type, is a different thing
    expect((await call("POST", "/api/transactions", { type: "expense", amount: 5, description: rent, date: "2020-02-01" })).status).toBe(201);
    expect((await call("POST", "/api/transactions", { type: "income", amount: 5, description: rent, date: "2020-02-01", isFixed: true })).status).toBe(201);
  });

  it("allows restarting a series only after it has ended", async () => {
    const sub = JSON.stringify({ l: "Netflix", n: "", d: 5 });
    const created = await call("POST", "/api/transactions", { type: "expense", amount: 10, description: sub, date: "2020-01-05", isFixed: true });
    await call("POST", `/api/transactions/${created.body.data!.id}/end`, { lastMonth: "2020-03" });
    expect((await call("POST", "/api/transactions", { type: "expense", amount: 12, description: sub, date: "2020-03-05", isFixed: true })).status).toBe(409);
    expect((await call("POST", "/api/transactions", { type: "expense", amount: 12, description: sub, date: "2020-06-05", isFixed: true })).status).toBe(201);
  });

  it("refuses renaming a recurring item onto another running one", async () => {
    const other = await call("POST", "/api/transactions", { type: "expense", amount: 20, description: JSON.stringify({ l: "Internet", n: "", d: 1 }), date: "2020-01-01", isFixed: true });
    const renamed = await call("PUT", `/api/transactions/${other.body.data!.id}`, { description: rent });
    expect(renamed.status).toBe(409);
    expect(renamed.body.code).toBe("RECURRING_NAME_EXISTS");
  });

  it("keeps a row recurring when an update does not mention isFixed", async () => {
    const updated = await call("PUT", `/api/transactions/${rentId}`, { amount: 660, description: rent });
    expect(updated.status).toBe(200);
    const [row] = await db.select({ isFixed: transactions.isFixed, amount: transactions.amount }).from(transactions).where(eq(transactions.id, rentId));
    expect(row.isFixed).toBe(true);
    expect(Number(row.amount)).toBe(660);
  });

  it("keeps the payday of a recurring income across a price change", async () => {
    const pay = await call("POST", "/api/transactions", { type: "income", amount: 1500, description: "Výplata", date: "2020-01-31", isFixed: true });
    const changed = await call("POST", `/api/transactions/${pay.body.data!.id}/price-change`, { amount: 1600, from: "2020-02" });
    expect(changed.status).toBe(200);
    // 31st clamped to the last day of February 2020
    expect(changed.body.data!.date).toBe("2020-02-29");
  });

  it("adds the opening balance to the cumulative balance", async () => {
    // January 2020: opening 1000 + income (Výplata 1500 + the 5 € "income" named like the rent
    // only starts in February) − Nájom 660 − Netflix 10 − Internet 20
    const jan = await call("GET", "/api/transactions/balance-at-month?year=2020&month=1");
    expect(jan.body.balance).toBeCloseTo(1000 + 1500 - 660 - 10 - 20, 2);
    // Before the tracking start there is nothing, the opening balance included
    const before = await call("GET", "/api/transactions/balance-at-month?year=2019&month=12");
    expect(before.body.balance).toBe(0);
  });
});
