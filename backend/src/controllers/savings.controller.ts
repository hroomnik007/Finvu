import { Response } from "express";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { zodDetails } from "../lib/validation";
import { db } from "../db";
import { savingsGoals, savingsDeposits } from "../db/schema";
import { AuthRequest } from "../middleware/authenticate";
import { evaluateAchievements } from "../services/achievements.service";

type SavingsGoalRow = typeof savingsGoals.$inferSelect;

function normalizeGoal(row: SavingsGoalRow) {
  return {
    ...row,
    targetAmount: Number(row.targetAmount),
    savedAmount: Number(row.savedAmount),
  };
}

const createSchema = z.object({
  name: z.string().min(1).max(100),
  targetAmount: z.number().positive(),
  savedAmount: z.number().min(0).optional(),
  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  icon: z.string().max(50).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  note: z.string().max(500).nullable().optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  targetAmount: z.number().positive().optional(),
  savedAmount: z.number().min(0).optional(),
  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  icon: z.string().max(50).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  note: z.string().max(500).nullable().optional(),
});

export async function listSavingsGoals(req: AuthRequest, res: Response): Promise<void> {
  const rows = await db
    .select()
    .from(savingsGoals)
    .where(eq(savingsGoals.userId, req.userId!))
    .orderBy(sql`${savingsGoals.deadline} ASC NULLS LAST`);
  res.json({ data: rows.map(normalizeGoal) });
}

export async function createSavingsGoal(req: AuthRequest, res: Response): Promise<void> {
  const body = createSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Validation error", details: zodDetails(body.error) });
    return;
  }

  const { targetAmount, savedAmount, ...rest } = body.data;
  const [row] = await db
    .insert(savingsGoals)
    .values({
      ...rest,
      userId: req.userId!,
      targetAmount: String(targetAmount),
      savedAmount: savedAmount != null ? String(savedAmount) : "0",
    })
    .returning();

  let newlyUnlockedAchievements: string[] = [];
  try {
    ({ newlyUnlocked: newlyUnlockedAchievements } = await evaluateAchievements(req.userId!));
  } catch (err) {
    console.error('achievement eval failed:', err);
  }
  res.status(201).json({ data: normalizeGoal(row), newlyUnlockedAchievements });
}

export async function updateSavingsGoal(req: AuthRequest, res: Response): Promise<void> {
  const id = req.params["id"] as string;

  const [existing] = await db
    .select({ userId: savingsGoals.userId })
    .from(savingsGoals)
    .where(eq(savingsGoals.id, id))
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "Savings goal not found" });
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

  if (Object.keys(body.data).length === 0) {
    res.status(400).json({ error: "No fields to update" });
    return;
  }

  const { targetAmount, savedAmount, ...rest } = body.data;
  const setData = {
    ...rest,
    ...(targetAmount !== undefined ? { targetAmount: String(targetAmount) } : {}),
    ...(savedAmount !== undefined ? { savedAmount: String(savedAmount) } : {}),
    updatedAt: new Date(),
  };

  const [updated] = await db
    .update(savingsGoals)
    .set(setData)
    .where(eq(savingsGoals.id, id))
    .returning();

  res.json({ data: normalizeGoal(updated) });
}

export async function pauseSavingsGoal(req: AuthRequest, res: Response): Promise<void> {
  const id = req.params["id"] as string;
  const [existing] = await db.select({ userId: savingsGoals.userId }).from(savingsGoals).where(eq(savingsGoals.id, id)).limit(1);
  if (!existing) { res.status(404).json({ error: "Savings goal not found" }); return; }
  if (existing.userId !== req.userId) { res.status(403).json({ error: "Forbidden" }); return; }
  const [updated] = await db.update(savingsGoals).set({ paused: true, updatedAt: new Date() }).where(eq(savingsGoals.id, id)).returning();
  res.json({ data: normalizeGoal(updated) });
}

export async function resumeSavingsGoal(req: AuthRequest, res: Response): Promise<void> {
  const id = req.params["id"] as string;
  const [existing] = await db.select({ userId: savingsGoals.userId }).from(savingsGoals).where(eq(savingsGoals.id, id)).limit(1);
  if (!existing) { res.status(404).json({ error: "Savings goal not found" }); return; }
  if (existing.userId !== req.userId) { res.status(403).json({ error: "Forbidden" }); return; }
  const [updated] = await db.update(savingsGoals).set({ paused: false, updatedAt: new Date() }).where(eq(savingsGoals.id, id)).returning();
  res.json({ data: normalizeGoal(updated) });
}

export async function deleteSavingsGoal(req: AuthRequest, res: Response): Promise<void> {
  const id = req.params["id"] as string;

  const [existing] = await db
    .select({ userId: savingsGoals.userId })
    .from(savingsGoals)
    .where(eq(savingsGoals.id, id))
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "Savings goal not found" });
    return;
  }
  if (existing.userId !== req.userId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  await db.delete(savingsGoals).where(eq(savingsGoals.id, id));
  res.json({ success: true });
}

function normalizeDeposit(d: typeof savingsDeposits.$inferSelect) {
  return { id: d.id, amount: Number(d.amount), date: d.createdAt.toISOString() };
}

export async function listDeposits(req: AuthRequest, res: Response): Promise<void> {
  const goalId = req.params["id"] as string;
  const [goal] = await db.select({ userId: savingsGoals.userId }).from(savingsGoals).where(eq(savingsGoals.id, goalId)).limit(1);
  if (!goal) { res.status(404).json({ error: "Not found" }); return; }
  if (goal.userId !== req.userId) { res.status(403).json({ error: "Forbidden" }); return; }

  const rows = await db.select().from(savingsDeposits)
    .where(eq(savingsDeposits.goalId, goalId))
    .orderBy(sql`${savingsDeposits.createdAt} DESC`)
    .limit(20);
  res.json({ data: rows.map(normalizeDeposit) });
}

export async function addDeposit(req: AuthRequest, res: Response): Promise<void> {
  const goalId = req.params["id"] as string;
  const [goal] = await db.select().from(savingsGoals).where(eq(savingsGoals.id, goalId)).limit(1);
  if (!goal) { res.status(404).json({ error: "Not found" }); return; }
  if (goal.userId !== req.userId) { res.status(403).json({ error: "Forbidden" }); return; }

  const body = z.object({ amount: z.number().positive().max(9_999_999_999.99) }).safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Invalid amount" }); return; }

  // Increment in SQL (not read-modify-write in JS) so concurrent deposits can't
  // overwrite each other, and keep deposit + total in one transaction.
  const { deposit, updated } = await db.transaction(async (tx) => {
    const [deposit] = await tx.insert(savingsDeposits).values({
      goalId,
      userId: req.userId!,
      amount: String(body.data.amount),
    }).returning();

    const [updated] = await tx.update(savingsGoals)
      .set({ savedAmount: sql`${savingsGoals.savedAmount} + ${String(body.data.amount)}::numeric`, updatedAt: new Date() })
      .where(eq(savingsGoals.id, goalId))
      .returning();
    return { deposit, updated };
  });

  res.status(201).json({ data: { goal: normalizeGoal(updated), deposit: normalizeDeposit(deposit) } });
}

export async function deleteDeposit(req: AuthRequest, res: Response): Promise<void> {
  const goalId = req.params["id"] as string;
  const depositId = req.params["depositId"] as string;

  const [deposit] = await db.select().from(savingsDeposits)
    .where(and(
      eq(savingsDeposits.id, depositId),
      eq(savingsDeposits.goalId, goalId),
      eq(savingsDeposits.userId, req.userId!),
    ))
    .limit(1);
  if (!deposit) { res.status(404).json({ error: "Deposit not found" }); return; }

  const updated = await db.transaction(async (tx) => {
    await tx.delete(savingsDeposits).where(eq(savingsDeposits.id, depositId));
    const [row] = await tx.update(savingsGoals)
      .set({ savedAmount: sql`GREATEST(0, ${savingsGoals.savedAmount} - ${String(deposit.amount)}::numeric)`, updatedAt: new Date() })
      .where(eq(savingsGoals.id, goalId))
      .returning();
    return row;
  });

  res.json({ data: normalizeGoal(updated) });
}
