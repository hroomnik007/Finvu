// Full backup of one user's own data, and restoring it into an account.
//
// The backup holds only what the user entered: transactions (with recurring
// series, their ends and price changes, which are just more rows), categories
// with limits, import rules, savings goals with deposits and a few settings.
// Never credentials, sessions, tokens, passkeys or other household members' rows.
// The browser encrypts the JSON before it is saved, so the server only ever sees
// it in the clear over the authenticated API, like any other request.
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { users, categories, categoryRules, transactions, savingsGoals, savingsDeposits } from "../db/schema";

export const BACKUP_FORMAT = "finvu-backup";
export const BACKUP_VERSION = 1;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const day = z.string().regex(ISO_DATE);
const money = z.string().regex(/^-?\d{1,12}(\.\d{1,6})?$/);
const color = z.string().max(7).nullable();
const ref = z.string().min(1).max(64);

const categorySchema = z.object({
  id: ref,
  name: z.string().min(1).max(100),
  type: z.enum(["income", "expense"]),
  color,
  icon: z.string().max(50).nullable(),
  isDefault: z.boolean(),
  budgetLimit: money.nullable(),
  autoLimit: z.boolean(),
  limitReserve: money,
  shared: z.boolean(),
  sortOrder: z.number().int().nullable(),
});

const ruleSchema = z.object({
  keyword: z.string().min(1).max(100),
  categoryId: ref,
});

const transactionSchema = z.object({
  categoryId: ref.nullable(),
  type: z.enum(["income", "expense"]),
  amount: money,
  description: z.string().max(500).nullable(),
  date: day,
  isFixed: z.boolean(),
  endedOn: day.nullable(),
});

const goalSchema = z.object({
  id: ref,
  name: z.string().min(1).max(100),
  targetAmount: money,
  savedAmount: money,
  deadline: day.nullable(),
  icon: z.string().max(50).nullable(),
  color,
  note: z.string().max(500).nullable(),
  paused: z.boolean(),
});

const depositSchema = z.object({
  goalId: ref,
  amount: money,
  createdAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?$/),
});

const settingsSchema = z.object({
  theme: z.string().max(20).nullable(),
  language: z.string().max(10).nullable(),
  trackingStartDate: day.nullable(),
  currencyFormat: z.string().max(10).nullable(),
  defaultPage: z.string().max(50).nullable(),
  savingsEnabled: z.boolean().nullable(),
});

export const backupSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  version: z.literal(BACKUP_VERSION),
  exportedAt: z.string().max(40),
  data: z.object({
    settings: settingsSchema,
    categories: z.array(categorySchema).max(2_000),
    categoryRules: z.array(ruleSchema).max(5_000),
    transactions: z.array(transactionSchema).max(200_000),
    savingsGoals: z.array(goalSchema).max(1_000),
    savingsDeposits: z.array(depositSchema).max(50_000),
  }),
});
export type Backup = z.infer<typeof backupSchema>;

export const restoreSchema = z.object({
  mode: z.enum(["replace", "merge"]),
  backup: backupSchema,
});

export async function buildBackup(userId: string, now = new Date()): Promise<Backup> {
  const [u] = await db
    .select({
      theme: users.theme, language: users.language, trackingStartDate: users.trackingStartDate,
      currencyFormat: users.currencyFormat, defaultPage: users.defaultPage, savingsEnabled: users.savingsEnabled,
    })
    .from(users).where(eq(users.id, userId)).limit(1);
  if (!u) throw new Error("user not found");

  const cats = await db.select().from(categories).where(eq(categories.userId, userId)).orderBy(categories.createdAt);
  const rules = await db.select().from(categoryRules).where(eq(categoryRules.userId, userId)).orderBy(categoryRules.createdAt);
  // Only rows the user owns: in a household the others' rows stay theirs
  const txs = await db.select().from(transactions).where(eq(transactions.userId, userId)).orderBy(transactions.date, transactions.createdAt);
  const goals = await db.select().from(savingsGoals).where(eq(savingsGoals.userId, userId)).orderBy(savingsGoals.createdAt);
  // created_at has no time zone: carry the stored value as text so it comes back unchanged
  const deposits = await db.select({
    goalId: savingsDeposits.goalId, amount: savingsDeposits.amount,
    createdAt: sql<string>`to_char(${savingsDeposits.createdAt}, 'YYYY-MM-DD"T"HH24:MI:SS.US')`,
  }).from(savingsDeposits).where(eq(savingsDeposits.userId, userId)).orderBy(savingsDeposits.createdAt);
  const ownCats = new Set(cats.map(c => c.id));

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    data: {
      settings: u,
      categories: cats.map(c => ({
        id: c.id, name: c.name, type: c.type as "income" | "expense", color: c.color, icon: c.icon, isDefault: c.isDefault,
        budgetLimit: c.budgetLimit, autoLimit: c.autoLimit, limitReserve: c.limitReserve, shared: c.shared, sortOrder: c.sortOrder,
      })),
      categoryRules: rules.map(r => ({ keyword: r.keyword, categoryId: r.categoryId })),
      transactions: txs.map(t => ({
        categoryId: t.categoryId && ownCats.has(t.categoryId) ? t.categoryId : null,
        type: t.type as "income" | "expense", amount: t.amount, description: t.description, date: t.date,
        isFixed: t.isFixed, endedOn: t.endedOn,
      })),
      savingsGoals: goals.map(g => ({
        id: g.id, name: g.name, targetAmount: g.targetAmount, savedAmount: g.savedAmount, deadline: g.deadline,
        icon: g.icon, color: g.color, note: g.note, paused: g.paused,
      })),
      savingsDeposits: deposits.map(d => ({ goalId: d.goalId, amount: d.amount, createdAt: d.createdAt })),
    },
  };
}

export type RestoreCounts = {
  categories: number; categoryRules: number; transactions: number; savingsGoals: number; savingsDeposits: number;
  skippedTransactions: number;
};

const txKey = (t: { type: string; amount: string; date: string; description: string | null; isFixed: boolean }) =>
  [t.date, t.type, Number(t.amount).toFixed(2), t.isFixed ? "f" : "v", (t.description ?? "").trim().toLowerCase()].join("|");
const catKey = (c: { name: string; type: string }) => `${c.type}|${c.name.trim().toLowerCase()}`;

function chunks<T>(rows: T[], size = 1000): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

// "replace" wipes the user's own data first; "merge" keeps it and adds only
// what isn't there yet (same category name, same rule keyword, same goal
// name, or a transaction with the same date, type, amount and description).
// Everything happens in one database transaction, so a failure changes nothing.
export async function restoreBackup(userId: string, backup: Backup, mode: "replace" | "merge"): Promise<RestoreCounts> {
  const d = backup.data;
  return db.transaction(async (tx) => {
    const [u] = await tx.select({ householdId: users.householdId, householdEnabled: users.householdEnabled })
      .from(users).where(eq(users.id, userId)).limit(1);
    if (!u) throw new Error("user not found");
    const householdId = u.householdEnabled && u.householdId ? u.householdId : null;

    if (mode === "replace") {
      await tx.delete(savingsDeposits).where(eq(savingsDeposits.userId, userId));
      await tx.delete(savingsGoals).where(eq(savingsGoals.userId, userId));
      await tx.delete(transactions).where(eq(transactions.userId, userId));
      await tx.delete(categoryRules).where(eq(categoryRules.userId, userId));
      await tx.delete(categories).where(eq(categories.userId, userId));
      const s = d.settings;
      await tx.update(users).set({
        ...(s.theme ? { theme: s.theme } : {}),
        ...(s.language ? { language: s.language } : {}),
        ...(s.currencyFormat ? { currencyFormat: s.currencyFormat } : {}),
        ...(s.defaultPage ? { defaultPage: s.defaultPage } : {}),
        ...(s.savingsEnabled !== null ? { savingsEnabled: s.savingsEnabled } : {}),
        trackingStartDate: s.trackingStartDate,
        updatedAt: new Date(),
      }).where(eq(users.id, userId));
    }

    const counts: RestoreCounts = { categories: 0, categoryRules: 0, transactions: 0, savingsGoals: 0, savingsDeposits: 0, skippedTransactions: 0 };

    // Categories: backup id -> id in this account
    const catMap = new Map<string, string>();
    const existingCats = mode === "merge"
      ? await tx.select({ id: categories.id, name: categories.name, type: categories.type }).from(categories).where(eq(categories.userId, userId))
      : [];
    const byKey = new Map(existingCats.map(c => [catKey(c), c.id]));
    const newCats = d.categories.filter(c => {
      const hit = byKey.get(catKey(c));
      if (hit) { catMap.set(c.id, hit); return false }
      return true;
    });
    for (const part of chunks(newCats)) {
      const inserted = await tx.insert(categories).values(part.map(c => ({
        userId, name: c.name, type: c.type, color: c.color, icon: c.icon, isDefault: c.isDefault,
        budgetLimit: c.budgetLimit, autoLimit: c.autoLimit, limitReserve: c.limitReserve, shared: c.shared, sortOrder: c.sortOrder,
      }))).returning({ id: categories.id });
      part.forEach((c, i) => { catMap.set(c.id, inserted[i].id); byKey.set(catKey(c), inserted[i].id) });
      counts.categories += inserted.length;
    }

    // Rules: the keyword is unique per user, an existing one wins
    const rules = d.categoryRules
      .filter(r => catMap.has(r.categoryId))
      .map(r => ({ userId, keyword: r.keyword, categoryId: catMap.get(r.categoryId)! }));
    for (const part of chunks(rules)) {
      const inserted = await tx.insert(categoryRules).values(part).onConflictDoNothing().returning({ id: categoryRules.id });
      counts.categoryRules += inserted.length;
    }

    // Transactions
    const seen = new Set<string>();
    if (mode === "merge") {
      const existing = await tx.select({
        type: transactions.type, amount: transactions.amount, date: transactions.date,
        description: transactions.description, isFixed: transactions.isFixed,
      }).from(transactions).where(eq(transactions.userId, userId));
      for (const t of existing) seen.add(txKey(t));
    }
    const txRows: (typeof transactions.$inferInsert)[] = [];
    for (const t of d.transactions) {
      if (mode === "merge") {
        const k = txKey(t);
        if (seen.has(k)) { counts.skippedTransactions++; continue }
        seen.add(k);
      }
      txRows.push({
        userId, createdBy: userId, householdId,
        categoryId: t.categoryId ? catMap.get(t.categoryId) ?? null : null,
        type: t.type, amount: t.amount, description: t.description, date: t.date, isFixed: t.isFixed, endedOn: t.endedOn,
      });
    }
    for (const part of chunks(txRows)) {
      await tx.insert(transactions).values(part);
      counts.transactions += part.length;
    }

    // Savings goals and their deposits; in merge mode a goal with the same name is kept as is
    const goalMap = new Map<string, string>();
    const existingGoals = mode === "merge"
      ? new Set((await tx.select({ name: savingsGoals.name }).from(savingsGoals).where(eq(savingsGoals.userId, userId))).map(g => g.name.trim().toLowerCase()))
      : new Set<string>();
    const newGoals = d.savingsGoals.filter(g => !existingGoals.has(g.name.trim().toLowerCase()));
    for (const part of chunks(newGoals)) {
      const inserted = await tx.insert(savingsGoals).values(part.map(g => ({
        userId, name: g.name, targetAmount: g.targetAmount, savedAmount: g.savedAmount, deadline: g.deadline,
        icon: g.icon, color: g.color, note: g.note, paused: g.paused,
      }))).returning({ id: savingsGoals.id });
      part.forEach((g, i) => goalMap.set(g.id, inserted[i].id));
      counts.savingsGoals += inserted.length;
    }
    const deposits = d.savingsDeposits
      .filter(dep => goalMap.has(dep.goalId))
      .map(dep => ({ userId, goalId: goalMap.get(dep.goalId)!, amount: dep.amount, createdAt: sql`${dep.createdAt}::timestamp` }));
    for (const part of chunks(deposits)) {
      await tx.insert(savingsDeposits).values(part);
      counts.savingsDeposits += part.length;
    }

    return counts;
  });
}
