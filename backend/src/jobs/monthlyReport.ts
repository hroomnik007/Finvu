import cron from "node-cron";
import { and, asc, eq, inArray, lt, or, gte } from "drizzle-orm";
import { db } from "../db";
import { users, transactions, categories, savingsGoals } from "../db/schema";
import { sendEmail } from "../lib/email";
import { sharingMemberIds } from "../lib/sharedCategories";
import { loadStartMonths } from "../lib/loadStartMonths";
import {
  monthRows, totals, topCategories, largestPayment, categoriesOverLimit, upcomingPayments, memberSplit,
  renderSummaryHtml, type RawTx, type SummaryData,
} from "../lib/monthlySummary";

const TZ = "Europe/Bratislava";
const MONTHS_SK = ["Január", "Február", "Marec", "Apríl", "Máj", "Jún", "Júl", "August", "September", "Október", "November", "December"];

// Calendar date and hour in the app's home time zone, whatever the server runs in.
function localNow(at: Date = new Date()): { year: number; month: number; day: number; hour: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: TZ, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", hourCycle: "h23" })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day), hour: Number(parts.hour) };
}

function monthStart(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

function shiftMonth(year: number, month: number, by: number): { year: number; month: number } {
  const idx = year * 12 + (month - 1) + by;
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
}

// Everything the e-mail shows for one subscriber, for the month that is ending.
export async function buildSummary(
  user: { id: string; monthlyEmailScope: string },
  year: number,
  month: number,
  today: Date,
): Promise<SummaryData> {
  const sharing = await sharingMemberIds(user.id);
  const loadIds = sharing ?? [user.id];
  const family = user.monthlyEmailScope === "family" && !!sharing && sharing.length > 1;
  const scopeIds = family ? loadIds : [user.id];

  const prev = shiftMonth(year, month, -1);
  const next = shiftMonth(year, month, 1);

  // One-off rows of this and the previous month plus every recurring row up to the
  // end of the next month (the next month's prices are needed for "upcoming")
  const txs: RawTx[] = await db
    .select({
      userId: transactions.userId, type: transactions.type, amount: transactions.amount,
      categoryId: transactions.categoryId, description: transactions.description, date: transactions.date,
      isFixed: transactions.isFixed, endedOn: transactions.endedOn,
    })
    .from(transactions)
    .where(and(
      inArray(transactions.userId, loadIds),
      or(
        and(eq(transactions.isFixed, false), gte(transactions.date, monthStart(prev.year, prev.month)), lt(transactions.date, monthStart(next.year, next.month))),
        and(eq(transactions.isFixed, true), lt(transactions.date, monthStart(shiftMonth(year, month, 2).year, shiftMonth(year, month, 2).month))),
      ),
    ))
    .orderBy(asc(transactions.date));

  const cats = await db
    .select({ id: categories.id, userId: categories.userId, name: categories.name, type: categories.type, budgetLimit: categories.budgetLimit, shared: categories.shared })
    .from(categories)
    .where(inArray(categories.userId, loadIds));
  const names = await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, loadIds));
  const userNames = new Map(names.map((n) => [n.id, n.name]));

  const goals = await db
    .select({ userId: savingsGoals.userId, name: savingsGoals.name, saved: savingsGoals.savedAmount, target: savingsGoals.targetAmount, paused: savingsGoals.paused })
    .from(savingsGoals)
    .where(inArray(savingsGoals.userId, scopeIds))
    .orderBy(asc(savingsGoals.createdAt));

  // A month before a member's tracking start is empty for that member.
  const starts = await loadStartMonths(loadIds);
  const allRows = monthRows(txs, year, month, undefined, starts);
  const rows = allRows.filter((r) => scopeIds.includes(r.userId));
  const prevRows = monthRows(txs, prev.year, prev.month, undefined, starts).filter((r) => scopeIds.includes(r.userId));
  const mine = (t: RawTx) => scopeIds.includes(t.userId);

  const { income, expense } = totals(rows);
  const { income: prevIncome, expense: prevExpense } = totals(prevRows);
  const catNames = new Map(cats.map((c) => [c.id, c.name]));

  return {
    year, month, family,
    income, expense, prevIncome, prevExpense,
    top: topCategories(rows, catNames),
    largest: (() => {
      const l = largestPayment(rows);
      return l ? { label: l.label, amount: l.amount, date: l.date } : null;
    })(),
    over: categoriesOverLimit(
      user.id,
      cats.map((c) => ({ ...c, limit: c.budgetLimit ? parseFloat(c.budgetLimit) : null })),
      allRows,
      userNames,
    ),
    upcoming: upcomingPayments(txs.filter(mine), today),
    goals: goals.map((g) => ({
      name: g.name, saved: parseFloat(g.saved), target: parseFloat(g.target), paused: g.paused,
      owner: family ? userNames.get(g.userId) : undefined,
    })),
    members: family ? memberSplit(rows, userNames) : [],
  };
}

async function sendMonthlyReports(): Promise<void> {
  const now = localNow();
  const lastDay = new Date(now.year, now.month, 0).getDate();
  if (now.day !== lastDay) return; // only the last day of the month

  const ym = `${now.year}-${String(now.month).padStart(2, "0")}`;
  const subscribers = await db
    .select({ id: users.id, email: users.email, monthlyEmailScope: users.monthlyEmailScope, monthlyEmailLastSent: users.monthlyEmailLastSent })
    .from(users)
    .where(and(eq(users.monthlyEmailEnabled, true), eq(users.monthlyEmailHour, now.hour), eq(users.isDeactivated, false)));

  const label = `${MONTHS_SK[now.month - 1]} ${now.year}`;
  const today = new Date(now.year, now.month - 1, now.day);
  for (const user of subscribers) {
    if (user.monthlyEmailLastSent === ym) continue;
    try {
      const data = await buildSummary(user, now.year, now.month, today);
      await sendEmail(user.email, `Finvu — Mesačný súhrn (${label})`, renderSummaryHtml(data));
      await db.update(users).set({ monthlyEmailLastSent: ym }).where(eq(users.id, user.id));
    } catch (err) {
      console.error(`[monthlyReport] send failed for ${user.id}:`, err);
    }
  }
}

export function startMonthlyReportJob(): void {
  // Every hour on the candidate days 28–31 (node-cron has no "last day" token);
  // each subscriber picks their own hour and the last-sent month stops repeats.
  cron.schedule("0 * 28-31 * *", () => {
    sendMonthlyReports().catch((err) => console.error("[monthlyReport] Error:", err));
  }, { timezone: TZ });
  console.log("[monthlyReport] Scheduled: last day of month, at each subscriber's hour");
}
