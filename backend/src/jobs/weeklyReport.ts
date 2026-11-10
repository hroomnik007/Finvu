import cron from "node-cron";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import { db } from "../db";
import { users, transactions } from "../db/schema";
import { sendEmail } from "../lib/email";
import { env } from "../config/env";
import { escapeHtml } from "../lib/monthlySummary";
import { midMonthLabels } from "../lib/midMonthEmailText";
import { resolveEmailLang } from "../lib/monthlyEmailText";
import { recurringTotalsForMonth } from "../lib/recurring";
import { startMonthOf } from "../lib/trackingStart";

// Income / expenses of one user for [from, to] (inclusive, same calendar month),
// counted like the app does: one-off rows by their date, plus recurring items
// carried into the month (see recurringTotalsForMonth). `asOf` is the moment the
// report is produced — it decides which recurring expenses have already fallen due.
// A month before the user's first tracked month (`startMonth`, YYYY-MM) is empty.
export async function periodTotals(userId: string, from: string, to: string, asOf: Date, startMonth?: string | null): Promise<{ income: number; expense: number }> {
  if (startMonth && from.slice(0, 7) < startMonth) return { income: 0, expense: 0 };
  const oneOff = await db
    .select({ type: transactions.type, amount: sql<string>`sum(${transactions.amount})` })
    .from(transactions)
    .where(and(eq(transactions.userId, userId), eq(transactions.isFixed, false), gte(transactions.date, from), lte(transactions.date, to)))
    .groupBy(transactions.type);

  const fixed = await db
    .select({ type: transactions.type, description: transactions.description, amount: transactions.amount, date: transactions.date, endedOn: transactions.endedOn })
    .from(transactions)
    .where(and(eq(transactions.userId, userId), eq(transactions.isFixed, true), lte(transactions.date, to)))
    .orderBy(transactions.date);

  const recurring = recurringTotalsForMonth(fixed, Number(from.slice(0, 4)), Number(from.slice(5, 7)), asOf);
  return {
    income: parseFloat(oneOff.find((r) => r.type === "income")?.amount ?? "0") + recurring.income,
    expense: parseFloat(oneOff.find((r) => r.type === "expense")?.amount ?? "0") + recurring.expense,
  };
}

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
function getMonthToMidRange(): { from: string; to: string; month: number; year: number } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  return {
    from: `${y}-${pad(m)}-01`,
    to: `${y}-${pad(m)}-15`,
    month: m,
    year: y,
  };
}

export interface MidMonthData {
  income: number;
  expense: number;
  month: number;
  year: number;
  language?: string | null;
  settingsUrl?: string;
}

export function renderMidMonthHtml(d: MidMonthData): string {
  const { t, shared, label } = midMonthLabels(d.language, d.month, d.year);
  const balance = d.income - d.expense;
  const link = d.settingsUrl
    ? `<a href="${escapeHtml(d.settingsUrl)}" style="color:#9D84D4;text-decoration:underline;">${shared.footerLink}</a>`
    : shared.footerLink;
  return `
<!DOCTYPE html>
<html lang="${resolveEmailLang(d.language)}">
<head><meta charset="utf-8"></head>
<body style="font-family:sans-serif;background:#0D0A1A;color:#E2D9F3;padding:32px;max-width:480px;margin:0 auto;">
  <div style="text-align:center;margin-bottom:28px;">
    <h1 style="font-size:22px;font-weight:700;color:#E2D9F3;margin:0 0 4px;">${t.title}</h1>
    <p style="font-size:13px;color:#9D84D4;margin:0;">${label}</p>
  </div>
  <div style="background:#2A1F4A;border-radius:16px;padding:20px;margin-bottom:16px;">
    <p style="font-size:12px;color:#9D84D4;margin:0 0 4px;">${shared.income}</p>
    <p style="font-size:24px;font-weight:700;color:#34D399;margin:0;font-family:monospace;">+${formatAmount(d.income)}</p>
  </div>
  <div style="background:#2A1F4A;border-radius:16px;padding:20px;margin-bottom:16px;">
    <p style="font-size:12px;color:#9D84D4;margin:0 0 4px;">${shared.expense}</p>
    <p style="font-size:24px;font-weight:700;color:#F87171;margin:0;font-family:monospace;">-${formatAmount(d.expense)}</p>
  </div>
  <div style="background:#1E1535;border:1px solid #4C3A8A;border-radius:16px;padding:20px;">
    <p style="font-size:12px;color:#9D84D4;margin:0 0 4px;">${t.difference}</p>
    <p style="font-size:28px;font-weight:700;color:${balance >= 0 ? "#34D399" : "#F87171"};margin:0;font-family:monospace;">${balance >= 0 ? "+" : ""}${formatAmount(balance)}</p>
  </div>
  <p style="font-size:12px;color:#6B5A9E;text-align:center;margin-top:24px;">
    ${t.footerLead}<br>
    ${t.footerBeforeLink}${link}${t.footerAfterLink}
  </p>
</body>
</html>`;
}

async function sendMidMonthReports(): Promise<void> {
  const { from, to, month, year } = getMonthToMidRange();
  // Where the e-mail footer sends people to turn it off (also the List-Unsubscribe target)
  const settingsUrl = `${env.APP_URL.replace(/\/+$/, "")}/#settings`;

  const subscribers = await db
    .select({ id: users.id, email: users.email, name: users.name, language: users.language, trackingStartDate: users.trackingStartDate, createdAt: users.createdAt })
    .from(users)
    .where(and(eq(users.weeklyEmailEnabled, true), eq(users.isDeactivated, false)));

  for (const user of subscribers) {
    const { income: totalIncome, expense: totalExpense } = await periodTotals(user.id, from, to, new Date(), startMonthOf(user.trackingStartDate, user.createdAt));
    const balance = totalIncome - totalExpense;

    const { subject } = midMonthLabels(user.language, month, year);
    const html = renderMidMonthHtml({ income: totalIncome, expense: totalExpense, month, year, language: user.language, settingsUrl });

    await sendEmail(user.email, subject, html, undefined, { "List-Unsubscribe": `<${settingsUrl}>` }).catch((err) =>
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
