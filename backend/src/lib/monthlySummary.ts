import { fixedDayOfMonth, isFixedDue, latestActiveSeries } from "./recurring";
import { isTrackedMonth, type StartMonths } from "./trackingStart";

// One amount the month counts: a one-off row, or a recurring series at the price
// valid for the month.
export interface MonthRow {
  userId: string;
  type: "income" | "expense";
  amount: number;
  categoryId: string | null;
  label: string;
  date: string;
  fixed: boolean;
}

export interface RawTx {
  userId: string;
  type: string;
  amount: string;
  categoryId: string | null;
  description: string | null;
  date: string;
  isFixed: boolean;
  endedOn: string | null;
}

export interface SummaryCategory {
  id: string;
  userId: string;
  name: string;
  type: string;
  limit: number | null;
  shared: boolean;
}

export interface SummaryGoal {
  name: string;
  saved: number;
  target: number;
  owner?: string;
  paused: boolean;
}

// Plain-text label of a transaction: recurring expenses keep it in a JSON description.
function labelOf(description: string | null): string {
  if (!description) return "";
  try {
    const obj = JSON.parse(description);
    if (obj && typeof obj.l === "string") return obj.l;
  } catch { /* plain text */ }
  return description;
}

// The rows that make up ONE month for the given transactions (ascending by date):
// one-off rows dated in it plus every active recurring series. A finished month
// counts all recurring expenses in full (their due day has passed); pass `today`
// to count the running month like the app does — only the expenses already due.
// With `starts`, a user's month before their tracking start is empty (see
// trackingStart.ts); their recurring rows dated earlier still count afterwards.
export function monthRows(txs: RawTx[], year: number, month: number, today?: Date, starts?: StartMonths): MonthRow[] {
  const ym = `${year}-${String(month).padStart(2, "0")}`;
  if (starts) txs = txs.filter((t) => isTrackedMonth(starts, t.userId, ym));
  const toRow = (t: RawTx): MonthRow => ({
    userId: t.userId,
    type: t.type === "income" ? "income" : "expense",
    amount: parseFloat(t.amount),
    categoryId: t.categoryId,
    label: labelOf(t.description),
    date: t.date,
    fixed: t.isFixed,
  });
  const oneOff = txs.filter((t) => !t.isFixed && t.date.startsWith(ym)).map(toRow);
  const fixed = latestActiveSeries(txs.filter((t) => t.isFixed), year, month)
    .filter((t) => !today || t.type === "income" || isFixedDue(fixedDayOfMonth(t.description, t.date), year, month, today))
    .map(toRow);
  return [...oneOff, ...fixed];
}

export function totals(rows: MonthRow[]): { income: number; expense: number } {
  let income = 0;
  let expense = 0;
  for (const r of rows) {
    if (r.type === "income") income += r.amount;
    else expense += r.amount;
  }
  return { income, expense };
}

// Share of income that was kept; null when there was no income to measure against.
export function savingsRate(income: number, expense: number): number | null {
  return income > 0 ? (income - expense) / income : null;
}

export function topCategories(rows: MonthRow[], names: Map<string, string>, n = 3): { name: string; amount: number }[] {
  const sums = new Map<string, number>();
  for (const r of rows) {
    if (r.type !== "expense") continue;
    const key = r.categoryId ?? "";
    sums.set(key, (sums.get(key) ?? 0) + r.amount);
  }
  return [...sums.entries()]
    .map(([id, amount]) => ({ name: names.get(id) ?? "Bez kategórie", amount }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, n);
}

export function largestPayment(rows: MonthRow[]): MonthRow | null {
  let best: MonthRow | null = null;
  for (const r of rows) {
    if (r.type === "expense" && (!best || r.amount > best.amount)) best = r;
  }
  return best;
}

export interface OverLimit {
  name: string;
  limit: number;
  spent: number;
  shared: boolean;
  /** Per-member spending of a shared category (name → amount). */
  split: { name: string; amount: number }[];
}

// Expense categories of the user whose limit was exceeded. Shared categories are
// judged on the whole family's spending (they have one common limit) and carry the
// per-member split; the rest on the user's own spending. `rows` must hold every
// sharing member's rows.
export function categoriesOverLimit(
  userId: string,
  categories: SummaryCategory[],
  rows: MonthRow[],
  userNames: Map<string, string>,
): OverLimit[] {
  const result: OverLimit[] = [];
  const spentBy = (catIds: Set<string>, onlyUser?: string) => {
    const sums = new Map<string, number>();
    for (const r of rows) {
      if (r.type !== "expense" || !r.categoryId || !catIds.has(r.categoryId)) continue;
      if (onlyUser && r.userId !== onlyUser) continue;
      sums.set(r.userId, (sums.get(r.userId) ?? 0) + r.amount);
    }
    return sums;
  };

  for (const cat of categories) {
    if (cat.userId !== userId || cat.type !== "expense" || !cat.limit || cat.limit <= 0) continue;
    if (cat.shared) {
      const key = cat.name.trim().toLowerCase();
      const group = categories.filter((c) => c.shared && c.type === "expense" && c.name.trim().toLowerCase() === key);
      const perMember = spentBy(new Set(group.map((c) => c.id)));
      const spent = [...perMember.values()].reduce((s, v) => s + v, 0);
      if (spent > cat.limit) {
        result.push({
          name: cat.name,
          limit: cat.limit,
          spent,
          shared: true,
          split: [...perMember.entries()]
            .map(([id, amount]) => ({ name: userNames.get(id) ?? "?", amount }))
            .sort((a, b) => b.amount - a.amount),
        });
      }
    } else {
      const spent = spentBy(new Set([cat.id]), userId).get(userId) ?? 0;
      if (spent > cat.limit) result.push({ name: cat.name, limit: cat.limit, spent, shared: false, split: [] });
    }
  }
  return result.sort((a, b) => b.spent / b.limit - a.spent / a.limit);
}

export interface UpcomingPayment {
  label: string;
  amount: number;
  day: number;
  inDays: number;
}

// Recurring expenses that will fall due in the month after `today`, with the days left.
export function upcomingPayments(txs: RawTx[], today: Date): UpcomingPayment[] {
  const ny = today.getMonth() === 11 ? today.getFullYear() + 1 : today.getFullYear();
  const nm = today.getMonth() === 11 ? 1 : today.getMonth() + 2;
  const daysInNext = new Date(ny, nm, 0).getDate();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  return latestActiveSeries(txs.filter((t) => t.isFixed && t.type === "expense"), ny, nm)
    .map((t) => {
      const day = Math.min(fixedDayOfMonth(t.description, t.date), daysInNext);
      const due = new Date(ny, nm - 1, day).getTime();
      return { label: labelOf(t.description), amount: parseFloat(t.amount), day, inDays: Math.round((due - startOfToday) / 86400000) };
    })
    .sort((a, b) => a.day - b.day || b.amount - a.amount);
}

export interface MemberSplit {
  name: string;
  income: number;
  expense: number;
}

export function memberSplit(rows: MonthRow[], userNames: Map<string, string>): MemberSplit[] {
  const by = new Map<string, MemberSplit>();
  for (const r of rows) {
    const m = by.get(r.userId) ?? { name: userNames.get(r.userId) ?? "?", income: 0, expense: 0 };
    if (r.type === "income") m.income += r.amount;
    else m.expense += r.amount;
    by.set(r.userId, m);
  }
  return [...by.values()].sort((a, b) => b.expense - a.expense);
}

// ── Rendering ────────────────────────────────────────────────────────────────

const MONTHS_SK = ["Január", "Február", "Marec", "Apríl", "Máj", "Jún", "Júl", "August", "September", "Október", "November", "December"];

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function formatEur(n: number): string {
  const [int, dec] = Math.abs(n).toFixed(2).split(".");
  return `${n < 0 ? "-" : ""}${int.replace(/\B(?=(\d{3})+(?!\d))/g, " ")},${dec} €`;
}

export interface SummaryData {
  year: number;
  month: number;
  family: boolean;
  income: number;
  expense: number;
  prevIncome: number;
  prevExpense: number;
  top: { name: string; amount: number }[];
  largest: { label: string; amount: number; date: string } | null;
  over: OverLimit[];
  upcoming: UpcomingPayment[];
  goals: SummaryGoal[];
  members: MemberSplit[];
}

const card = "background:#2A1F4A;border-radius:16px;padding:16px 20px;margin-bottom:12px;";
const h2 = "font-size:12px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#9D84D4;margin:0 0 10px;";
const row = (left: string, right: string) =>
  `<tr><td style="padding:3px 0;font-size:14px;color:#E2D9F3;">${left}</td><td style="padding:3px 0;font-size:14px;color:#E2D9F3;text-align:right;white-space:nowrap;font-family:monospace;">${right}</td></tr>`;

export function renderSummaryHtml(d: SummaryData): string {
  const label = `${MONTHS_SK[d.month - 1]} ${d.year}`;
  const balance = d.income - d.expense;
  const rate = savingsRate(d.income, d.expense);
  const prevRate = savingsRate(d.prevIncome, d.prevExpense);
  const pct = (v: number) => `${(v * 100).toFixed(0).replace("-", "−")} %`;
  let rateLine = "";
  if (rate !== null) {
    rateLine = `Odložených ${pct(rate)} príjmov`;
    if (prevRate !== null) {
      const diff = Math.round((rate - prevRate) * 100);
      rateLine += diff === 0 ? " — rovnako ako minulý mesiac" : ` (${diff > 0 ? "+" : "−"}${Math.abs(diff)} p. b. oproti minulému mesiacu)`;
    }
  } else {
    rateLine = "Tento mesiac si nemal žiadne príjmy.";
  }

  const sections: string[] = [];

  sections.push(`
  <div style="${card}">
    <table width="100%" cellspacing="0" cellpadding="0">
      ${row("Príjmy", `<span style="color:#34D399;">+${formatEur(d.income)}</span>`)}
      ${row("Výdavky", `<span style="color:#F87171;">−${formatEur(d.expense)}</span>`)}
      ${row("<b>Zostatok</b>", `<b style="color:${balance >= 0 ? "#34D399" : "#F87171"};">${balance >= 0 ? "+" : ""}${formatEur(balance)}</b>`)}
    </table>
    <p style="font-size:13px;color:#C4B5FD;margin:10px 0 0;">${rateLine}</p>
  </div>`);

  if (d.family && d.members.length > 1) {
    sections.push(`
  <div style="${card}">
    <p style="${h2}">Rodina podľa členov</p>
    <table width="100%" cellspacing="0" cellpadding="0">
      ${d.members.map((m) => row(escapeHtml(m.name), `<span style="color:#34D399;">+${formatEur(m.income)}</span> &nbsp; <span style="color:#F87171;">−${formatEur(m.expense)}</span>`)).join("")}
    </table>
  </div>`);
  }

  if (d.top.length) {
    sections.push(`
  <div style="${card}">
    <p style="${h2}">Najväčšie kategórie výdavkov</p>
    <table width="100%" cellspacing="0" cellpadding="0">
      ${d.top.map((c, i) => row(`${i + 1}. ${escapeHtml(c.name)}`, formatEur(c.amount))).join("")}
    </table>
  </div>`);
  }

  if (d.largest) {
    sections.push(`
  <div style="${card}">
    <p style="${h2}">Najväčšia jednotlivá platba</p>
    <table width="100%" cellspacing="0" cellpadding="0">
      ${row(escapeHtml(d.largest.label || "Bez popisu"), formatEur(d.largest.amount))}
    </table>
  </div>`);
  }

  if (d.over.length) {
    sections.push(`
  <div style="${card}border:1px solid #7F1D1D;">
    <p style="${h2}color:#F87171;">Prekročený limit</p>
    <table width="100%" cellspacing="0" cellpadding="0">
      ${d.over
        .map((o) => {
          const head = row(`${escapeHtml(o.name)}${o.shared ? " <span style=\"color:#9D84D4;\">(spoločná)</span>" : ""}`, `${formatEur(o.spent)} / ${formatEur(o.limit)}`);
          const split = o.split.length > 1
            ? o.split.map((s) => `<tr><td style="padding:0 0 0 14px;font-size:12px;color:#9D84D4;">${escapeHtml(s.name)}</td><td style="font-size:12px;color:#9D84D4;text-align:right;font-family:monospace;">${formatEur(s.amount)}</td></tr>`).join("")
            : "";
          return head + split;
        })
        .join("")}
    </table>
  </div>`);
  }

  if (d.upcoming.length) {
    const shown = d.upcoming.slice(0, 8);
    const more = d.upcoming.length - shown.length;
    const when = (u: UpcomingPayment) => (u.inDays <= 0 ? "dnes" : u.inDays === 1 ? "zajtra" : `o ${u.inDays} dní`);
    const total = d.upcoming.reduce((s, u) => s + u.amount, 0);
    sections.push(`
  <div style="${card}">
    <p style="${h2}">Čo ťa čaká budúci mesiac</p>
    <table width="100%" cellspacing="0" cellpadding="0">
      ${shown.map((u) => row(`${u.day}. ${escapeHtml(u.label || "Platba")} <span style="color:#9D84D4;font-size:12px;">(${when(u)})</span>`, formatEur(u.amount))).join("")}
      ${more > 0 ? row(`<span style="color:#9D84D4;">… a ďalších ${more}</span>`, "") : ""}
      ${row("<b>Spolu</b>", `<b>${formatEur(total)}</b>`)}
    </table>
  </div>`);
  }

  if (d.goals.length) {
    sections.push(`
  <div style="${card}">
    <p style="${h2}">Sporiace ciele</p>
    ${d.goals
      .map((g) => {
        const p = g.target > 0 ? Math.min(100, Math.round((g.saved / g.target) * 100)) : 0;
        const owner = g.owner ? ` <span style="color:#9D84D4;font-size:12px;">· ${escapeHtml(g.owner)}</span>` : "";
        return `<p style="font-size:14px;margin:8px 0 4px;color:#E2D9F3;">${escapeHtml(g.name)}${owner}${g.paused ? " <span style=\"color:#9D84D4;font-size:12px;\">(pozastavený)</span>" : ""}</p>
      <div style="background:#1E1535;border-radius:6px;height:8px;"><div style="background:#8B5CF6;border-radius:6px;height:8px;width:${p}%;"></div></div>
      <p style="font-size:12px;color:#9D84D4;margin:4px 0 0;">${formatEur(g.saved)} z ${formatEur(g.target)} · ${p} %</p>`;
      })
      .join("")}
  </div>`);
  }

  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="font-family:sans-serif;background:#0D0A1A;color:#E2D9F3;padding:32px;max-width:520px;margin:0 auto;">
  <div style="text-align:center;margin-bottom:24px;">
    <h1 style="font-size:22px;font-weight:700;color:#E2D9F3;margin:0 0 4px;">Finvu — Mesačný súhrn${d.family ? " rodiny" : ""}</h1>
    <p style="font-size:13px;color:#9D84D4;margin:0;">${label}</p>
  </div>${sections.join("")}
  <p style="font-size:12px;color:#6B5A9E;text-align:center;margin-top:24px;">
    Správu dostávaš, pretože máš zapnutý mesačný súhrn vo Finvu.<br>
    Vypnúť ho alebo zmeniť čas odoslania môžeš v Nastaveniach.
  </p>
</body></html>`;
}
