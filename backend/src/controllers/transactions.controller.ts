import { Response } from "express";
import { and, eq, gte, lt, lte, or, inArray, isNull, sql, count, type SQL } from "drizzle-orm";
import { z } from "zod";
import { zodDetails } from "../lib/validation";
import { db } from "../db";
import { transactions, categories, users, householdMembers } from "../db/schema";
import { AuthRequest } from "../middleware/authenticate";
import { recalculateCategoryLimit } from "./categories.controller";
import { evaluateAchievements } from "../services/achievements.service";
import { familyMemberIds } from "../lib/household";
import { escapeLike } from "../lib/search";
import { localDateISO } from "../lib/localDate";
import { nextStreak } from "../lib/streak";
import { fixedDayOfMonth, isFixedDue, isActiveInMonth, cumulativeBalanceFromRows } from "../lib/recurring";

// YYYY-MM-DD that is also a real calendar date (the bare regex let 2026-02-30
// through to Postgres, which rejects it with a 500).
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD")
  .refine((v) => {
    const d = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, "Invalid calendar date");

const createSchema = z.object({
  categoryId: z.guid().nullable().optional(),
  type: z.enum(["income", "expense"]),
  // numeric(12,2) overflows above this
  amount: z.number().positive().max(9_999_999_999.99),
  description: z.string().max(500).optional(),
  date: isoDate,
  isFixed: z.boolean().optional().default(false),
});

const updateSchema = createSchema.partial();

const listQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
  type: z.enum(["income", "expense"]).optional(),
  isFixed: z.enum(["true", "false"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
  scope: z.enum(["personal", "family"]).optional().default("personal"),
  // Search: text in description/note/category name, amount range, date range
  q: z.string().trim().min(1).max(100).optional(),
  minAmount: z.coerce.number().min(0).optional(),
  maxAmount: z.coerce.number().min(0).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
});

const scopeSchema = z.enum(["personal", "family"]).optional().default("personal");

const summaryQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "month must be YYYY-MM"),
  scope: scopeSchema,
});

const balanceAtMonthSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  scope: scopeSchema,
});

function monthRange(month: string): { start: string; end: string } {
  const [y, m] = month.split("-").map(Number);
  const start = `${y}-${String(m).padStart(2, "0")}-01`;
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  return { start, end: next };
}

async function resolveUserHousehold(userId: string) {
  const [u] = await db
    .select({ householdId: users.householdId, householdEnabled: users.householdEnabled })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return u;
}

// Earliest trackingStartDate/createdAt across ALL members of a household — used so
// a "family" scope balance sums each member's FULL history, not just from when the
// currently logged-in member happened to join.
async function getFamilyStartDate(householdId: number): Promise<string> {
  const rows = await db
    .select({ trackingStartDate: users.trackingStartDate, createdAt: users.createdAt })
    .from(householdMembers)
    .innerJoin(users, eq(householdMembers.userId, users.id))
    .where(and(eq(householdMembers.householdId, householdId), eq(users.householdId, householdId)));

  const dates = rows.map((r) => r.trackingStartDate ?? localDateISO(r.createdAt));
  if (dates.length === 0) return localDateISO();
  return dates.reduce((min, d) => (d < min ? d : min));
}

function buildFilters(
  owner: SQL,
  month?: string,
  type?: string,
  isFixed?: string,
  search?: { q?: string; minAmount?: number; maxAmount?: number; from?: string; to?: string },
) {
  const filters: SQL[] = [owner];
  if (month) {
    const { start, end } = monthRange(month);
    filters.push(gte(transactions.date, start));
    filters.push(lt(transactions.date, end));
  }
  if (type) {
    filters.push(eq(transactions.type, type));
  }
  if (isFixed !== undefined) {
    filters.push(eq(transactions.isFixed, isFixed === "true"));
  }
  if (search?.q) {
    const pattern = `%${escapeLike(search.q)}%`;
    // Recurring expenses keep label, note and due day as JSON in the description:
    // the key names are stripped so searching "l" or "n" does not match every one.
    filters.push(or(
      sql`regexp_replace(${transactions.description}, '"[lnd]":', ' ', 'g') ilike ${pattern}`,
      sql`${categories.name} ilike ${pattern}`,
    )!);
  }
  if (search?.minAmount !== undefined) filters.push(gte(transactions.amount, String(search.minAmount)));
  if (search?.maxAmount !== undefined) filters.push(lte(transactions.amount, String(search.maxAmount)));
  if (search?.from) filters.push(gte(transactions.date, search.from));
  if (search?.to) filters.push(lte(transactions.date, search.to));
  return filters;
}

export async function listTransactions(req: AuthRequest, res: Response): Promise<void> {
  const query = listQuerySchema.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: "Invalid query params", details: zodDetails(query.error) });
    return;
  }

  const { month, type, isFixed, limit, offset, scope, q, minAmount, maxAmount, from, to } = query.data;

  // Family scope lists every sharing member's rows (read-only context for the
  // dashboard); it silently falls back to the caller's own rows when they are
  // not in a household or have sharing switched off.
  let owner: SQL = eq(transactions.userId, req.userId!);
  if (scope === "family") {
    const ctx = await resolveUserHousehold(req.userId!);
    if (ctx?.householdEnabled && ctx.householdId) {
      owner = inArray(transactions.userId, familyMemberIds(ctx.householdId));
    }
  }
  const filters = buildFilters(owner, month, type, isFixed, { q, minAmount, maxAmount, from, to });

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: transactions.id,
        userId: transactions.userId,
        categoryId: transactions.categoryId,
        type: transactions.type,
        amount: transactions.amount,
        description: transactions.description,
        date: transactions.date,
        isFixed: transactions.isFixed,
        endedOn: transactions.endedOn,
        createdAt: transactions.createdAt,
        updatedAt: transactions.updatedAt,
        categoryName: categories.name,
        categoryColor: categories.color,
        categoryIcon: categories.icon,
        created_by: transactions.createdBy,
      })
      .from(transactions)
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .where(and(...filters))
      .orderBy(sql`${transactions.date} DESC, ${transactions.createdAt} DESC`)
      .limit(limit)
      .offset(offset),

    db
      .select({ total: count() })
      .from(transactions)
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .where(and(...filters)),
  ]);

  res.json({ data: rows.map(normalizeAmount), total: Number(total) });
}

// A category id from the request must belong to the caller — otherwise another
// user's category (ids are visible in household stats) could be attached, and
// its name/colour/icon would leak back through the join.
async function ownsCategory(categoryId: string | null | undefined, userId: string): Promise<boolean> {
  if (!categoryId) return true;
  const [row] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.id, categoryId), eq(categories.userId, userId)))
    .limit(1);
  return !!row;
}

export async function createTransaction(req: AuthRequest, res: Response): Promise<void> {
  const body = createSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Validation error", details: zodDetails(body.error) });
    return;
  }
  if (!(await ownsCategory(body.data.categoryId, req.userId!))) {
    res.status(400).json({ error: "Invalid category" });
    return;
  }

  const { amount, categoryId, ...rest } = body.data;
  const userCtx = await resolveUserHousehold(req.userId!);

  const [row] = await db
    .insert(transactions)
    .values({
      ...rest,
      amount: String(amount),
      categoryId: categoryId ?? null,
      userId: req.userId!,
      createdBy: req.userId!,
      householdId: userCtx?.householdEnabled && userCtx?.householdId ? userCtx.householdId : null,
    })
    .returning();

  const withCategory = await fetchWithCategory(row.id);
  // Update streak first (achievements read longestStreak), then evaluate achievements.
  // Awaited (not fire-and-forget) so the response can report freshly-unlocked achievements.
  let newlyUnlockedAchievements: string[] = [];
  try {
    // Streaks measure "did this user actually use the app today", so they're
    // keyed off the server-recorded creation timestamp, not the user-editable
    // `date` field (which represents when the transaction occurred and can
    // legitimately be backdated for a real receipt — but was also a way to
    // fabricate an instant streak/veteran badge with zero real usage; see
    // security audit run-1).
    const todayServer = localDateISO(row.createdAt);
    await updateStreakAndBadges(req.userId!, todayServer);
    ({ newlyUnlocked: newlyUnlockedAchievements } = await evaluateAchievements(req.userId!));
  } catch (err) {
    console.error('streak/achievement update failed:', err);
  }
  if (row.isFixed && row.categoryId) {
    recalculateCategoryLimit(row.categoryId, req.userId!).catch(err => console.error('auto-limit recalc failed:', err));
  }
  res.status(201).json({ data: normalizeAmount(withCategory), newBadges: [], newlyUnlockedAchievements });
}

const bulkSchema = z.object({
  items: z.array(createSchema.omit({ isFixed: true })).min(1).max(500),
});

// CSV import: one insert and one streak/achievement pass instead of a request
// (each with its own evaluation) per row. Only one-off rows — fixed expenses
// keep going through createTransaction so the auto-limit stays in sync.
export async function createTransactionsBulk(req: AuthRequest, res: Response): Promise<void> {
  const body = bulkSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Validation error", details: zodDetails(body.error) });
    return;
  }

  const categoryIds = [...new Set(body.data.items.map((i) => i.categoryId).filter((id): id is string => !!id))];
  if (categoryIds.length > 0) {
    const owned = await db
      .select({ id: categories.id })
      .from(categories)
      .where(and(inArray(categories.id, categoryIds), eq(categories.userId, req.userId!)));
    if (owned.length !== categoryIds.length) {
      res.status(400).json({ error: "Invalid category" });
      return;
    }
  }

  const userCtx = await resolveUserHousehold(req.userId!);
  const householdId = userCtx?.householdEnabled && userCtx?.householdId ? userCtx.householdId : null;

  const rows = await db
    .insert(transactions)
    .values(body.data.items.map(({ amount, categoryId, ...rest }) => ({
      ...rest,
      amount: String(amount),
      categoryId: categoryId ?? null,
      isFixed: false,
      userId: req.userId!,
      createdBy: req.userId!,
      householdId,
    })))
    .returning({ createdAt: transactions.createdAt });

  let newlyUnlockedAchievements: string[] = [];
  try {
    await updateStreakAndBadges(req.userId!, localDateISO(rows[0].createdAt));
    ({ newlyUnlocked: newlyUnlockedAchievements } = await evaluateAchievements(req.userId!));
  } catch (err) {
    console.error('streak/achievement update failed:', err);
  }
  res.status(201).json({ created: rows.length, newlyUnlockedAchievements });
}

const duplicatesSchema = z.object({
  items: z.array(z.object({ date: isoDate, type: z.enum(["income", "expense"]), amount: z.number().positive() })).min(1).max(500),
});

// CSV import: which of the rows already exist (same date, type and amount among
// the caller's one-off transactions). Bank descriptions rarely match what was
// typed by hand, so they are not compared; the result is a hint, not a block.
export async function findDuplicateTransactions(req: AuthRequest, res: Response): Promise<void> {
  const body = duplicatesSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Validation error" });
    return;
  }
  const dates = body.data.items.map((i) => i.date).sort();
  const existing = await db
    .select({ date: transactions.date, type: transactions.type, amount: transactions.amount })
    .from(transactions)
    .where(and(
      eq(transactions.userId, req.userId!),
      eq(transactions.isFixed, false),
      sql`${transactions.date} >= ${dates[0]}`,
      sql`${transactions.date} <= ${dates[dates.length - 1]}`,
    ));
  const keys = new Set(existing.map((e) => `${e.date}|${e.type}|${Number(e.amount).toFixed(2)}`));
  const duplicates = body.data.items.flatMap((i, idx) => (keys.has(`${i.date}|${i.type}|${i.amount.toFixed(2)}`) ? [idx] : []));
  res.json({ duplicates });
}

const bulkIdsSchema = z.object({ ids: z.array(z.guid()).min(1).max(500) });
const bulkCategorySchema = bulkIdsSchema.extend({ categoryId: z.guid().nullable() });

// Bulk edit/delete are limited to the caller's one-off rows; fixed items change
// the auto-limit and are managed individually.
export async function bulkSetTransactionCategory(req: AuthRequest, res: Response): Promise<void> {
  const body = bulkCategorySchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Validation error" });
    return;
  }
  if (!(await ownsCategory(body.data.categoryId, req.userId!))) {
    res.status(400).json({ error: "Invalid category" });
    return;
  }
  const updated = await db
    .update(transactions)
    .set({ categoryId: body.data.categoryId })
    .where(and(inArray(transactions.id, body.data.ids), eq(transactions.userId, req.userId!), eq(transactions.isFixed, false)))
    .returning({ id: transactions.id });
  res.json({ updated: updated.length });
}

export async function bulkDeleteTransactions(req: AuthRequest, res: Response): Promise<void> {
  const body = bulkIdsSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Validation error" });
    return;
  }
  const removed = await db
    .delete(transactions)
    .where(and(inArray(transactions.id, body.data.ids), eq(transactions.userId, req.userId!), eq(transactions.isFixed, false)))
    .returning({ id: transactions.id });
  res.json({ deleted: removed.length });
}

// A recurring series is the user's rows of one type with the same description:
// a price change adds a later row to it, so history lives in the series.
function seriesWhere(userId: string, type: string, description: string | null) {
  return and(
    eq(transactions.userId, userId),
    eq(transactions.type, type),
    eq(transactions.isFixed, true),
    description === null ? isNull(transactions.description) : eq(transactions.description, description),
  );
}

export async function updateTransaction(req: AuthRequest, res: Response): Promise<void> {
  const id = req.params["id"] as string;

  const [existing] = await db
    .select({ userId: transactions.userId, categoryId: transactions.categoryId, isFixed: transactions.isFixed, type: transactions.type, description: transactions.description })
    .from(transactions)
    .where(eq(transactions.id, id))
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "Transaction not found" });
    return;
  }
  if (existing.userId !== req.userId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const body = updateSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Validation error", details: zodDetails(body.error) });
    return;
  }
  if (!(await ownsCategory(body.data.categoryId, req.userId!))) {
    res.status(400).json({ error: "Invalid category" });
    return;
  }

  const { amount, categoryId, ...rest } = body.data;
  const patch: Record<string, unknown> = { ...rest, updatedAt: new Date() };
  if (amount !== undefined) patch.amount = String(amount);
  if (categoryId !== undefined) patch.categoryId = categoryId;

  // Renaming or recategorising a recurring item applies to its whole series —
  // otherwise the older rows would be left behind as a separate item. The amount
  // stays on this row only (a price change is a new row, see changeFixedPrice).
  const seriesCategories = new Set<string>();
  if (existing.isFixed) {
    const descriptionChanged = rest.description !== undefined && rest.description !== existing.description;
    const categoryChanged = categoryId !== undefined && categoryId !== existing.categoryId;
    if (descriptionChanged || categoryChanged) {
      const seriesPatch: Record<string, unknown> = { updatedAt: new Date() };
      if (descriptionChanged) seriesPatch.description = rest.description;
      if (categoryChanged) seriesPatch.categoryId = categoryId;
      const old = await db.select({ categoryId: transactions.categoryId }).from(transactions).where(seriesWhere(req.userId!, existing.type, existing.description));
      for (const o of old) if (o.categoryId) seriesCategories.add(o.categoryId);
      await db.update(transactions).set(seriesPatch).where(seriesWhere(req.userId!, existing.type, existing.description));
      delete patch.description;
      delete patch.categoryId;
    }
  }

  await db
    .update(transactions)
    .set(patch)
    .where(and(eq(transactions.id, id), eq(transactions.userId, req.userId!)));

  const withCategory = await fetchWithCategory(id);

  if (existing.isFixed) {
    const oldCatId = existing.categoryId;
    const newCatId = categoryId !== undefined ? categoryId : oldCatId;
    const toRecalc = new Set<string>(seriesCategories);
    if (oldCatId) toRecalc.add(oldCatId);
    if (newCatId) toRecalc.add(newCatId);
    for (const catId of toRecalc) {
      recalculateCategoryLimit(catId, req.userId!).catch(err => console.error('auto-limit recalc failed:', err));
    }
  }

  res.json({ data: normalizeAmount(withCategory) });
}

export async function deleteTransaction(req: AuthRequest, res: Response): Promise<void> {
  const id = req.params["id"] as string;

  const [existing] = await db
    .select({ userId: transactions.userId, categoryId: transactions.categoryId, isFixed: transactions.isFixed, type: transactions.type, description: transactions.description })
    .from(transactions)
    .where(eq(transactions.id, id))
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "Transaction not found" });
    return;
  }
  if (existing.userId !== req.userId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  // Deleting a recurring item removes the whole series (all price changes);
  // ending it keeps the history — see endFixedSeries.
  const removed = existing.isFixed
    ? await db.delete(transactions).where(seriesWhere(req.userId!, existing.type, existing.description)).returning({ categoryId: transactions.categoryId })
    : await db.delete(transactions).where(eq(transactions.id, id)).returning({ categoryId: transactions.categoryId });

  if (existing.isFixed) {
    const cats = new Set(removed.map((r) => r.categoryId).filter((c): c is string => !!c));
    if (existing.categoryId) cats.add(existing.categoryId);
    for (const catId of cats) {
      recalculateCategoryLimit(catId, req.userId!).catch(err => console.error('auto-limit recalc failed:', err));
    }
  }

  res.json({ success: true });
}

const yearMonth = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const priceChangeSchema = z.object({
  amount: z.number().positive().max(9_999_999_999.99),
  from: yearMonth,
});
const endSchema = z.object({ lastMonth: yearMonth.nullable() });

async function loadSeries(req: AuthRequest, res: Response) {
  const id = req.params["id"] as string;
  const [row] = await db
    .select({ userId: transactions.userId, type: transactions.type, description: transactions.description, isFixed: transactions.isFixed })
    .from(transactions)
    .where(eq(transactions.id, id))
    .limit(1);
  if (!row) { res.status(404).json({ error: "Transaction not found" }); return null; }
  if (row.userId !== req.userId) { res.status(403).json({ error: "Forbidden" }); return null; }
  if (!row.isFixed) { res.status(400).json({ error: "Not a recurring item" }); return null; }
  return row;
}

// A new price from a given month: the series gets a later row, older months keep
// the old amount. A change in the month of the latest row simply corrects it.
export async function changeFixedPrice(req: AuthRequest, res: Response): Promise<void> {
  const body = priceChangeSchema.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Validation error" }); return; }
  const series = await loadSeries(req, res);
  if (!series) return;

  const [latest] = await db
    .select()
    .from(transactions)
    .where(seriesWhere(series.userId, series.type, series.description))
    .orderBy(sql`${transactions.date} DESC, ${transactions.createdAt} DESC`)
    .limit(1);

  const fromDate = `${body.data.from}-01`;
  if (body.data.from < latest.date.slice(0, 7)) {
    res.status(400).json({ error: "Price already changes later; edit it from that month." });
    return;
  }
  if (latest.endedOn && fromDate >= latest.endedOn) {
    res.status(400).json({ error: "The item has ended before that month." });
    return;
  }

  let rowId = latest.id;
  if (body.data.from === latest.date.slice(0, 7)) {
    await db.update(transactions).set({ amount: String(body.data.amount), updatedAt: new Date() }).where(eq(transactions.id, latest.id));
  } else {
    const [created] = await db
      .insert(transactions)
      .values({
        userId: latest.userId,
        categoryId: latest.categoryId,
        type: latest.type,
        amount: String(body.data.amount),
        description: latest.description,
        date: fromDate,
        isFixed: true,
        endedOn: latest.endedOn,
        createdBy: req.userId!,
        householdId: latest.householdId,
      })
      .returning({ id: transactions.id });
    rowId = created.id;
  }

  const withCategory = await fetchWithCategory(rowId);
  if (latest.categoryId) recalculateCategoryLimit(latest.categoryId, req.userId!).catch(err => console.error('auto-limit recalc failed:', err));
  res.json({ data: normalizeAmount(withCategory) });
}

// Ends a recurring series after `lastMonth` (inclusive); null brings it back.
// Every row of the series carries the end, so any month resolves it correctly.
export async function endFixedSeries(req: AuthRequest, res: Response): Promise<void> {
  const body = endSchema.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Validation error" }); return; }
  const series = await loadSeries(req, res);
  if (!series) return;

  let endedOn: string | null = null;
  if (body.data.lastMonth) {
    const [y, m] = body.data.lastMonth.split("-").map(Number);
    endedOn = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  }
  const rows = await db
    .update(transactions)
    .set({ endedOn, updatedAt: new Date() })
    .where(seriesWhere(series.userId, series.type, series.description))
    .returning({ categoryId: transactions.categoryId });

  for (const catId of new Set(rows.map((r) => r.categoryId).filter((c): c is string => !!c))) {
    recalculateCategoryLimit(catId, req.userId!).catch(err => console.error('auto-limit recalc failed:', err));
  }
  res.json({ success: true, endedOn });
}

export async function getSummary(req: AuthRequest, res: Response): Promise<void> {
  const query = summaryQuerySchema.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: "Invalid query params", details: zodDetails(query.error) });
    return;
  }

  const { month, scope } = query.data;
  const { start, end } = monthRange(month);

  let baseFilter = eq(transactions.userId, req.userId!);
  if (scope === "family") {
    const userCtx = await resolveUserHousehold(req.userId!);
    if (userCtx?.householdEnabled && userCtx?.householdId) {
      baseFilter = inArray(transactions.userId, familyMemberIds(userCtx.householdId));
    }
  }

  const rows = await db
    .select({
      categoryId: transactions.categoryId,
      type: transactions.type,
      categoryName: categories.name,
      categoryColor: categories.color,
      total: sql<string>`COALESCE(SUM(${transactions.amount}), 0)`,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(
      and(
        baseFilter,
        gte(transactions.date, start),
        lt(transactions.date, end)
      )
    )
    .groupBy(
      transactions.categoryId,
      transactions.type,
      categories.name,
      categories.color
    );

  const totalIncome = rows
    .filter((r) => r.type === "income")
    .reduce((acc, r) => acc + parseFloat(r.total), 0);

  const totalExpenses = rows
    .filter((r) => r.type === "expense")
    .reduce((acc, r) => acc + parseFloat(r.total), 0);

  const byCategory = rows.map((r) => {
    const total = parseFloat(r.total);
    const base = r.type === "income" ? totalIncome : totalExpenses;
    const percentage = base > 0 ? Math.round((total / base) * 10000) / 100 : 0;
    return {
      categoryId: r.categoryId,
      name: r.categoryName ?? "Uncategorized",
      color: r.categoryColor ?? "#6B7280",
      type: r.type,
      total,
      percentage,
    };
  });

  res.json({
    totalIncome,
    totalExpenses,
    balance: totalIncome - totalExpenses,
    byCategory,
  });
}

// Cumulative balance from startDate through the end of (year, month), built
// month by month with the SAME rules as the monthly cards: one-off rows count in
// the month they are dated, while a recurring (isFixed) row is entered once and
// counts in every month from its own date onwards — each series (user +
// description) via its latest occurrence at or before that month's end, and
// recurring expenses only once their due day has arrived. Summing every row
// once (the old behaviour) under-counted recurring items in all but their first
// month, so the balance drifted away from the monthly income/expense figures.
async function cumulativeBalance(
  baseFilter: SQL,
  startDate: string,
  year: number,
  month: number,
): Promise<number> {
  const target = year * 12 + (month - 1);
  const first = Number(startDate.slice(0, 4)) * 12 + (Number(startDate.slice(5, 7)) - 1);
  if (!(first <= target)) return 0;
  // Guard against absurd start dates; ~100 years of months is more than enough.
  const firstMonth = Math.max(first, target - 1200);
  const { end } = monthRange(`${year}-${String(month).padStart(2, "0")}`);

  const oneOff = await db
    .select({
      ym: sql<string>`to_char(${transactions.date}, 'YYYY-MM')`,
      type: transactions.type,
      total: sql<string>`COALESCE(SUM(${transactions.amount}), 0)`,
    })
    .from(transactions)
    .where(and(baseFilter, gte(transactions.date, startDate), lt(transactions.date, end), eq(transactions.isFixed, false)))
    .groupBy(sql`to_char(${transactions.date}, 'YYYY-MM')`, transactions.type);

  const oneOffByMonth = new Map<string, { income: number; expense: number }>();
  for (const r of oneOff) {
    const entry = oneOffByMonth.get(r.ym) ?? { income: 0, expense: 0 };
    if (r.type === "income") entry.income += parseFloat(r.total);
    else entry.expense += parseFloat(r.total);
    oneOffByMonth.set(r.ym, entry);
  }

  const fixedRows = await db
    .select({
      userId: transactions.userId,
      type: transactions.type,
      description: transactions.description,
      amount: transactions.amount,
      date: transactions.date,
      endedOn: transactions.endedOn,
    })
    .from(transactions)
    .where(and(baseFilter, eq(transactions.isFixed, true), lt(transactions.date, end)))
    // Same tie-break as the cards and the household stats: of two rows of one
    // series on the same date, the later-created one wins.
    .orderBy(transactions.date, transactions.createdAt, transactions.id);

  return cumulativeBalanceFromRows(oneOffByMonth, fixedRows, firstMonth, target, new Date());
}

export async function getBalanceAtMonth(req: AuthRequest, res: Response): Promise<void> {
  const query = balanceAtMonthSchema.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: "Invalid query params", details: zodDetails(query.error) });
    return;
  }

  const { year, month, scope } = query.data;

  const [userRow] = await db
    .select({
      householdId: users.householdId,
      householdEnabled: users.householdEnabled,
      trackingStartDate: users.trackingStartDate,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, req.userId!))
    .limit(1);

  if (!userRow) { res.status(404).json({ error: "User not found" }); return; }

  const isFamily = scope === "family" && !!userRow.householdEnabled && !!userRow.householdId;

  const baseFilter = isFamily
    ? inArray(transactions.userId, familyMemberIds(userRow.householdId!))
    : eq(transactions.userId, req.userId!);

  const startDate = isFamily
    ? await getFamilyStartDate(userRow.householdId!)
    : userRow.trackingStartDate ?? localDateISO(userRow.createdAt);

  res.json({ balance: await cumulativeBalance(baseFilter, startDate, year, month) });
}

export async function getSummaryCards(req: AuthRequest, res: Response): Promise<void> {
  const query = balanceAtMonthSchema.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: "Invalid query params", details: zodDetails(query.error) });
    return;
  }

  const { year, month, scope } = query.data;
  const monthStr = `${year}-${String(month).padStart(2, "0")}`;
  const { start: monthStart, end: monthEnd } = monthRange(monthStr);

  const [userRow] = await db
    .select({
      householdId: users.householdId,
      householdEnabled: users.householdEnabled,
      trackingStartDate: users.trackingStartDate,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, req.userId!))
    .limit(1);

  if (!userRow) { res.status(404).json({ error: "User not found" }); return; }

  const isFamily = scope === "family" && !!userRow.householdEnabled && !!userRow.householdId;

  const baseFilter = isFamily
    ? inArray(transactions.userId, familyMemberIds(userRow.householdId!))
    : eq(transactions.userId, req.userId!);

  const startDate = isFamily
    ? await getFamilyStartDate(userRow.householdId!)
    : userRow.trackingStartDate ?? localDateISO(userRow.createdAt);

  // Balance: cumulative from tracking start to end of requested month, built
  // month by month with the same recurring-item rules as the figures below.
  const balance = await cumulativeBalance(baseFilter, startDate, year, month);

  // Month income (non-recurring) & variable expenses: exact date match within the month.
  // Recurring (isFixed) rows are excluded here and handled separately below, since a
  // recurring row is entered once and must count in every subsequent month too.
  const monthRows = await db
    .select({
      type: transactions.type,
      total: sql<string>`COALESCE(SUM(${transactions.amount}), 0)`,
    })
    .from(transactions)
    .where(and(
      baseFilter,
      gte(transactions.date, monthStart),
      lt(transactions.date, monthEnd),
      eq(transactions.isFixed, false),
    ))
    .groupBy(transactions.type);

  const nonRecurringIncome = monthRows.filter(r => r.type === "income").reduce((acc, r) => acc + parseFloat(r.total), 0);
  const variableExpenses = monthRows.filter(r => r.type === "expense").reduce((acc, r) => acc + parseFloat(r.total), 0);

  // Recurring income: entered once and expected to recur every month without the
  // user re-adding it — mirrors the fixed (recurring) expense handling below and the
  // frontend's useIncomes carry-forward logic. Each distinct recurring income (per
  // user, keyed by its description) counts once per month using its most recent
  // occurrence at or before the end of the requested month. Unlike fixed expenses,
  // recurring income is not gated by a due day — the frontend always carries it
  // forward in full once its month has arrived.
  const latestRecurringIncomeRows = await db
    .selectDistinctOn([transactions.userId, transactions.description], {
      amount: transactions.amount,
      endedOn: transactions.endedOn,
    })
    .from(transactions)
    .where(and(
      baseFilter,
      eq(transactions.type, "income"),
      eq(transactions.isFixed, true),
      lt(transactions.date, monthEnd),
    ))
    .orderBy(transactions.userId, transactions.description, sql`${transactions.date} DESC`, sql`${transactions.createdAt} DESC`, sql`${transactions.id} DESC`);

  const recurringIncome = latestRecurringIncomeRows
    .filter(r => isActiveInMonth(r.endedOn, year, month))
    .reduce((acc, r) => acc + parseFloat(r.amount), 0);

  const income = Math.round((nonRecurringIncome + recurringIncome) * 100) / 100;

  // Fixed (recurring) expenses: entered once and expected to recur every month
  // without the user re-adding them — so each distinct bill (per user, keyed by
  // its description) counts once per month using its most recent occurrence at
  // or before the end of the requested month, not every historical row summed.
  const latestFixedRows = await db
    .selectDistinctOn([transactions.userId, transactions.description], {
      amount: transactions.amount,
      description: transactions.description,
      date: transactions.date,
      endedOn: transactions.endedOn,
    })
    .from(transactions)
    .where(and(
      baseFilter,
      eq(transactions.type, "expense"),
      eq(transactions.isFixed, true),
      lt(transactions.date, monthEnd),
    ))
    .orderBy(transactions.userId, transactions.description, sql`${transactions.date} DESC`, sql`${transactions.createdAt} DESC`, sql`${transactions.id} DESC`);

  // A fixed expense only becomes "spent" once its due day in the requested
  // month has actually arrived — mirrors the frontend's isFixedExpenseDue
  // (useFixedExpenses.ts). Months fully in the past always count in full.
  const today = new Date();
  const fixedExpenses = latestFixedRows.filter(r => isActiveInMonth(r.endedOn, year, month)).reduce(
    (acc, r) => isFixedDue(fixedDayOfMonth(r.description, r.date), year, month, today) ? acc + parseFloat(r.amount) : acc,
    0,
  );

  const expenses = Math.round((variableExpenses + fixedExpenses) * 100) / 100;
  const savingsRate = income > 0 ? Math.round((income - expenses) / income * 100) : 0;

  res.json({ balance, income, expenses, savingsRate });
}

async function fetchWithCategory(id: string) {
  const [row] = await db
    .select({
      id: transactions.id,
      userId: transactions.userId,
      categoryId: transactions.categoryId,
      type: transactions.type,
      amount: transactions.amount,
      description: transactions.description,
      date: transactions.date,
      isFixed: transactions.isFixed,
      createdAt: transactions.createdAt,
      updatedAt: transactions.updatedAt,
      categoryName: categories.name,
      categoryColor: categories.color,
      categoryIcon: categories.icon,
      created_by: transactions.createdBy,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(eq(transactions.id, id));
  return row;
}

function normalizeAmount<T extends { amount: unknown }>(row: T): T {
  return { ...row, amount: parseFloat(row.amount as string) };
}

const BADGE_DEFS: { id: string; check: (txCount: number, streak: number, longestStreak: number) => boolean }[] = [
  { id: 'first_transaction',  check: (n) => n >= 1 },
  { id: 'streak_7',           check: (_, s) => s >= 7 },
  { id: 'streak_30',          check: (_, s) => s >= 30 },
  { id: 'transactions_10',    check: (n) => n >= 10 },
  { id: 'transactions_50',    check: (n) => n >= 50 },
  { id: 'transactions_100',   check: (n) => n >= 100 },
];

async function updateStreakAndBadges(userId: string, txDate: string): Promise<string[]> {
  const [[user], [{ txCount }]] = await Promise.all([
    db.select({
      currentStreak: users.currentStreak,
      longestStreak: users.longestStreak,
      lastActivityDate: users.lastActivityDate,
      badges: users.badges,
    }).from(users).where(eq(users.id, userId)).limit(1),
    db.select({ txCount: count() }).from(transactions).where(eq(transactions.userId, userId)),
  ]);
  if (!user) return [];

  const today = txDate;
  const streak = nextStreak(user.currentStreak ?? 0, user.lastActivityDate, today);

  const longest = Math.max(user.longestStreak ?? 0, streak);

  const n = Number(txCount);

  const earned = new Set(user.badges ?? []);
  const newBadges: string[] = [];
  for (const { id, check } of BADGE_DEFS) {
    if (!earned.has(id) && check(n, streak, longest)) {
      earned.add(id);
      newBadges.push(id);
    }
  }

  await db.update(users).set({
    currentStreak: streak,
    longestStreak: longest,
    lastActivityDate: today,
    badges: Array.from(earned),
  }).where(eq(users.id, userId));

  return newBadges;
}
