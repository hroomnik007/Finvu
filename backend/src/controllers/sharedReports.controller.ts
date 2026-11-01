import { Request, Response } from "express";
import { eq, inArray, sql } from "drizzle-orm";
import { randomBytes } from "crypto";
import { db } from "../db";
import { sharedReports, transactions, users } from "../db/schema";
import { AuthRequest } from "../middleware/authenticate";
import { evaluateAchievements } from "../services/achievements.service";
import { familyMemberIds } from "../lib/household";
import { insertSharedReportWithinCap, MAX_ACTIVE_SHARED_REPORTS, SHARED_REPORT_LIMIT_CODE } from "../lib/sharedReportLimit";

export async function createSharedReport(req: AuthRequest, res: Response): Promise<void> {
  const { data, expiresInHours = 24 * 7 } = req.body as { data?: string; expiresInHours?: number };
  if (!data || typeof data !== "string") {
    res.status(400).json({ error: "data is required" });
    return;
  }
  if (data.length > 500_000) {
    res.status(413).json({ error: "Report data too large" });
    return;
  }

  // An expiry in the past (or ~0) would keep the report out of the active-report cap.
  if (typeof expiresInHours !== "number" || !Number.isFinite(expiresInHours) || expiresInHours < 1) {
    res.status(400).json({ error: "expiresInHours must be a number of at least 1" });
    return;
  }

  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + Math.min(expiresInHours, 24 * 30) * 3600 * 1000);

  const created = await insertSharedReportWithinCap({ userId: req.userId!, token, data, expiresAt });
  if (!created.ok) {
    res.status(409).json({
      error: `Dosiahol si limit ${MAX_ACTIVE_SHARED_REPORTS} aktívnych zdieľaných reportov. Počkaj, kým niektorý vyprší.`,
      code: SHARED_REPORT_LIMIT_CODE,
      limit: MAX_ACTIVE_SHARED_REPORTS,
    });
    return;
  }
  let newlyUnlockedAchievements: string[] = [];
  try {
    ({ newlyUnlocked: newlyUnlockedAchievements } = await evaluateAchievements(req.userId!));
  } catch (err) {
    console.error('achievement eval failed:', err);
  }
  res.status(201).json({ token, newlyUnlockedAchievements });
}

export async function getSharedReport(req: Request, res: Response): Promise<void> {
  const { token } = req.params as { token: string };

  const [report] = await db
    .select({ data: sharedReports.data, expiresAt: sharedReports.expiresAt })
    .from(sharedReports)
    .where(eq(sharedReports.token, token))
    .limit(1);

  if (!report) {
    res.status(404).json({ error: "Správa nebola nájdená." });
    return;
  }
  if (report.expiresAt < new Date()) {
    res.status(410).json({ error: "Platnosť odkazu vypršala." });
    return;
  }

  res.json({ data: report.data });
}

export async function getTotalBalance(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.userId!;

  const [userRow] = await db
    .select({ householdId: users.householdId, householdEnabled: users.householdEnabled })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const baseFilter =
    userRow?.householdEnabled && userRow?.householdId
      ? inArray(transactions.userId, familyMemberIds(userRow.householdId))
      : eq(transactions.userId, userId);

  const rows = await db
    .select({
      type: transactions.type,
      total: sql<string>`COALESCE(SUM(${transactions.amount}), 0)`,
    })
    .from(transactions)
    .where(baseFilter)
    .groupBy(transactions.type);

  const incomeRow = rows.find(r => r.type === "income");
  const expenseRow = rows.find(r => r.type === "expense");
  const totalIncome = incomeRow ? parseFloat(incomeRow.total) : 0;
  const totalExpenses = expenseRow ? parseFloat(expenseRow.total) : 0;

  res.json({ totalIncome, totalExpenses, balance: totalIncome - totalExpenses });
}
