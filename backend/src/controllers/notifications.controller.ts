import { Response } from "express";
import { eq, and, gte, lte, desc, asc } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { notificationsDismissed, transactions, categories, savingsGoals } from "../db/schema";
import { AuthRequest } from "../middleware/authenticate";
import { isActiveInMonth } from "../lib/recurring";

// ── Feed item types (translated client-side from kind + params) ─────────────
type FeedItem =
  | { id: string; kind: "budget"; categoryName: string; spent: number; limit: number }
  | { id: string; kind: "fixedDue"; label: string; dayOfMonth: number; daysUntil: number; amount: number }
  | { id: string; kind: "income"; description: string | null; amount: number; daysAgo: number }
  | { id: string; kind: "savings"; name: string; icon: string | null; savedAmount: number; targetAmount: number };

/**
 * Single endpoint replacing the five client-side fetches the notification
 * center used to make (dismissed + categories + 2× transactions + savings).
 * The client passes its local date (?today=YYYY-MM-DD) so "due today" honours
 * the user's timezone rather than the server's.
 */
export async function getFeed(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.userId!;

  const todayParam = typeof req.query.today === "string" ? req.query.today : "";
  let y: number, m: number, d: number;
  if (/^\d{4}-\d{2}-\d{2}$/.test(todayParam)) {
    [y, m, d] = todayParam.split("-").map(Number);
  } else {
    const now = new Date();
    y = now.getFullYear();
    m = now.getMonth() + 1;
    d = now.getDate();
  }
  const daysInMonth = new Date(y, m, 0).getDate();
  const monthStart = `${y}-${String(m).padStart(2, "0")}-01`;
  const monthEnd = `${y}-${String(m).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;

  const [dismissedRows, cats, variableTxs, fixedTxs, latestIncome, goals] = await Promise.all([
    db.select({ key: notificationsDismissed.notificationKey })
      .from(notificationsDismissed)
      .where(eq(notificationsDismissed.userId, userId)),
    db.select({ id: categories.id, name: categories.name, budgetLimit: categories.budgetLimit })
      .from(categories)
      .where(and(eq(categories.userId, userId), eq(categories.type, "expense"))),
    db.select({ categoryId: transactions.categoryId, amount: transactions.amount })
      .from(transactions)
      .where(and(
        eq(transactions.userId, userId),
        eq(transactions.type, "expense"),
        eq(transactions.isFixed, false),
        gte(transactions.date, monthStart),
        lte(transactions.date, monthEnd),
      )),
    db.select({ id: transactions.id, amount: transactions.amount, description: transactions.description, date: transactions.date, endedOn: transactions.endedOn })
      .from(transactions)
      .where(and(eq(transactions.userId, userId), eq(transactions.type, "expense"), eq(transactions.isFixed, true)))
      .orderBy(transactions.date),
    db.select({ id: transactions.id, amount: transactions.amount, description: transactions.description, date: transactions.date })
      .from(transactions)
      .where(and(eq(transactions.userId, userId), eq(transactions.type, "income")))
      .orderBy(desc(transactions.date))
      .limit(1),
    db.select()
      .from(savingsGoals)
      .where(and(eq(savingsGoals.userId, userId), eq(savingsGoals.paused, false)))
      .orderBy(asc(savingsGoals.createdAt)),
  ]);

  const items: FeedItem[] = [];

  // Budget warnings (≥ 80 % of limit spent this month)
  const spentByCategory = new Map<string, number>();
  for (const tx of variableTxs) {
    if (!tx.categoryId) continue;
    spentByCategory.set(tx.categoryId, (spentByCategory.get(tx.categoryId) ?? 0) + Number(tx.amount));
  }
  for (const cat of cats) {
    const limit = Number(cat.budgetLimit);
    if (!limit || limit <= 0) continue;
    const spent = spentByCategory.get(cat.id) ?? 0;
    if ((spent / limit) * 100 < 80) continue;
    items.push({ id: `budget-${cat.id}`, kind: "budget", categoryName: cat.name, spent, limit });
  }

  // Upcoming fixed expenses (next 7 days, max 2, most urgent first)
  // One entry per series (its latest row) that still applies this month
  const latestBySeries = new Map<string, (typeof fixedTxs)[number]>();
  for (const tx of fixedTxs) latestBySeries.set(tx.description ?? "", tx);
  const upcoming = [...latestBySeries.values()]
    .filter((tx) => isActiveInMonth(tx.endedOn, y, m))
    .map((tx) => {
      let dayOfMonth = tx.date ? Number(tx.date.slice(8, 10)) : 1;
      let label = tx.description ?? "";
      try {
        const obj = JSON.parse(tx.description ?? "");
        if (obj && typeof obj.d === "number") {
          dayOfMonth = obj.d;
          label = String(obj.l ?? label);
        }
      } catch { /* plain text description */ }
      const daysUntil = dayOfMonth >= d ? dayOfMonth - d : daysInMonth - d + dayOfMonth;
      return { tx, dayOfMonth, label, daysUntil };
    })
    .filter((f) => f.daysUntil <= 7)
    .sort((a, b) => a.daysUntil - b.daysUntil)
    .slice(0, 2);
  for (const { tx, dayOfMonth, label, daysUntil } of upcoming) {
    items.push({ id: `fixed-${tx.id}`, kind: "fixedDue", label, dayOfMonth, daysUntil, amount: Number(tx.amount) });
  }

  // Latest income
  if (latestIncome.length > 0) {
    const inc = latestIncome[0];
    const todayUtc = Date.UTC(y, m - 1, d);
    const incomeUtc = Date.UTC(Number(inc.date.slice(0, 4)), Number(inc.date.slice(5, 7)) - 1, Number(inc.date.slice(8, 10)));
    const daysAgo = Math.max(0, Math.floor((todayUtc - incomeUtc) / 86400000));
    items.push({ id: `income-${inc.id}`, kind: "income", description: inc.description, amount: Number(inc.amount), daysAgo });
  }

  // First savings goal near completion (80–99 %)
  for (const goal of goals) {
    const target = Number(goal.targetAmount);
    if (!target) continue;
    const pct = (Number(goal.savedAmount) / target) * 100;
    if (pct < 80 || pct >= 100) continue;
    items.push({ id: `savings-${goal.id}`, kind: "savings", name: goal.name, icon: goal.icon, savedAmount: Number(goal.savedAmount), targetAmount: target });
    break;
  }

  const dismissed = dismissedRows.map((r) => r.key);
  const dismissedSet = new Set(dismissed);
  res.json({ data: items.filter((i) => !dismissedSet.has(i.id)), dismissed });
}

export async function getDismissed(req: AuthRequest, res: Response): Promise<void> {
  const rows = await db
    .select({ key: notificationsDismissed.notificationKey })
    .from(notificationsDismissed)
    .where(eq(notificationsDismissed.userId, req.userId!));
  res.json({ data: rows.map(r => r.key) });
}

export async function dismissNotification(req: AuthRequest, res: Response): Promise<void> {
  const body = z.object({ key: z.string().min(1).max(255) }).safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Validation error" });
    return;
  }
  await db
    .insert(notificationsDismissed)
    .values({ userId: req.userId!, notificationKey: body.data.key })
    .onConflictDoNothing();
  res.json({ success: true });
}
