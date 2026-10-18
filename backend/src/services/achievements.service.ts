import { and, count, eq, lt, sql } from "drizzle-orm";
import { db } from "../db";
import { localDateISO } from "../lib/localDate";
import {
  users,
  transactions,
  categories,
  savingsGoals,
  sharedReports,
  householdMembers,
  userAchievements,
} from "../db/schema";

// ── Achievement keys (must match the frontend ACHIEVEMENTS presentation map) ──
// first_transaction  🎯 Prvý krok        — ≥ 1 transaction
// week_streak        🔥 Týždeň v rade     — longest streak ≥ 7 days
// first_savings_goal 💰 Sporiteľ          — ≥ 1 savings goal created
// first_report       📊 Analytik          — ≥ 1 shared report created
// budget_met         🏆 Mesačný cieľ      — a completed month kept under total budget
// speedster          ⚡ Rýchly            — ≥ 10 transactions logged on a single day
// team_player        👥 Tímový hráč       — household has ≥ 2 members
// veteran            💎 Veterán           — ≥ 365 days since account/tracking start
export const ACHIEVEMENT_KEYS = [
  "first_transaction",
  "week_streak",
  "first_savings_goal",
  "first_report",
  "budget_met",
  "speedster",
  "team_player",
  "veteran",
] as const;

export type AchievementKey = (typeof ACHIEVEMENT_KEYS)[number];

export interface AchievementState {
  key: AchievementKey;
  unlocked: boolean;
  unlockedAt: string | null;
}

export interface EvaluateAchievementsResult {
  state: AchievementState[];
  newlyUnlocked: AchievementKey[];
}

function currentMonthStart(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

/**
 * Evaluate all achievement conditions for a user, persist any newly-unlocked
 * ones, and return the full state (all keys, unlocked + unlockedAt).
 *
 * Idempotent — safe to call from event points (transaction/savings/report
 * creation, household join) AND lazily from GET /api/achievements. Because it
 * re-checks every condition, the first GET also back-fills historical unlocks
 * for existing users, and time-based ones (veteran) resolve on the next call.
 */
export async function evaluateAchievements(userId: string): Promise<EvaluateAchievementsResult> {
  const [user] = await db
    .select({
      longestStreak: users.longestStreak,
      householdId: users.householdId,
      trackingStartDate: users.trackingStartDate,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    return {
      state: ACHIEVEMENT_KEYS.map((key) => ({ key, unlocked: false, unlockedAt: null })),
      newlyUnlocked: [],
    };
  }

  const monthStart = currentMonthStart();

  const [
    [{ txCount }],
    [{ savingsCount }],
    [{ reportCount }],
    perDayRows,
    budgetCats,
    monthlyExpenses,
    memberCountRows,
  ] = await Promise.all([
    db.select({ txCount: count() }).from(transactions).where(eq(transactions.userId, userId)),
    db.select({ savingsCount: count() }).from(savingsGoals).where(eq(savingsGoals.userId, userId)),
    db.select({ reportCount: count() }).from(sharedReports).where(eq(sharedReports.userId, userId)),
    // Transactions grouped per calendar day → max count in any single day.
    db
      .select({ c: count() })
      .from(transactions)
      .where(eq(transactions.userId, userId))
      .groupBy(transactions.date),
    // Current expense-category budget limits.
    db
      .select({ limit: categories.budgetLimit })
      .from(categories)
      .where(and(eq(categories.userId, userId), eq(categories.type, "expense"))),
    // Expenses grouped by completed month (strictly before the current month).
    db
      .select({
        ym: sql<string>`to_char(${transactions.date}, 'YYYY-MM')`,
        total: sql<string>`COALESCE(SUM(${transactions.amount}), 0)`,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          eq(transactions.type, "expense"),
          lt(transactions.date, monthStart),
        ),
      )
      .groupBy(sql`to_char(${transactions.date}, 'YYYY-MM')`),
    user.householdId
      ? db
          .select({ memberCount: count() })
          .from(householdMembers)
          .where(eq(householdMembers.householdId, user.householdId))
      : Promise.resolve([{ memberCount: 0 }] as { memberCount: number }[]),
  ]);

  const totalTx = Number(txCount);
  const maxPerDay = perDayRows.reduce((m, r) => Math.max(m, Number(r.c)), 0);
  const totalBudget = budgetCats.reduce((s, c) => s + (c.limit ? parseFloat(c.limit) : 0), 0);
  const budgetMet =
    totalBudget > 0 &&
    monthlyExpenses.some((m) => {
      const spent = parseFloat(m.total);
      return spent > 0 && spent <= totalBudget;
    });
  const memberCount = Number(memberCountRows[0]?.memberCount ?? 0);

  const startRef = user.trackingStartDate ?? localDateISO(user.createdAt);
  const daysActive = Math.floor((Date.now() - new Date(startRef).getTime()) / 86400000);

  const qualifies: Record<AchievementKey, boolean> = {
    first_transaction: totalTx >= 1,
    week_streak: (user.longestStreak ?? 0) >= 7,
    first_savings_goal: Number(savingsCount) >= 1,
    first_report: Number(reportCount) >= 1,
    budget_met: budgetMet,
    speedster: maxPerDay >= 10,
    team_player: memberCount >= 2,
    veteran: daysActive >= 365,
  };

  const existingRows = await db
    .select({ key: userAchievements.achievementKey })
    .from(userAchievements)
    .where(eq(userAchievements.userId, userId));
  const alreadyUnlocked = new Set(existingRows.map((r) => r.key));

  const newlyUnlocked = ACHIEVEMENT_KEYS.filter((key) => qualifies[key] && !alreadyUnlocked.has(key));
  const toInsert = newlyUnlocked.map((key) => ({ userId, achievementKey: key }));

  if (toInsert.length > 0) {
    await db.insert(userAchievements).values(toInsert).onConflictDoNothing();
  }

  const rows = await db
    .select({ key: userAchievements.achievementKey, unlockedAt: userAchievements.unlockedAt })
    .from(userAchievements)
    .where(eq(userAchievements.userId, userId));

  const byKey = new Map(rows.map((r) => [r.key, r.unlockedAt]));

  const state = ACHIEVEMENT_KEYS.map((key) => {
    const at = byKey.get(key);
    return { key, unlocked: !!at, unlockedAt: at ? at.toISOString() : null };
  });

  return { state, newlyUnlocked };
}
