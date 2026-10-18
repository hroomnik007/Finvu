import cron from "node-cron";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import { db } from "../db";
import { users, transactions } from "../db/schema";
import { sendEmail } from "../lib/email";
import { recurringTotalsForMonth } from "../lib/recurring";

// Income / expenses of one user for [from, to] (inclusive, same calendar month),
// counted like the app does: one-off rows by their date, plus recurring items
// carried into the month (see recurringTotalsForMonth). `asOf` is the moment the
// report is produced — it decides which recurring expenses have already fallen due.
async function periodTotals(userId: string, from: string, to: string, asOf: Date): Promise<{ income: number; expense: number }> {
  const oneOff = await db
    .select({ type: transactions.type, amount: sql<string>`sum(${transactions.amount})` })
    .from(transactions)
    .where(and(eq(transactions.userId, userId), eq(transactions.isFixed, false), gte(transactions.date, from), lte(transactions.date, to)))
    .groupBy(transactions.type);

  const fixed = await db
    .select({ type: transactions.type, description: transactions.description, amount: transactions.amount, date: transactions.date })
    .from(transactions)
    .where(and(eq(transactions.userId, userId), eq(transactions.isFixed, true), lte(transactions.date, to)))
    .orderBy(transactions.date);

  const recurring = recurringTotalsForMonth(fixed, Number(from.slice(0, 4)), Number(from.slice(5, 7)), asOf);
  return {
    income: parseFloat(oneOff.find((r) => r.type === "income")?.amount ?? "0") + recurring.income,
    expense: parseFloat(oneOff.find((r) => r.type === "expense")?.amount ?? "0") + recurring.expense,
  };
}

const MONTHS = ["Január","Február","Marec","Apríl","Máj","Jún","Júl","August","September","Október","November","December"];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function formatAmount(n: number): string {
  return n.toFixed(2).replace(".", ",") + " €";
}

// ── Mid-month summary (fires on the 15th) ─────────────────────────────────────
// Covers the current month so far: 1st → 15th. Reuses the `weeklyEmailEnabled`
// toggle (kept as-is in the DB; the Settings UI now labels it "Súhrn v polovici
// mesiaca"). Same summary content as before — only the schedule/label changed.
function getMonthToMidRange(): { from: string; to: string; label: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  return {
    from: `${y}-${pad(m)}-01`,
    to: `${y}-${pad(m)}-15`,
    label: `1. – 15. ${MONTHS[m - 1]} ${y}`,
  };
}

async function sendMidMonthReports(): Promise<void> {
  const { from, to, label } = getMonthToMidRange();

  const subscribers = await db
    .select({ id: users.id, email: users.email, name: users.name })
    .from(users)
    .where(eq(users.weeklyEmailEnabled, true));

  for (const user of subscribers) {
    const { income: totalIncome, expense: totalExpense } = await periodTotals(user.id, from, to, new Date());
    const balance = totalIncome - totalExpense;

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:sans-serif;background:#0D0A1A;color:#E2D9F3;padding:32px;max-width:480px;margin:0 auto;">
  <div style="text-align:center;margin-bottom:28px;">
    <h1 style="font-size:22px;font-weight:700;color:#E2D9F3;margin:0 0 4px;">Finvu — Súhrn v polovici mesiaca</h1>
    <p style="font-size:13px;color:#9D84D4;margin:0;">${label}</p>
  </div>
  <div style="background:#2A1F4A;border-radius:16px;padding:20px;margin-bottom:16px;">
    <p style="font-size:12px;color:#9D84D4;margin:0 0 4px;">Príjmy</p>
    <p style="font-size:24px;font-weight:700;color:#34D399;margin:0;font-family:monospace;">+${formatAmount(totalIncome)}</p>
  </div>
  <div style="background:#2A1F4A;border-radius:16px;padding:20px;margin-bottom:16px;">
    <p style="font-size:12px;color:#9D84D4;margin:0 0 4px;">Výdavky</p>
    <p style="font-size:24px;font-weight:700;color:#F87171;margin:0;font-family:monospace;">-${formatAmount(totalExpense)}</p>
  </div>
  <div style="background:#1E1535;border:1px solid #4C3A8A;border-radius:16px;padding:20px;">
    <p style="font-size:12px;color:#9D84D4;margin:0 0 4px;">Rozdiel</p>
    <p style="font-size:28px;font-weight:700;color:${balance >= 0 ? "#34D399" : "#F87171"};margin:0;font-family:monospace;">${balance >= 0 ? "+" : ""}${formatAmount(balance)}</p>
  </div>
  <p style="font-size:12px;color:#6B5A9E;text-align:center;margin-top:24px;">
    Správu dostávaš, pretože máš zapnutý súhrn v polovici mesiaca v Finvu.<br>
    Vypnúť ho môžeš v Nastaveniach.
  </p>
</body>
</html>`;

    await sendEmail(user.email, `Finvu — Súhrn v polovici mesiaca (${label})`, html).catch((err) =>
      console.error(`[midMonthReport] send failed for ${user.id}:`, err)
    );
  }
}

export function startWeeklyReportJob(): void {
  // 15th of each month at 08:00
  cron.schedule("0 8 15 * *", () => {
    sendMidMonthReports().catch((err) =>
      console.error("[midMonthReport] Error:", err)
    );
  });
  console.log("[midMonthReport] Scheduled: 15th of month 08:00");
}

// ── End-of-month summary (fires on the last day) ──────────────────────────────
// Covers the whole current (ending) month. Reuses the `monthlyEmailEnabled`
// toggle. Same summary content as before — only the schedule/range changed
// (was: 1st of month, previous month → now: last day of month, current month).
function getCurrentMonthRange(): { from: string; to: string; label: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const lastDay = new Date(y, m, 0).getDate();
  return {
    from: `${y}-${pad(m)}-01`,
    to: `${y}-${pad(m)}-${pad(lastDay)}`,
    label: `${MONTHS[m - 1]} ${y}`,
  };
}

async function sendMonthlyReports(): Promise<void> {
  const { from, to, label } = getCurrentMonthRange();

  const subscribers = await db
    .select({ id: users.id, email: users.email, name: users.name })
    .from(users)
    .where(eq(users.monthlyEmailEnabled, true));

  for (const user of subscribers) {
    const { income: totalIncome, expense: totalExpense } = await periodTotals(user.id, from, to, new Date());
    const balance = totalIncome - totalExpense;

    const html = `
<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="font-family:sans-serif;background:#0D0A1A;color:#E2D9F3;padding:32px;max-width:480px;margin:0 auto;">
  <div style="text-align:center;margin-bottom:28px;">
    <h1 style="font-size:22px;font-weight:700;color:#E2D9F3;margin:0 0 4px;">Finvu — Mesačný prehľad</h1>
    <p style="font-size:13px;color:#9D84D4;margin:0;">${label}</p>
  </div>
  <div style="background:#2A1F4A;border-radius:16px;padding:20px;margin-bottom:16px;">
    <p style="font-size:12px;color:#9D84D4;margin:0 0 4px;">Príjmy</p>
    <p style="font-size:24px;font-weight:700;color:#34D399;margin:0;font-family:monospace;">+${formatAmount(totalIncome)}</p>
  </div>
  <div style="background:#2A1F4A;border-radius:16px;padding:20px;margin-bottom:16px;">
    <p style="font-size:12px;color:#9D84D4;margin:0 0 4px;">Výdavky</p>
    <p style="font-size:24px;font-weight:700;color:#F87171;margin:0;font-family:monospace;">-${formatAmount(totalExpense)}</p>
  </div>
  <div style="background:#1E1535;border:1px solid #4C3A8A;border-radius:16px;padding:20px;">
    <p style="font-size:12px;color:#9D84D4;margin:0 0 4px;">Úspory</p>
    <p style="font-size:28px;font-weight:700;color:${balance >= 0 ? "#34D399" : "#F87171"};margin:0;font-family:monospace;">${balance >= 0 ? "+" : ""}${formatAmount(balance)}</p>
  </div>
  <p style="font-size:12px;color:#6B5A9E;text-align:center;margin-top:24px;">
    Správu dostávaš, pretože máš zapnutý mesačný súhrn v Finvu.<br>
    Vypnúť ho môžeš v Nastaveniach.
  </p>
</body></html>`;

    await sendEmail(user.email, `Finvu — Mesačný prehľad (${label})`, html).catch((err) =>
      console.error(`[monthlyReport] send failed for ${user.id}:`, err)
    );
  }
}

export function startMonthlyReportJob(): void {
  // Last day of each month at 09:00. node-cron has no "last day" token, so we
  // run on the candidate days 28–31 and only fire when tomorrow is the 1st.
  cron.schedule("0 9 28-31 * *", () => {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    if (tomorrow.getDate() !== 1) return; // not the last day of the month
    sendMonthlyReports().catch((err) =>
      console.error("[monthlyReport] Error:", err)
    );
  });
  console.log("[monthlyReport] Scheduled: last day of month 09:00");
}
