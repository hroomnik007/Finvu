import { Response } from "express";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { categories, categoryRules, transactions } from "../db/schema";
import { AuthRequest } from "../middleware/authenticate";
import { localDateISO } from "../lib/localDate";
import { HISTORY_LIMIT, MIN_QUERY_LENGTH, suggestCategory } from "../lib/categorySuggest";
import { normalizeKeyword } from "../lib/importRules";

const querySchema = z.object({
  q: z.string().max(500),
  type: z.enum(["income", "expense"]).optional().default("expense"),
});

// Only the caller's own rules, transactions and categories are read — a
// household member's history never suggests their (or any foreign) category.
export async function suggestTransactionCategory(req: AuthRequest, res: Response): Promise<void> {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Validation error" });
    return;
  }
  const { q, type } = parsed.data;
  if (normalizeKeyword(q).length < MIN_QUERY_LENGTH) {
    res.json({ data: null });
    return;
  }
  const userId = req.userId!;
  const ownCategory = and(eq(categories.userId, userId), eq(categories.type, type));

  const rules = await db
    .select({ keyword: categoryRules.keyword, categoryId: categoryRules.categoryId })
    .from(categoryRules)
    .innerJoin(categories, eq(categories.id, categoryRules.categoryId))
    .where(and(eq(categoryRules.userId, userId), ownCategory));

  const history = await db
    .select({ description: transactions.description, categoryId: transactions.categoryId, date: transactions.date })
    .from(transactions)
    .innerJoin(categories, eq(categories.id, transactions.categoryId))
    .where(and(eq(transactions.userId, userId), eq(transactions.type, type), isNotNull(transactions.description), ownCategory))
    .orderBy(desc(transactions.date), desc(transactions.createdAt))
    .limit(HISTORY_LIMIT);

  res.json({ data: suggestCategory(q, rules, history, localDateISO()) });
}
