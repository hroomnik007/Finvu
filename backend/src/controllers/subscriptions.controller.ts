import { Response } from "express";
import { and, eq, gte } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { subscriptionDismissals, transactions } from "../db/schema";
import { AuthRequest } from "../middleware/authenticate";
import { localDateISO } from "../lib/localDate";
import { detectSubscriptions, normalizeDescription } from "../lib/subscriptions";

// How far back to look for monthly charges
const LOOKBACK_MONTHS = 14;

function lookbackStart(today: string): string {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7)) - LOOKBACK_MONTHS;
  const d = new Date(Date.UTC(y, m - 1, 1));
  return d.toISOString().slice(0, 10);
}

// GET /api/subscriptions/suggestions — from the caller's own rows only (never
// household members'), minus what is already a fixed expense or was hidden.
export async function listSuggestions(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.userId!;
  const today = localDateISO();
  const [variable, fixed, dismissed] = await Promise.all([
    db.select({ date: transactions.date, amount: transactions.amount, description: transactions.description, categoryId: transactions.categoryId })
      .from(transactions)
      .where(and(eq(transactions.userId, userId), eq(transactions.type, "expense"), eq(transactions.isFixed, false), gte(transactions.date, lookbackStart(today)))),
    db.select({ date: transactions.date, amount: transactions.amount, description: transactions.description, endedOn: transactions.endedOn })
      .from(transactions)
      .where(and(eq(transactions.userId, userId), eq(transactions.type, "expense"), eq(transactions.isFixed, true))),
    db.select({ key: subscriptionDismissals.patternKey }).from(subscriptionDismissals).where(eq(subscriptionDismissals.userId, userId)),
  ]);
  const data = detectSubscriptions(variable, fixed, today, dismissed.map(d => d.key));
  res.json({ data });
}

const dismissSchema = z.object({ key: z.string().trim().min(1).max(120) });

// POST /api/subscriptions/dismissals { key } — hide a suggestion for good
export async function dismissSuggestion(req: AuthRequest, res: Response): Promise<void> {
  const body = dismissSchema.safeParse(req.body);
  // Only store keys in the detector's own form, so the table holds no free text
  const key = body.success ? normalizeDescription(body.data.key) : "";
  if (!body.success || !key || key !== body.data.key) {
    res.status(400).json({ error: "Validation error" });
    return;
  }
  await db.insert(subscriptionDismissals)
    .values({ userId: req.userId!, patternKey: key })
    .onConflictDoNothing();
  res.status(204).end();
}
