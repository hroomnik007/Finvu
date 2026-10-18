import { Response } from "express";
import { and, eq, sql, desc, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { households, householdMembers, users, transactions, categories } from "../db/schema";
import { AuthRequest } from "../middleware/authenticate";
import { generateInviteCode } from "../utils/inviteCode";
import { evaluateAchievements } from "../services/achievements.service";
import { familyMemberIds } from "../lib/household";

const createSchema = z.object({
  name: z.string().min(1).max(100),
});

const joinSchema = z.object({
  invite_code: z.string().trim().min(1).max(20).transform((c) => c.toUpperCase()),
});

// Fixed invite code of the public demo household (see lib/resetDemo.ts) — real
// users must never be able to join it and expose their data to demo visitors.
const DEMO_INVITE_CODE = "DEMO2026";

// A user may belong to one household at a time. Returns false (and responds
// 409) when they still are in one; otherwise also purges stale membership rows
// left behind by the old create/join flow, which never removed the previous one.
async function ensureNoActiveHousehold(userId: string, res: Response): Promise<boolean> {
  const [u] = await db.select({ householdId: users.householdId }).from(users).where(eq(users.id, userId)).limit(1);
  if (u?.householdId) {
    res.status(409).json({ error: "Najprv opustite aktuálnu domácnosť." });
    return false;
  }
  await db.delete(householdMembers).where(eq(householdMembers.userId, userId));
  return true;
}

async function getUniqueInviteCode(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateInviteCode();
    const existing = await db
      .select({ id: households.id })
      .from(households)
      .where(eq(households.inviteCode, code))
      .limit(1);
    if (existing.length === 0) return code;
  }
  throw new Error("Failed to generate unique invite code");
}

async function assertMember(householdId: number, userId: string, res: Response): Promise<boolean> {
  const [membership] = await db
    .select({ id: householdMembers.id })
    .from(householdMembers)
    .innerJoin(users, eq(users.id, householdMembers.userId))
    .where(and(
      eq(householdMembers.householdId, householdId),
      eq(householdMembers.userId, userId),
      eq(users.householdId, householdId),
    ))
    .limit(1);
  if (!membership) {
    res.status(403).json({ error: "Nie ste členom tohto domácnosti." });
    return false;
  }
  return true;
}

export async function createHousehold(req: AuthRequest, res: Response): Promise<void> {
  const body = createSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Validation error", details: body.error.errors });
    return;
  }

  const userId = req.userId!;
  if (!(await ensureNoActiveHousehold(userId, res))) return;
  const inviteCode = await getUniqueInviteCode();

  const [household] = await db
    .insert(households)
    .values({ name: body.data.name, inviteCode, createdBy: userId })
    .returning();

  await db.insert(householdMembers).values({ householdId: household.id, userId });

  await db
    .update(users)
    .set({ householdId: household.id, householdEnabled: true })
    .where(eq(users.id, userId));

  res.status(201).json({
    id: household.id,
    name: household.name,
    invite_code: household.inviteCode,
    created_at: household.createdAt,
  });
}

export async function joinHousehold(req: AuthRequest, res: Response): Promise<void> {
  const body = joinSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Validation error", details: body.error.errors });
    return;
  }

  const userId = req.userId!;

  if (body.data.invite_code === DEMO_INVITE_CODE) {
    res.status(404).json({ error: "Domácnosť s týmto kódom neexistuje." });
    return;
  }

  const [household] = await db
    .select()
    .from(households)
    .where(eq(households.inviteCode, body.data.invite_code))
    .limit(1);

  if (!household) {
    res.status(404).json({ error: "Domácnosť s týmto kódom neexistuje." });
    return;
  }

  const [existing] = await db
    .select({ id: householdMembers.id })
    .from(householdMembers)
    .where(and(eq(householdMembers.householdId, household.id), eq(householdMembers.userId, userId)))
    .limit(1);

  if (existing) {
    res.status(409).json({ error: "Ste už členom tejto domácnosti." });
    return;
  }

  if (!(await ensureNoActiveHousehold(userId, res))) return;

  await db.insert(householdMembers).values({ householdId: household.id, userId });

  await db
    .update(users)
    .set({ householdId: household.id, householdEnabled: true })
    .where(eq(users.id, userId));

  const members = await db
    .select({ userId: householdMembers.userId })
    .from(householdMembers)
    .where(eq(householdMembers.householdId, household.id));

  // Re-evaluate every member: joining pushes the household to ≥ 2 members, so
  // both the newcomer AND the existing creator now qualify for "Tímový hráč".
  // Only the joining user's request is awaited (to report newlyUnlocked in the
  // response) — other members get evaluated fire-and-forget and pick up their
  // unlock on their own next action/load.
  let newlyUnlockedAchievements: string[] = [];
  for (const m of members) {
    if (m.userId === userId) {
      try {
        ({ newlyUnlocked: newlyUnlockedAchievements } = await evaluateAchievements(m.userId));
      } catch (err) {
        console.error('achievement eval failed:', err);
      }
    } else {
      evaluateAchievements(m.userId).catch(err => console.error('achievement eval failed:', err));
    }
  }

  res.json({
    id: household.id,
    name: household.name,
    invite_code: household.inviteCode,
    member_count: members.length,
    newlyUnlockedAchievements,
  });
}

export async function getMyHousehold(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.userId!;

  const [user] = await db
    .select({ householdId: users.householdId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user?.householdId) {
    res.status(404).json({ error: "Nie ste členom žiadnej domácnosti." });
    return;
  }

  const [household] = await db
    .select()
    .from(households)
    .where(eq(households.id, user.householdId))
    .limit(1);

  if (!household) {
    res.status(404).json({ error: "Domácnosť nenájdená." });
    return;
  }

  const members = await db
    .select({
      id: users.id,
      name: users.name,
      avatarUrl: users.avatarUrl,
      joinedAt: householdMembers.joinedAt,
    })
    .from(householdMembers)
    .innerJoin(users, eq(householdMembers.userId, users.id))
    .where(eq(householdMembers.householdId, household.id))
    .orderBy(householdMembers.joinedAt);

  res.json({
    id: household.id,
    name: household.name,
    invite_code: household.inviteCode,
    created_at: household.createdAt,
    members: members.map((m) => ({
      id: m.id,
      name: m.name,
      avatar_url: m.avatarUrl ?? null,
      joined_at: m.joinedAt,
      is_owner: m.id === household.createdBy,
    })),
  });
}

export async function getHouseholdMembers(req: AuthRequest, res: Response): Promise<void> {
  const householdId = parseInt(req.params["id"] as string, 10);
  if (isNaN(householdId)) { res.status(400).json({ error: "Invalid household id" }); return; }

  const isMember = await assertMember(householdId, req.userId!, res);
  if (!isMember) return;

  const [household] = await db
    .select({ createdBy: households.createdBy })
    .from(households)
    .where(eq(households.id, householdId))
    .limit(1);

  const members = await db
    .select({
      userId: users.id,
      name: users.name,
      joinedAt: householdMembers.joinedAt,
    })
    .from(householdMembers)
    .innerJoin(users, eq(householdMembers.userId, users.id))
    .where(eq(householdMembers.householdId, householdId))
    .orderBy(householdMembers.joinedAt);

  res.json(
    members.map((m) => ({
      user_id: m.userId,
      name: m.name,
      joined_at: m.joinedAt,
      is_owner: m.userId === household?.createdBy,
    }))
  );
}

export async function getMonthlyStats(req: AuthRequest, res: Response): Promise<void> {
  const householdId = parseInt(req.params["id"] as string, 10);
  if (isNaN(householdId)) { res.status(400).json({ error: "Invalid household id" }); return; }

  const isMember = await assertMember(householdId, req.userId!, res);
  if (!isMember) return;

  const now = new Date();
  const yearRaw = parseInt((req.query["year"] as string) ?? "", 10);
  const monthRaw = parseInt((req.query["month"] as string) ?? "", 10);
  const year = isNaN(yearRaw) ? now.getFullYear() : yearRaw;
  const monthNum = isNaN(monthRaw) ? now.getMonth() + 1 : monthRaw;
  const month = String(monthNum).padStart(2, "0");
  const start = `${year}-${month}-01`;
  const nextMonth = monthNum === 12 ? `${year + 1}-01-01` : `${year}-${String(monthNum + 1).padStart(2, "0")}-01`;

  const rows = await db
    .select({
      createdBy: transactions.createdBy,
      type: transactions.type,
      total: sql<string>`COALESCE(SUM(${transactions.amount}), 0)`,
      creatorName: users.name,
    })
    .from(transactions)
    .leftJoin(users, eq(transactions.createdBy, users.id))
    .where(
      and(
        inArray(transactions.userId, familyMemberIds(householdId)),
        sql`${transactions.date} >= ${start}`,
        sql`${transactions.date} < ${nextMonth}`
      )
    )
    .groupBy(transactions.createdBy, transactions.type, users.name);

  const memberMap = new Map<string, { user_id: string; name: string; expenses: number; income: number; category_breakdown: Array<{ category_id: string | null; name: string; color: string | null; amount: number }> }>();

  for (const row of rows) {
    const uid = row.createdBy ?? "unknown";
    if (!memberMap.has(uid)) {
      memberMap.set(uid, { user_id: uid, name: row.creatorName ?? "Unknown", expenses: 0, income: 0, category_breakdown: [] });
    }
    const entry = memberMap.get(uid)!;
    if (row.type === "expense") entry.expenses += parseFloat(row.total);
    else entry.income += parseFloat(row.total);
  }

  const categoryRows = await db
    .select({
      createdBy: transactions.createdBy,
      categoryId: transactions.categoryId,
      categoryName: categories.name,
      categoryColor: categories.color,
      total: sql<string>`COALESCE(SUM(${transactions.amount}), 0)`,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(
      and(
        inArray(transactions.userId, familyMemberIds(householdId)),
        eq(transactions.type, "expense"),
        sql`${transactions.date} >= ${start}`,
        sql`${transactions.date} < ${nextMonth}`
      )
    )
    .groupBy(transactions.createdBy, transactions.categoryId, categories.name, categories.color);

  for (const row of categoryRows) {
    const uid = row.createdBy ?? "unknown";
    const entry = memberMap.get(uid);
    if (!entry) continue;
    entry.category_breakdown.push({
      category_id: row.categoryId,
      name: row.categoryName ?? "Ostatné",
      color: row.categoryColor,
      amount: parseFloat(row.total),
    });
  }

  const perMember = Array.from(memberMap.values());
  const totalExpenses = perMember.reduce((s, m) => s + m.expenses, 0);
  const totalIncome = perMember.reduce((s, m) => s + m.income, 0);

  res.json({ total_expenses: totalExpenses, total_income: totalIncome, per_member: perMember });
}

export async function getActivity(req: AuthRequest, res: Response): Promise<void> {
  const householdId = parseInt(req.params["id"] as string, 10);
  if (isNaN(householdId)) { res.status(400).json({ error: "Invalid household id" }); return; }

  const isMember = await assertMember(householdId, req.userId!, res);
  if (!isMember) return;

  const limitRaw = parseInt((req.query["limit"] as string) ?? "10", 10);
  const limit = Math.min(isNaN(limitRaw) ? 10 : limitRaw, 50);

  const now = new Date();
  const yearRaw = parseInt((req.query["year"] as string) ?? "", 10);
  const monthRaw = parseInt((req.query["month"] as string) ?? "", 10);
  const year = isNaN(yearRaw) ? now.getFullYear() : yearRaw;
  const monthNum = isNaN(monthRaw) ? now.getMonth() + 1 : monthRaw;
  const start = `${year}-${String(monthNum).padStart(2, "0")}-01`;
  const nextMonth = monthNum === 12 ? `${year + 1}-01-01` : `${year}-${String(monthNum + 1).padStart(2, "0")}-01`;

  const rows = await db
    .select({
      type: transactions.type,
      amount: transactions.amount,
      description: transactions.description,
      createdBy: transactions.createdBy,
      createdByName: users.name,
      createdAt: transactions.createdAt,
    })
    .from(transactions)
    .leftJoin(users, eq(transactions.createdBy, users.id))
    .where(
      and(
        inArray(transactions.userId, familyMemberIds(householdId)),
        sql`${transactions.date} >= ${start}`,
        sql`${transactions.date} < ${nextMonth}`
      )
    )
    .orderBy(desc(transactions.createdAt))
    .limit(limit);

  res.json(
    rows.map((r) => ({
      type: r.type,
      amount: parseFloat(r.amount as string),
      description: r.description,
      created_by: r.createdBy,
      created_by_name: r.createdByName,
      created_at: r.createdAt,
    }))
  );
}

export async function leaveHousehold(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.userId!;

  const [user] = await db
    .select({ householdId: users.householdId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user?.householdId) {
    res.status(400).json({ error: "Nie ste členom žiadnej domácnosti." });
    return;
  }

  const householdId = user.householdId;

  const [household] = await db
    .select()
    .from(households)
    .where(eq(households.id, householdId))
    .limit(1);

  await db
    .delete(householdMembers)
    .where(and(eq(householdMembers.householdId, householdId), eq(householdMembers.userId, userId)));

  await db
    .update(users)
    .set({ householdId: null, householdEnabled: false })
    .where(eq(users.id, userId));

  const remainingMembers = await db
    .select({ userId: householdMembers.userId, joinedAt: householdMembers.joinedAt })
    .from(householdMembers)
    .where(eq(householdMembers.householdId, householdId))
    .orderBy(householdMembers.joinedAt)
    .limit(1);

  if (remainingMembers.length === 0) {
    await db.delete(households).where(eq(households.id, householdId));
  } else if (household && household.createdBy === userId) {
    await db
      .update(households)
      .set({ createdBy: remainingMembers[0].userId })
      .where(eq(households.id, householdId));
  }

  res.json({ success: true });
}

export async function toggleHousehold(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.userId!;
  const { enabled } = req.body as { enabled?: boolean };

  if (typeof enabled !== "boolean") {
    res.status(400).json({ error: "enabled (boolean) is required" });
    return;
  }

  await db.update(users).set({ householdEnabled: enabled }).where(eq(users.id, userId));

  res.json({ household_enabled: enabled });
}
