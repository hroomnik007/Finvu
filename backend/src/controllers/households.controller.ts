import { Response } from "express";
import { and, eq, sql, desc, inArray } from "drizzle-orm";
import { z } from "zod";
import { zodDetails } from "../lib/validation";
import { db } from "../db";
import { households, householdMembers, users, transactions, categories } from "../db/schema";
import { AuthRequest } from "../middleware/authenticate";
import { generateInviteCode } from "../utils/inviteCode";
import { evaluateAchievements } from "../services/achievements.service";
import { familyMemberIds } from "../lib/household";
import { loadStartMonths } from "../lib/loadStartMonths";
import { isTrackedMonth } from "../lib/trackingStart";
import { recalcSharedForHousehold, syncSharedToNewMember, unshareAllFor } from "../lib/sharedCategories";
import { fixedDayOfMonth, isFixedDue, isActiveInMonth } from "../lib/recurring";

const createSchema = z.object({
  name: z.string().min(1).max(100),
});

const joinSchema = z.object({
  invite_code: z.string().trim().min(1).max(20).transform((c) => c.toUpperCase()),
});

// A user may belong to one household at a time. Returns false (and responds
// 409) when they still are in one; otherwise also purges stale membership rows
// left behind by the old create/join flow, which never removed the previous one.
async function ensureNoActiveHousehold(userId: string, res: Response): Promise<boolean> {
  const [u] = await db.select({ householdId: users.householdId }).from(users).where(eq(users.id, userId)).limit(1);
  if (u?.householdId) {
    res.status(409).json({ error: "Najprv opusti aktuálnu domácnosť." });
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
    res.status(403).json({ error: "Nie si členom tejto domácnosti." });
    return false;
  }
  return true;
}

export async function createHousehold(req: AuthRequest, res: Response): Promise<void> {
  const body = createSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Validation error", details: zodDetails(body.error) });
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
    res.status(400).json({ error: "Validation error", details: zodDetails(body.error) });
    return;
  }

  const userId = req.userId!;

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
    res.status(409).json({ error: "Už si členom tejto domácnosti." });
    return;
  }

  if (!(await ensureNoActiveHousehold(userId, res))) return;

  await db.insert(householdMembers).values({ householdId: household.id, userId });

  await db
    .update(users)
    .set({ householdId: household.id, householdEnabled: true })
    .where(eq(users.id, userId));

  try {
    await syncSharedToNewMember(userId, household.id);
  } catch (err) {
    console.error('shared categories sync failed:', err);
  }

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
    res.status(404).json({ error: "Nie si členom žiadnej domácnosti." });
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
  const year = yearRaw >= 2000 && yearRaw <= 2100 ? yearRaw : now.getFullYear();
  const monthNum = monthRaw >= 1 && monthRaw <= 12 ? monthRaw : now.getMonth() + 1;
  const month = String(monthNum).padStart(2, "0");
  const start = `${year}-${month}-01`;
  const nextMonth = monthNum === 12 ? `${year + 1}-01-01` : `${year}-${String(monthNum + 1).padStart(2, "0")}-01`;

  const memberIds = (await familyMemberIds(householdId)).map((r) => r.id);
  // A month before a member's tracking start is empty for that member — one-off
  // and recurring rows alike (same rule as the cards and the monthly series).
  const ym = `${year}-${month}`;
  const starts = await loadStartMonths(memberIds);
  const members = memberIds.filter((id) => isTrackedMonth(starts, id, ym));
  if (members.length === 0) {
    res.json({ total_expenses: 0, total_income: 0, per_member: [] });
    return;
  }

  // One-off rows count in the month they are dated.
  const oneOff = await db
    .select({
      userId: transactions.userId,
      type: transactions.type,
      categoryId: transactions.categoryId,
      categoryName: categories.name,
      categoryColor: categories.color,
      total: sql<string>`COALESCE(SUM(${transactions.amount}), 0)`,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(and(
      inArray(transactions.userId, members),
      eq(transactions.isFixed, false),
      sql`${transactions.date} >= ${start}`,
      sql`${transactions.date} < ${nextMonth}`,
    ))
    .groupBy(transactions.userId, transactions.type, transactions.categoryId, categories.name, categories.color);

  // Recurring rows are entered once and count in every month from their own
  // date on (same rules as the dashboard cards): each series — member + type +
  // description — via its latest occurrence before the end of this month,
  // recurring expenses only once their due day has arrived.
  const fixedRows = await db
    .select({
      userId: transactions.userId,
      type: transactions.type,
      description: transactions.description,
      amount: transactions.amount,
      date: transactions.date,
      endedOn: transactions.endedOn,
      categoryId: transactions.categoryId,
      categoryName: categories.name,
      categoryColor: categories.color,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(and(
      inArray(transactions.userId, members),
      eq(transactions.isFixed, true),
      sql`${transactions.date} < ${nextMonth}`,
    ))
    // Last row per series wins below; createdAt/id make same-date ties
    // deterministic and identical to the dashboard cards (summary-cards).
    .orderBy(transactions.date, transactions.createdAt, transactions.id);

  const latest = new Map<string, (typeof fixedRows)[number]>();
  for (const row of fixedRows) latest.set(`${row.userId}|${row.type}|${row.description ?? ""}`, row);

  type Member = { user_id: string; name: string; expenses: number; income: number; category_breakdown: Array<{ category_id: string | null; name: string; color: string | null; amount: number }> };
  const memberMap = new Map<string, Member>();
  const memberOf = (uid: string): Member => {
    let m = memberMap.get(uid);
    if (!m) { m = { user_id: uid, name: "Unknown", expenses: 0, income: 0, category_breakdown: [] }; memberMap.set(uid, m); }
    return m;
  };
  const addExpense = (m: Member, categoryId: string | null, name: string | null, color: string | null, amount: number) => {
    m.expenses += amount;
    const existing = m.category_breakdown.find((c) => c.category_id === categoryId);
    if (existing) existing.amount += amount;
    else m.category_breakdown.push({ category_id: categoryId, name: name ?? "Ostatné", color, amount });
  };

  for (const r of oneOff) {
    const m = memberOf(r.userId);
    const amount = parseFloat(r.total);
    if (r.type === "expense") addExpense(m, r.categoryId, r.categoryName, r.categoryColor, amount);
    else m.income += amount;
  }
  for (const r of latest.values()) {
    if (!isActiveInMonth(r.endedOn, year, monthNum)) continue;
    const amount = parseFloat(r.amount);
    const m = memberOf(r.userId);
    if (r.type === "income") m.income += amount;
    else if (isFixedDue(fixedDayOfMonth(r.description, r.date), year, monthNum, now)) {
      addExpense(m, r.categoryId, r.categoryName, r.categoryColor, amount);
    }
  }

  if (memberMap.size > 0) {
    const names = await db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(inArray(users.id, [...memberMap.keys()]));
    for (const n of names) memberOf(n.id).name = n.name;
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
    res.status(400).json({ error: "Nie si členom žiadnej domácnosti." });
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
  await unshareAllFor(userId);
  await recalcSharedForHousehold(householdId);

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

  // Whose fixed expenses and limits count towards shared categories just changed
  const [u] = await db.select({ householdId: users.householdId }).from(users).where(eq(users.id, userId)).limit(1);
  if (u?.householdId) await recalcSharedForHousehold(u.householdId).catch(err => console.error('shared limit recalc failed:', err));

  res.json({ household_enabled: enabled });
}

// Only the household's owner (created_by) may manage members and the invite code.
async function assertOwner(householdId: number, userId: string, res: Response): Promise<boolean> {
  const [household] = await db
    .select({ createdBy: households.createdBy })
    .from(households)
    .where(eq(households.id, householdId))
    .limit(1);
  if (!household || household.createdBy !== userId) {
    res.status(403).json({ error: "Túto akciu môže vykonať len správca domácnosti." });
    return false;
  }
  return true;
}

// POST /api/households/:id/invite-code — the old code stops working immediately,
// so a code that leaked (or was shared with someone who should no longer join)
// can be retired.
export async function regenerateInviteCode(req: AuthRequest, res: Response): Promise<void> {
  const householdId = parseInt(req.params["id"] as string, 10);
  if (isNaN(householdId)) { res.status(400).json({ error: "Invalid household id" }); return; }
  if (!(await assertMember(householdId, req.userId!, res))) return;
  if (!(await assertOwner(householdId, req.userId!, res))) return;

  const inviteCode = await getUniqueInviteCode();
  await db.update(households).set({ inviteCode }).where(eq(households.id, householdId));
  res.json({ invite_code: inviteCode });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// DELETE /api/households/:id/members/:memberId — owner removes another member.
// The member leaves exactly as if they had pressed "leave": membership row gone,
// household switched off for them. Their past rows stay theirs and drop out of
// the family totals because family scope follows membership.
export async function removeMember(req: AuthRequest, res: Response): Promise<void> {
  const householdId = parseInt(req.params["id"] as string, 10);
  const memberId = req.params["memberId"] as string;
  if (isNaN(householdId)) { res.status(400).json({ error: "Invalid household id" }); return; }
  if (!UUID_RE.test(memberId)) { res.status(404).json({ error: "Člen nenájdený." }); return; }
  if (!(await assertMember(householdId, req.userId!, res))) return;
  if (!(await assertOwner(householdId, req.userId!, res))) return;

  if (memberId === req.userId) {
    res.status(400).json({ error: "Seba nemôžeš odstrániť. Použi Opustiť domácnosť." });
    return;
  }

  const removed = await db
    .delete(householdMembers)
    .where(and(eq(householdMembers.householdId, householdId), eq(householdMembers.userId, memberId)))
    .returning({ id: householdMembers.id });
  if (removed.length === 0) { res.status(404).json({ error: "Člen nenájdený." }); return; }

  await db
    .update(users)
    .set({ householdId: null, householdEnabled: false })
    .where(and(eq(users.id, memberId), eq(users.householdId, householdId)));
  await unshareAllFor(memberId);
  await recalcSharedForHousehold(householdId);

  // The removed member knows the current invite code and could simply rejoin with
  // it, so removing someone retires the code in the same step.
  const inviteCode = await getUniqueInviteCode();
  await db.update(households).set({ inviteCode }).where(eq(households.id, householdId));

  res.json({ success: true, invite_code: inviteCode });
}
