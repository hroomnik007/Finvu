// Shared rules for recurring (isFixed) transactions.
import { isTrackedMonth, type StartMonths } from "./trackingStart";

// Day of month a fixed expense falls due: the day stored in its JSON
// description ({ d }), otherwise the day of the row's own date.
export function fixedDayOfMonth(description: string | null, date: string): number {
  let day = date ? Number(date.slice(8, 10)) : 1;
  try {
    const obj = JSON.parse(description ?? "");
    if (obj && typeof obj.d === "number") day = obj.d;
  } catch { /* plain text description */ }
  return day;
}

// How often a fixed expense recurs: every month (the default), or every 3 / 12
// months starting from an anchor month. Stored next to the label in the JSON
// description as { p: 3 | 12, m: 1..12 }; an item without them is monthly, so
// existing descriptions (the series identity) are unchanged.
export function recurrenceOf(description: string | null): { every: number; anchorMonth: number } | null {
  try {
    const obj = JSON.parse(description ?? "");
    if (obj && (obj.p === 3 || obj.p === 12) && Number.isInteger(obj.m) && obj.m >= 1 && obj.m <= 12) {
      return { every: obj.p, anchorMonth: obj.m };
    }
  } catch { /* plain text description */ }
  return null;
}

// Whether a series is charged in the given calendar month at all. A quarterly or
// yearly item counts in full in the months it is paid and not at all in between.
export function occursInMonth(description: string | null, month: number): boolean {
  const r = recurrenceOf(description);
  return !r || (((month - r.anchorMonth) % r.every) + r.every) % r.every === 0;
}

// A recurring item only counts once its day in the given month has arrived: a
// fixed expense on its due day, a recurring income on its payday (the day of the
// row's date) — mirrors the frontend's isFixedExpenseDue (useFixedExpenses.ts).
// Past months always count in full, future months not at all.
export function isFixedDue(dayOfMonth: number, year: number, month: number, today: Date): boolean {
  const curMonth = today.getMonth() + 1;
  const curYear = today.getFullYear();
  if (year !== curYear) return year < curYear;
  if (month !== curMonth) return month < curMonth;
  // Due on the 29th–31st in a shorter month = due on its last day
  return Math.min(dayOfMonth, new Date(year, month, 0).getDate()) <= today.getDate();
}

// Day of month a recurring row counts from: a fixed expense's due day, or the
// payday of a recurring income (its description is the plain label, so the day
// is the one of the row's own date).
export function recurringDay(row: { type: string; description: string | null; date: string }): number {
  return row.type === "income" ? (row.date ? Number(row.date.slice(8, 10)) : 1) : fixedDayOfMonth(row.description, row.date);
}

export interface FixedRow {
  userId?: string;
  type: string;
  description: string | null;
  amount: string;
  date: string;
  /** First day of the first month the series no longer applies (null/absent = running). */
  endedOn?: string | null;
}

// Index of a month on a single axis (year * 12 + month - 1).
function monthIndex(year: number, month: number): number {
  return year * 12 + (month - 1);
}

// Whether a series still applies to the month: it ended on the first day of the
// first month it no longer counts (endedOn), so months from that one on are out.
export function isActiveInMonth(endedOn: string | null | undefined, year: number, month: number): boolean {
  if (!endedOn) return true;
  return monthIndex(year, month) < monthIndex(Number(endedOn.slice(0, 4)), Number(endedOn.slice(5, 7)));
}

// Total of the recurring (isFixed) rows that apply to ONE calendar month.
// `rows` must be ascending by date and contain only rows dated before the end of
// that month. A recurring row is entered once and counts in every month from its
// own date on: each series (user + type + description) via its latest
// occurrence, and only once its day (due day / payday) has arrived.
export function recurringTotalsForMonth(
  rows: FixedRow[],
  year: number,
  month: number,
  today: Date,
): { income: number; expense: number } {
  const latest = new Map<string, FixedRow>();
  for (const row of rows) latest.set(`${row.userId ?? ""}|${row.type}|${row.description ?? ""}`, row);

  let income = 0;
  let expense = 0;
  for (const row of latest.values()) {
    if (!isActiveInMonth(row.endedOn, year, month) || !occursInMonth(row.description, month)) continue;
    const amount = parseFloat(row.amount);
    if (!isFixedDue(recurringDay(row), year, month, today)) continue;
    if (row.type === "income") income += amount;
    else expense += amount;
  }
  return { income, expense };
}

// First day of the month after (year, month), as YYYY-MM-DD — rows dated before it
// belong to that month or earlier.
function nextMonthStart(year: number, month: number): string {
  return month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;
}

// The row each recurring series (user + type + description) has in ONE month: its
// latest occurrence dated before the month's end, left out once ended. `rows`
// must be ascending by date.
export function latestActiveSeries<T extends FixedRow>(rows: T[], year: number, month: number): T[] {
  const end = nextMonthStart(year, month);
  const latest = new Map<string, T>();
  for (const row of rows) {
    if (row.date < end) latest.set(`${row.userId ?? ""}|${row.type}|${row.description ?? ""}`, row);
  }
  return [...latest.values()].filter((r) => isActiveInMonth(r.endedOn, year, month) && occursInMonth(r.description, month));
}

// What the recurring series add up to in ONE month, regardless of due days: each
// series (user + type + description) through its latest row dated before the
// month's end, left out once it has ended. Used for budgets (auto limit), which
// plan the whole month. `rows` must be ascending by date.
export function activeSeriesTotal(rows: FixedRow[], year: number, month: number): number {
  const end = nextMonthStart(year, month);
  const latest = new Map<string, FixedRow>();
  for (const row of rows) {
    if (row.date < end) latest.set(`${row.userId ?? ""}|${row.type}|${row.description ?? ""}`, row);
  }
  let total = 0;
  for (const row of latest.values()) {
    if (!isActiveInMonth(row.endedOn, year, month) || !occursInMonth(row.description, month)) continue;
    const amount = parseFloat(row.amount);
    total += Number.isFinite(amount) ? amount : 0;
  }
  return total;
}

// Whether any series is still running in the month, charged in it or not (a
// yearly item is "running" in all twelve months). `rows` must be ascending by date.
export function hasRunningSeries(rows: FixedRow[], year: number, month: number): boolean {
  const end = nextMonthStart(year, month);
  const latest = new Map<string, FixedRow>();
  for (const row of rows) {
    if (row.date < end) latest.set(`${row.userId ?? ""}|${row.type}|${row.description ?? ""}`, row);
  }
  return [...latest.values()].some((r) => isActiveInMonth(r.endedOn, year, month));
}

// Cumulative balance over the month indexes [firstIdx, targetIdx] (index = year * 12
// + month - 1), built month by month with the SAME rules as the monthly cards:
// one-off rows count in the month they are dated (`oneOffByMonth`, key "YYYY-MM"),
// while a recurring row is entered once and counts in every month from its own
// date on — each series via its latest occurrence, and only once its day (due
// day / payday) has arrived. `fixedRows` must be ascending by date.
export function cumulativeBalanceFromRows(
  oneOffByMonth: Map<string, { income: number; expense: number }>,
  fixedRows: FixedRow[],
  firstIdx: number,
  targetIdx: number,
  today: Date,
  // Each user's first tracked month: their recurring rows only count from it on
  // (one-off rows before it must already be left out of `oneOffByMonth`).
  starts?: StartMonths,
): number {
  // Amount, direction and due day are parsed once per row when it becomes the
  // latest of its series — the month loop below then only does arithmetic.
  const latest = new Map<string, { userId?: string; isIncome: boolean; amount: number; dueDay: number; endIdx: number; description: string | null; periodic: boolean }>();
  let next = 0;
  let balance = 0;

  for (let idx = firstIdx; idx <= targetIdx; idx++) {
    const y = Math.floor(idx / 12);
    const m = (idx % 12) + 1;
    const monthEnd = nextMonthStart(y, m);

    while (next < fixedRows.length && fixedRows[next].date < monthEnd) {
      const row = fixedRows[next++];
      latest.set(`${row.userId ?? ""}|${row.type}|${row.description ?? ""}`, {
        userId: row.userId,
        isIncome: row.type === "income",
        amount: parseFloat(row.amount),
        dueDay: recurringDay(row),
        endIdx: row.endedOn ? monthIndex(Number(row.endedOn.slice(0, 4)), Number(row.endedOn.slice(5, 7))) : Infinity,
        description: row.description,
        periodic: recurrenceOf(row.description) !== null,
      });
    }

    const ym = `${y}-${String(m).padStart(2, "0")}`;
    const flat = oneOffByMonth.get(ym);
    let income = flat?.income ?? 0;
    let expense = flat?.expense ?? 0;
    for (const row of latest.values()) {
      if (idx >= row.endIdx) continue;
      if (row.periodic && !occursInMonth(row.description, m)) continue;
      if (!isTrackedMonth(starts, row.userId, ym)) continue;
      if (!isFixedDue(row.dueDay, y, m, today)) continue;
      if (row.isIncome) income += row.amount;
      else expense += row.amount;
    }
    balance += income - expense;
  }

  return Math.round(balance * 100) / 100;
}
