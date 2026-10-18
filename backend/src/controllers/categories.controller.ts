import { Response } from "express";
import { and, eq, inArray, isNotNull, sql, asc } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { categories, transactions } from "../db/schema";
import { AuthRequest } from "../middleware/authenticate";
import { NotSharingError, propagateSharedLimit, shareCategories, sharingMemberIds, unshareCategories } from "../lib/sharedCategories";

type CategoryRow = typeof categories.$inferSelect;
function normalizeCategory(row: CategoryRow) {
  return {
    ...row,
    budgetLimit: row.budgetLimit != null ? Number(row.budgetLimit) : null,
    autoLimit: row.autoLimit,
    limitReserve: Number(row.limitReserve ?? 0),
    shared: row.shared,
  };
}

export async function recalculateCategoryLimit(categoryId: string, userId: string): Promise<void> {
  const [cat] = await db
    .select({ autoLimit: categories.autoLimit, limitReserve: categories.limitReserve })
    .from(categories)
    .where(and(eq(categories.id, categoryId), eq(categories.userId, userId)))
    .limit(1);

  if (!cat?.autoLimit) return;

  const [{ total }] = await db
    .select({ total: sql<string>`COALESCE(SUM(${transactions.amount}), 0)` })
    .from(transactions)
    .where(and(
      eq(transactions.userId, userId),
      eq(transactions.categoryId, categoryId),
      eq(transactions.isFixed, true),
      eq(transactions.type, "expense")
    ));

  const fixedTotal = parseFloat(total ?? "0");
  if (fixedTotal > 0) {
    // Fixed expenses plus the user's reserve for variable spending in the category.
    const newLimit = Math.round((fixedTotal + parseFloat(cat.limitReserve ?? "0")) * 100) / 100;
    await db
      .update(categories)
      .set({ budgetLimit: String(newLimit) })
      .where(eq(categories.id, categoryId));
  } else {
    // All fixed expenses removed — disable auto_limit so category returns to manual mode
    await db
      .update(categories)
      .set({ budgetLimit: null, autoLimit: false })
      .where(eq(categories.id, categoryId));
  }
}

const createSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(["income", "expense"]),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  icon: z.string().max(50).optional(),
  budgetLimit: z.number().positive().nullable().optional(),
  autoLimit: z.boolean().optional(),
  limitReserve: z.number().min(0).max(9_999_999_999.99).optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  icon: z.string().max(50).optional(),
  budgetLimit: z.number().positive().nullable().optional(),
  autoLimit: z.boolean().optional(),
  limitReserve: z.number().min(0).max(9_999_999_999.99).optional(),
});

export async function listCategories(req: AuthRequest, res: Response): Promise<void> {
  const rows = await db
    .select()
    .from(categories)
    .where(eq(categories.userId, req.userId!))
    .orderBy(sql`sort_order NULLS LAST`, asc(categories.type), asc(categories.name));

  // Determine which categories have at least one fixed expense transaction
  const categoryIds = rows.map((r) => r.id);
  let fixedCatIds = new Set<string>();
  if (categoryIds.length > 0) {
    const fixedRows = await db
      .select({ categoryId: transactions.categoryId })
      .from(transactions)
      .where(and(
        eq(transactions.isFixed, true),
        eq(transactions.type, "expense"),
        isNotNull(transactions.categoryId),
        inArray(transactions.categoryId, categoryIds)
      ))
      .groupBy(transactions.categoryId);
    fixedCatIds = new Set(fixedRows.map((r) => r.categoryId!));
  }

  // A shared limit is per member, so the family-wide budget is limit x members
  const familyMembers = rows.some((r) => r.shared) ? ((await sharingMemberIds(req.userId!))?.length ?? 1) : 1;

  res.json({
    data: rows.map((r) => ({
      ...normalizeCategory(r),
      hasFixedExpenses: fixedCatIds.has(r.id),
      ...(r.shared ? { familyMembers } : {}),
    })),
  });
}

export async function createCategory(req: AuthRequest, res: Response): Promise<void> {
  const body = createSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Validation error", details: body.error.errors });
    return;
  }

  const { budgetLimit: bl, autoLimit, limitReserve, ...rest } = body.data
  const [row] = await db
    .insert(categories)
    .values({
      ...rest,
      userId: req.userId!,
      budgetLimit: bl != null ? String(bl) : null,
      autoLimit: autoLimit ?? false,
      limitReserve: String(limitReserve ?? 0),
    })
    .returning();

  res.status(201).json({ data: { ...normalizeCategory(row), hasFixedExpenses: false } });
}

export async function updateCategory(req: AuthRequest, res: Response): Promise<void> {
  const id = req.params["id"] as string;

  const [existing] = await db
    .select({ userId: categories.userId, shared: categories.shared, name: categories.name })
    .from(categories)
    .where(eq(categories.id, id))
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "Category not found" });
    return;
  }
  if (existing.userId !== req.userId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const body = updateSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Validation error", details: body.error.errors });
    return;
  }

  if (Object.keys(body.data).length === 0) {
    res.status(400).json({ error: "No fields to update" });
    return;
  }

  // A shared category is paired across members by name and carries one common
  // limit, so it can't be renamed or switched to the auto limit while shared.
  if (existing.shared) {
    const renamed = body.data.name !== undefined && body.data.name.trim().toLowerCase() !== existing.name.trim().toLowerCase();
    if (renamed || body.data.autoLimit === true) {
      res.status(400).json({ error: "Shared category can't be renamed or use auto limit. Stop sharing it first." });
      return;
    }
  }

  const { budgetLimit: bl, autoLimit, limitReserve, ...fields } = body.data
  const setData: Record<string, unknown> = { ...fields };
  if (body.data.budgetLimit !== undefined) setData.budgetLimit = bl != null ? String(bl) : null;
  if (autoLimit !== undefined) setData.autoLimit = autoLimit;
  if (limitReserve !== undefined) setData.limitReserve = String(limitReserve);

  const [updated] = await db
    .update(categories)
    .set(setData)
    .where(and(eq(categories.id, id), eq(categories.userId, req.userId!)))
    .returning();

  if (existing.shared && bl !== undefined) {
    await propagateSharedLimit(req.userId!, existing.name, bl != null ? String(bl) : null);
  }

  // When auto_limit is being enabled — or its reserve changed on a category that
  // already uses it — immediately recalculate from existing fixed expenses
  if (autoLimit === true || (limitReserve !== undefined && updated?.autoLimit)) {
    await recalculateCategoryLimit(id, req.userId!);
    const [refreshed] = await db.select().from(categories).where(eq(categories.id, id)).limit(1);
    const [hasFixed] = await db
      .select({ categoryId: transactions.categoryId })
      .from(transactions)
      .where(and(eq(transactions.categoryId, id), eq(transactions.isFixed, true), eq(transactions.type, "expense")))
      .limit(1);
    res.json({ data: { ...normalizeCategory(refreshed), hasFixedExpenses: !!hasFixed } });
    return;
  }

  const [hasFixed] = await db
    .select({ categoryId: transactions.categoryId })
    .from(transactions)
    .where(and(eq(transactions.categoryId, id), eq(transactions.isFixed, true), eq(transactions.type, "expense")))
    .limit(1);
  res.json({ data: { ...normalizeCategory(updated), hasFixedExpenses: !!hasFixed } });
}

export async function deleteAllCategories(req: AuthRequest, res: Response): Promise<void> {
  // FK onDelete:'set null' handles transactions automatically
  await db.delete(categories).where(eq(categories.userId, req.userId!));
  res.json({ success: true });
}

const shareSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(200),
  shared: z.boolean(),
});

export async function setCategoriesShared(req: AuthRequest, res: Response): Promise<void> {
  const body = shareSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Validation error" });
    return;
  }
  try {
    if (body.data.shared) await shareCategories(req.userId!, body.data.ids);
    else await unshareCategories(req.userId!, body.data.ids);
  } catch (err) {
    if (err instanceof NotSharingError) {
      res.status(400).json({ error: "Zdieľať kategórie možno len v domácnosti so zapnutým zdieľaním." });
      return;
    }
    throw err;
  }
  res.json({ success: true });
}

const reorderSchema = z.object({
  items: z.array(z.object({ id: z.string().uuid(), order: z.number().int().min(0) })).min(1),
});

export async function reorderCategories(req: AuthRequest, res: Response): Promise<void> {
  const body = reorderSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Validation error" });
    return;
  }

  const ids = body.data.items.map((i) => i.id);
  const owned = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(inArray(categories.id, ids), eq(categories.userId, req.userId!)));

  if (owned.length !== ids.length) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  await Promise.all(
    body.data.items.map(({ id, order }) =>
      db.update(categories).set({ sortOrder: order }).where(eq(categories.id, id))
    )
  );

  res.json({ success: true });
}

export async function deleteCategory(req: AuthRequest, res: Response): Promise<void> {
  const id = req.params["id"] as string;

  const [existing] = await db
    .select({ userId: categories.userId })
    .from(categories)
    .where(eq(categories.id, id))
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "Category not found" });
    return;
  }
  if (existing.userId !== req.userId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const refs = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(eq(transactions.categoryId, id))
    .limit(1);

  if (refs.length > 0) {
    res.status(400).json({
      error: "Cannot delete category with existing transactions. Reassign or delete them first.",
    });
    return;
  }

  await db.delete(categories).where(eq(categories.id, id));
  res.json({ success: true });
}
