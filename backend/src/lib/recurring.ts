// Shared rules for recurring (isFixed) transactions.

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

// A fixed expense only becomes "spent" once its due day in the given month has
// arrived — mirrors the frontend's isFixedExpenseDue (useFixedExpenses.ts).
// Past months always count in full, future months not at all.
export function isFixedDue(dayOfMonth: number, year: number, month: number, today: Date): boolean {
  const curMonth = today.getMonth() + 1;
  const curYear = today.getFullYear();
  if (year !== curYear) return year < curYear;
  if (month !== curMonth) return month < curMonth;
  return dayOfMonth <= today.getDate();
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
// occurrence, and recurring expenses only once their due day has arrived.
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
    if (!isActiveInMonth(row.endedOn, year, month)) continue;
    const amount = parseFloat(row.amount);
    if (row.type === "income") income += amount;
    else if (isFixedDue(fixedDayOfMonth(row.description, row.date), year, month, today)) expense += amount;
  }
  return { income, expense };
}

// First day of the month after (year, month), as YYYY-MM-DD — rows dated before it
// belong to that month or earlier.
function nextMonthStart(year: number, month: number): string {
  return month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;
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
    if (!isActiveInMonth(row.endedOn, year, month)) continue;
    const amount = parseFloat(row.amount);
    total += Number.isFinite(amount) ? amount : 0;
  }
  return total;
}

// Cumulative balance over the month indexes [firstIdx, targetIdx] (index = year * 12
// + month - 1), built month by month with the SAME rules as the monthly cards:
// one-off rows count in the month they are dated (`oneOffByMonth`, key "YYYY-MM"),
// while a recurring row is entered once and counts in every month from its own
// date on — each series via its latest occurrence, recurring expenses only once
// their due day has arrived. `fixedRows` must be ascending by date.
export function cumulativeBalanceFromRows(
  oneOffByMonth: Map<string, { income: number; expense: number }>,
  fixedRows: FixedRow[],
  firstIdx: number,
  targetIdx: number,
  today: Date,
): number {
  // Amount, direction and due day are parsed once per row when it becomes the
  // latest of its series — the month loop below then only does arithmetic.
  const latest = new Map<string, { isIncome: boolean; amount: number; dueDay: number; endIdx: number }>();
  let next = 0;
  let balance = 0;

  for (let idx = firstIdx; idx <= targetIdx; idx++) {
    const y = Math.floor(idx / 12);
    const m = (idx % 12) + 1;
    const monthEnd = nextMonthStart(y, m);

    while (next < fixedRows.length && fixedRows[next].date < monthEnd) {
      const row = fixedRows[next++];
      latest.set(`${row.userId ?? ""}|${row.type}|${row.description ?? ""}`, {
        isIncome: row.type === "income",
        amount: parseFloat(row.amount),
        dueDay: fixedDayOfMonth(row.description, row.date),
        endIdx: row.endedOn ? monthIndex(Number(row.endedOn.slice(0, 4)), Number(row.endedOn.slice(5, 7))) : Infinity,
      });
    }

    const flat = oneOffByMonth.get(`${y}-${String(m).padStart(2, "0")}`);
    let income = flat?.income ?? 0;
    let expense = flat?.expense ?? 0;
    for (const row of latest.values()) {
      if (idx >= row.endIdx) continue;
      if (row.isIncome) income += row.amount;
      else if (isFixedDue(row.dueDay, y, m, today)) expense += row.amount;
    }
    balance += income - expense;
  }

  return Math.round(balance * 100) / 100;
}
