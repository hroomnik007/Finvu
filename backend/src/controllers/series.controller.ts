import { Response } from "express";
import { and, asc, eq, inArray, lt, or, gte } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { transactions, categories, users } from "../db/schema";
import { AuthRequest } from "../middleware/authenticate";
import { sharingMemberIds } from "../lib/sharedCategories";
import { buildSeries, monthsBetween } from "../lib/monthlySeries";
import type { RawTx } from "../lib/monthlySummary";

const ym = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

const querySchema = z.object({
  from: ym,
  to: ym,
  scope: z.enum(["personal", "family"]).optional().default("personal"),
  detail: z.enum(["members", "categories", "all"]).optional(),
});

const MAX_MONTHS = 24;

function nextMonthStart(month: string): string {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
}

// Income and expenses per month for a range, with the same recurring-item rules as
// the monthly cards. Family scope covers every sharing member and always returns the
// per-member split; `detail=categories` adds the category breakdown of each month.
export async function getMonthlySeries(req: AuthRequest, res: Response): Promise<void> {
  const query = querySchema.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: "Invalid query params", details: query.error.issues });
    return;
  }
  const { from, to, scope, detail } = query.data;
  const count = monthsBetween(from, to).length;
  if (count < 1 || count > MAX_MONTHS) {
    res.status(400).json({ error: `Range must be 1–${MAX_MONTHS} months` });
    return;
  }

  const sharing = scope === "family" ? await sharingMemberIds(req.userId!) : null;
  const ids = sharing ?? [req.userId!];
  const family = ids.length > 1;
  const end = nextMonthStart(to);

  const txs: RawTx[] = await db
    .select({
      userId: transactions.userId, type: transactions.type, amount: transactions.amount,
      categoryId: transactions.categoryId, description: transactions.description, date: transactions.date,
      isFixed: transactions.isFixed, endedOn: transactions.endedOn,
    })
    .from(transactions)
    .where(and(
      inArray(transactions.userId, ids),
      or(
        and(eq(transactions.isFixed, false), gte(transactions.date, `${from}-01`), lt(transactions.date, end)),
        and(eq(transactions.isFixed, true), lt(transactions.date, end)),
      ),
    ))
    .orderBy(asc(transactions.date));

  const wantCategories = detail === "categories" || detail === "all";
  let userNames: Map<string, string> | undefined;
  if (family) {
    const rows = await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, ids));
    userNames = new Map(rows.map((r) => [r.id, r.name]));
  }
  let categoryInfo: Map<string, { name: string; color: string | null }> | undefined;
  if (wantCategories) {
    const rows = await db.select({ id: categories.id, name: categories.name, color: categories.color }).from(categories).where(inArray(categories.userId, ids));
    categoryInfo = new Map(rows.map((r) => [r.id, { name: r.name, color: r.color }]));
  }

  res.json({ family, months: buildSeries(txs, from, to, new Date(), { userNames, categoryInfo }) });
}
