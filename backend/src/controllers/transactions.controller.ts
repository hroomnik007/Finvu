import { Response } from "express";
import { and, eq, gte, lt, inArray, sql, count } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { transactions, categories, users, householdMembers } from "../db/schema";
import { AuthRequest } from "../middleware/authenticate";
import { recalculateCategoryLimit } from "./categories.controller";
import { evaluateAchievements } from "../services/achievements.service";
import { familyMemberIds } from "../lib/household";

const createSchema = z.object({
  categoryId: z.string().uuid().nullable().optional(),
  type: z.enum(["income", "expense"]),
  amount: z.number().positive(),
  description: z.string().max(500).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  isFixed: z.boolean().optional().default(false),
});

const updateSchema = createSchema.partial();

const listQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  type: z.enum(["income", "expense"]).optional(),
  isFixed: z.enum(["true", "false"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

const scopeSchema = z.enum(["personal", "family"]).optional().default("personal");

const summaryQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, "month must be YYYY-MM"),
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

  const dates = rows.map((r) => r.trackingStartDate ?? r.createdAt.toISOString().split("T")[0]);
  if (dates.length === 0) return new Date().toISOString().split("T")[0];
  return dates.reduce((min, d) => (d < min ? d : min));
}

function buildFilters(
  userId: string,
  month?: string,
  type?: string,
  isFixed?: string
) {
  const filters = [eq(transactions.userId, userId)];
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
  return filters;
}

export async function listTransactions(req: AuthRequest, res: Response): Promise<void> {
  const query = listQuerySchema.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: "Invalid query params", details: query.error.errors });
    return;
  }

  const { month, type, isFixed, limit, offset } = query.data;
  const filters = buildFilters(req.userId!, month, type, isFixed);

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
      .where(and(...filters)),
  ]);

  res.json({ data: rows.map(normalizeAmount), total: Number(total) });
}

export async function createTransaction(req: AuthRequest, res: Response): Promise<void> {
  const body = createSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Validation error", details: body.error.errors });
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
    const todayServer = row.createdAt.toISOString().slice(0, 10);
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

export async function updateTransaction(req: AuthRequest, res: Response): Promise<void> {
  const id = req.params["id"] as string;

  const [existing] = await db
    .select({ userId: transactions.userId, categoryId: transactions.categoryId, isFixed: transactions.isFixed })
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
    res.status(400).json({ error: "Validation error", details: body.error.errors });
    return;
  }

  const { amount, categoryId, ...rest } = body.data;
  const patch: Record<string, unknown> = { ...rest, updatedAt: new Date() };
  if (amount !== undefined) patch.amount = String(amount);
  if (categoryId !== undefined) patch.categoryId = categoryId;

  await db
    .update(transactions)
    .set(patch)
    .where(and(eq(transactions.id, id), eq(transactions.userId, req.userId!)));

  const withCategory = await fetchWithCategory(id);

  if (existing.isFixed) {
    const oldCatId = existing.categoryId;
    const newCatId = categoryId !== undefined ? categoryId : oldCatId;
    const toRecalc = new Set<string>();
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
    .select({ userId: transactions.userId, categoryId: transactions.categoryId, isFixed: transactions.isFixed })
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

  await db.delete(transactions).where(eq(transactions.id, id));

  if (existing.isFixed && existing.categoryId) {
    recalculateCategoryLimit(existing.categoryId, req.userId!).catch(err => console.error('auto-limit recalc failed:', err));
  }

  res.json({ success: true });
}

export async function getSummary(req: AuthRequest, res: Response): Promise<void> {
  const query = summaryQuerySchema.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: "Invalid query params", details: query.error.errors });
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

export async function getBalanceAtMonth(req: AuthRequest, res: Response): Promise<void> {
  const query = balanceAtMonthSchema.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: "Invalid query params", details: query.error.errors });
    return;
  }

  const { year, month, scope } = query.data;
  const monthStr = `${year}-${String(month).padStart(2, "0")}`;
  const { end } = monthRange(monthStr);

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
    : userRow.trackingStartDate ?? userRow.createdAt.toISOString().split("T")[0];

  const rows = await db
    .select({
      type: transactions.type,
      total: sql<string>`COALESCE(SUM(${transactions.amount}), 0)`,
    })
    .from(transactions)
    .where(
      and(
        baseFilter,
        gte(transactions.date, startDate),
        lt(transactions.date, end)
      )
    )
    .groupBy(transactions.type);

  const totalIncome = rows.filter(r => r.type === "income").reduce((acc, r) => acc + parseFloat(r.total), 0);
  const totalExpenses = rows.filter(r => r.type === "expense").reduce((acc, r) => acc + parseFloat(r.total), 0);

  res.json({ balance: totalIncome - totalExpenses });
}

export async function getSummaryCards(req: AuthRequest, res: Response): Promise<void> {
  const query = balanceAtMonthSchema.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: "Invalid query params", details: query.error.errors });
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
    : userRow.trackingStartDate ?? userRow.createdAt.toISOString().split("T")[0];

  // Balance: cumulative from tracking start to end of requested month
  const balanceRows = await db
    .select({
      type: transactions.type,
      total: sql<string>`COALESCE(SUM(${transactions.amount}), 0)`,
    })
    .from(transactions)
    .where(and(baseFilter, gte(transactions.date, startDate), lt(transactions.date, monthEnd)))
    .groupBy(transactions.type);

  const balanceIncome = balanceRows.filter(r => r.type === "income").reduce((acc, r) => acc + parseFloat(r.total), 0);
  const balanceExpenses = balanceRows.filter(r => r.type === "expense").reduce((acc, r) => acc + parseFloat(r.total), 0);
  const balance = Math.round((balanceIncome - balanceExpenses) * 100) / 100;

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
    })
    .from(transactions)
    .where(and(
      baseFilter,
      eq(transactions.type, "income"),
      eq(transactions.isFixed, true),
      lt(transactions.date, monthEnd),
    ))
    .orderBy(transactions.userId, transactions.description, sql`${transactions.date} DESC`);

  const recurringIncome = latestRecurringIncomeRows.reduce((acc, r) => acc + parseFloat(r.amount), 0);

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
    })
    .from(transactions)
    .where(and(
      baseFilter,
      eq(transactions.type, "expense"),
      eq(transactions.isFixed, true),
      lt(transactions.date, monthEnd),
    ))
    .orderBy(transactions.userId, transactions.description, sql`${transactions.date} DESC`);

  // A fixed expense only becomes "spent" once its due day in the requested
  // month has actually arrived — mirrors the frontend's isFixedExpenseDue
  // (useFixedExpenses.ts). Months fully in the past always count in full.
  const today = new Date();
  const curMonth = today.getMonth() + 1;
  const curYear = today.getFullYear();
  const fixedExpenses = latestFixedRows.reduce((acc, r) => {
    let dayOfMonth = r.date ? Number(r.date.slice(8, 10)) : 1;
    try {
      const obj = JSON.parse(r.description ?? "");
      if (obj && typeof obj.d === "number") dayOfMonth = obj.d;
    } catch { /* plain text description */ }
    const isDue = year !== curYear ? year < curYear
      : month !== curMonth ? month < curMonth
      : dayOfMonth <= today.getDate();
    return isDue ? acc + parseFloat(r.amount) : acc;
  }, 0);

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
  const last = user.lastActivityDate;
  let streak = user.currentStreak ?? 0;

  if (!last) {
    streak = 1;
  } else if (last === today) {
    // same day — no change
  } else {
    const dayDiff = Math.round((new Date(today).getTime() - new Date(last).getTime()) / 86400000);
    streak = dayDiff === 1 ? streak + 1 : 1;
  }

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
