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
