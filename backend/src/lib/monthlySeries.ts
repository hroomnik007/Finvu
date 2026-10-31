import { monthRows, totals, type RawTx } from "./monthlySummary";
import type { StartMonths } from "./trackingStart";

export interface SeriesMonth {
  /** YYYY-MM */
  month: string;
  income: number;
  expense: number;
  /** Per member, only for a family series. */
  members?: { userId: string; name: string; income: number; expense: number }[];
  /** Per category (same names merged across members), only on request. */
  categories?: { name: string; color: string | null; type: "income" | "expense"; total: number }[];
}

export interface SeriesOptions {
  userNames?: Map<string, string>;
  /** Category id → display info. Pass to include the category breakdown. */
  categoryInfo?: Map<string, { name: string; color: string | null }>;
  /** Each user's first tracked month; earlier months are empty for that user. */
  startMonths?: StartMonths;
}

// Every YYYY-MM from `from` to `to` inclusive.
export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let y = Number(from.slice(0, 4));
  let m = Number(from.slice(5, 7));
  const endIdx = Number(to.slice(0, 4)) * 12 + Number(to.slice(5, 7));
  while (y * 12 + m <= endIdx) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return out;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// Income and expenses per month with the app's recurring rules (see monthRows):
// recurring items count in every month from their start until they end, and the
// running month only counts expenses already due. `txs` must be ascending by date.
export function buildSeries(txs: RawTx[], from: string, to: string, today: Date, opts: SeriesOptions = {}): SeriesMonth[] {
  return monthsBetween(from, to).map((ym) => {
    const rows = monthRows(txs, Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), today, opts.startMonths);
    const t = totals(rows);
    const item: SeriesMonth = { month: ym, income: round2(t.income), expense: round2(t.expense) };

    if (opts.userNames) {
      const by = new Map<string, { income: number; expense: number }>();
      for (const r of rows) {
        const m = by.get(r.userId) ?? { income: 0, expense: 0 };
        m[r.type] += r.amount;
        by.set(r.userId, m);
      }
      item.members = [...by.entries()]
        .map(([userId, v]) => ({ userId, name: opts.userNames!.get(userId) ?? "?", income: round2(v.income), expense: round2(v.expense) }))
        .sort((a, b) => a.name.localeCompare(b.name));
    }

    if (opts.categoryInfo) {
      const by = new Map<string, { name: string; color: string | null; type: "income" | "expense"; total: number }>();
      for (const r of rows) {
        const info = r.categoryId ? opts.categoryInfo.get(r.categoryId) : undefined;
        const name = info?.name ?? "";
        const key = `${r.type}|${name.trim().toLowerCase()}`;
        const cur = by.get(key) ?? { name, color: info?.color ?? null, type: r.type, total: 0 };
        cur.total += r.amount;
        by.set(key, cur);
      }
      item.categories = [...by.values()].map((c) => ({ ...c, total: round2(c.total) })).sort((a, b) => b.total - a.total);
    }
    return item;
  });
}
