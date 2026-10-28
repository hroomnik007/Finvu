import { Response } from "express";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { categories, categoryRules } from "../db/schema";
import { AuthRequest } from "../middleware/authenticate";
import { normalizeKeyword } from "../lib/importRules";

const saveSchema = z.object({
  keyword: z.string().min(1).max(100),
  categoryId: z.guid(),
});

export async function listRules(req: AuthRequest, res: Response): Promise<void> {
  const rows = await db
    .select({ id: categoryRules.id, keyword: categoryRules.keyword, categoryId: categoryRules.categoryId })
    .from(categoryRules)
    .where(eq(categoryRules.userId, req.userId!))
    .orderBy(categoryRules.keyword);
  res.json({ data: rows });
}

// Saving an existing keyword moves it to the new category.
export async function saveRule(req: AuthRequest, res: Response): Promise<void> {
  const body = saveSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Validation error" });
    return;
  }
  const keyword = normalizeKeyword(body.data.keyword);
  if (keyword.length < 2) {
    res.status(400).json({ error: "Keyword too short" });
    return;
  }
  const [owned] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.id, body.data.categoryId), eq(categories.userId, req.userId!)))
    .limit(1);
  if (!owned) {
    res.status(400).json({ error: "Invalid category" });
    return;
  }
  const [row] = await db
    .insert(categoryRules)
    .values({ userId: req.userId!, keyword, categoryId: body.data.categoryId })
    .onConflictDoUpdate({ target: [categoryRules.userId, categoryRules.keyword], set: { categoryId: body.data.categoryId } })
    .returning({ id: categoryRules.id, keyword: categoryRules.keyword, categoryId: categoryRules.categoryId });
  res.status(201).json({ data: row });
}

export async function deleteRule(req: AuthRequest, res: Response): Promise<void> {
  const removed = await db
    .delete(categoryRules)
    .where(and(eq(categoryRules.id, req.params["id"] as string), eq(categoryRules.userId, req.userId!)))
    .returning({ id: categoryRules.id });
  if (removed.length === 0) {
    res.status(404).json({ error: "Rule not found" });
    return;
  }
  res.json({ success: true });
}
