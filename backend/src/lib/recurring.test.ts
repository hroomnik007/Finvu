import { describe, expect, it } from "vitest";
import {
  activeSeriesTotal,
  cumulativeBalanceFromRows,
  fixedDayOfMonth,
  isActiveInMonth,
  isFixedDue,
  recurringTotalsForMonth,
  type FixedRow,
} from "./recurring";

// 15 Oct 2026, local noon — the "today" every test is evaluated against.
const TODAY = new Date(2026, 9, 15, 12);
const idx = (year: number, month: number) => year * 12 + (month - 1);

const row = (over: Partial<FixedRow>): FixedRow => ({
  userId: "u1",
  type: "expense",
  description: "Nájom",
  amount: "650",
  date: "2026-01-05",
  ...over,
});

describe("fixedDayOfMonth", () => {
  it("uses the due day stored in the JSON description", () => {
    expect(fixedDayOfMonth(JSON.stringify({ l: "Nájom", n: "", d: 20 }), "2026-01-05")).toBe(20);
  });
  it("falls back to the day of the row's own date for plain text", () => {
    expect(fixedDayOfMonth("Nájom", "2026-01-05")).toBe(5);
    expect(fixedDayOfMonth(null, "2026-03-31")).toBe(31);
  });
  it("ignores JSON without a numeric day", () => {
    expect(fixedDayOfMonth(JSON.stringify({ l: "x" }), "2026-02-09")).toBe(9);
  });
});

describe("isFixedDue", () => {
  it("counts past months in full and future months not at all", () => {
    expect(isFixedDue(31, 2026, 9, TODAY)).toBe(true);
    expect(isFixedDue(1, 2025, 12, TODAY)).toBe(true);
    expect(isFixedDue(1, 2026, 11, TODAY)).toBe(false);
    expect(isFixedDue(1, 2027, 1, TODAY)).toBe(false);
  });
  it("in the current month compares the due day with today", () => {
    expect(isFixedDue(14, 2026, 10, TODAY)).toBe(true);
    expect(isFixedDue(15, 2026, 10, TODAY)).toBe(true);
    expect(isFixedDue(16, 2026, 10, TODAY)).toBe(false);
  });
});

describe("recurringTotalsForMonth", () => {
  it("uses the latest occurrence of a series, not the sum of all rows", () => {
    const rows = [row({ amount: "600", date: "2026-01-05" }), row({ amount: "650", date: "2026-06-05" })];
    expect(recurringTotalsForMonth(rows, 2026, 9, TODAY)).toEqual({ income: 0, expense: 650 });
  });
  it("counts recurring income regardless of its day, expenses only once due", () => {
    const rows = [
      row({ type: "income", description: "Plat", amount: "1500", date: "2026-10-28" }),
      row({ description: "Netflix", amount: "10", date: "2026-01-01" }),
      row({ description: "Poistenie", amount: "50", date: "2026-01-20" }),
    ];
    // 15 Oct: Netflix (day 1) is due, Poistenie (day 20) is not
    expect(recurringTotalsForMonth(rows, 2026, 10, TODAY)).toEqual({ income: 1500, expense: 10 });
  });
  it("keeps the same description of two users apart", () => {
    const rows = [row({ userId: "u1", amount: "100" }), row({ userId: "u2", amount: "200" })];
    expect(recurringTotalsForMonth(rows, 2026, 9, TODAY).expense).toBe(300);
  });
  it("is empty without rows", () => {
    expect(recurringTotalsForMonth([], 2026, 10, TODAY)).toEqual({ income: 0, expense: 0 });
  });
});

describe("cumulativeBalanceFromRows", () => {
  it("counts a recurring expense in every month, not only the month it was entered", () => {
    // Rent entered once in January; balance up to March must carry it 3 times.
    const rent = row({ amount: "650", date: "2026-01-05" });
    expect(cumulativeBalanceFromRows(new Map(), [rent], idx(2026, 1), idx(2026, 3), TODAY)).toBe(-1950);
  });

  it("adds one-off rows in the month they are dated", () => {
    const oneOff = new Map([
      ["2026-01", { income: 1000, expense: 200 }],
      ["2026-02", { income: 0, expense: 50 }],
    ]);
    expect(cumulativeBalanceFromRows(oneOff, [], idx(2026, 1), idx(2026, 2), TODAY)).toBe(750);
  });

  it("combines recurring income and expenses with one-off rows", () => {
    const rows = [
      row({ type: "income", description: "Plat", amount: "2000", date: "2026-01-01" }),
      row({ description: "Nájom", amount: "650", date: "2026-01-01" }),
    ];
    const oneOff = new Map([["2026-02", { income: 0, expense: 100 }]]);
    // Jan: 2000-650, Feb: 2000-650-100
    expect(cumulativeBalanceFromRows(oneOff, rows, idx(2026, 1), idx(2026, 2), TODAY)).toBe(2600);
  });

  it("starts a recurring row at its own month, not before", () => {
    const rent = row({ amount: "650", date: "2026-03-05" });
    expect(cumulativeBalanceFromRows(new Map(), [rent], idx(2026, 1), idx(2026, 4), TODAY)).toBe(-1300);
  });

  it("does not count a recurring expense in the current month before it falls due", () => {
    const late = row({ description: "Poistenie", amount: "50", date: "2026-01-20" });
    // Jan..Sep fully past (9 x 50) + Oct (due day 20 > 15) not yet
    expect(cumulativeBalanceFromRows(new Map(), [late], idx(2026, 1), idx(2026, 10), TODAY)).toBe(-450);
  });

  it("picks up a price change from the latest occurrence onwards", () => {
    const rows = [row({ amount: "600", date: "2026-01-05" }), row({ amount: "700", date: "2026-03-05" })];
    // Jan 600 + Feb 600 + Mar 700
    expect(cumulativeBalanceFromRows(new Map(), rows, idx(2026, 1), idx(2026, 3), TODAY)).toBe(-1900);
  });

  it("is zero when the range is empty", () => {
    expect(cumulativeBalanceFromRows(new Map(), [row({})], idx(2026, 5), idx(2026, 4), TODAY)).toBe(0);
  });

  it("rounds to cents", () => {
    const oneOff = new Map([["2026-01", { income: 0.1, expense: 0 }], ["2026-02", { income: 0.2, expense: 0 }]]);
    expect(cumulativeBalanceFromRows(oneOff, [], idx(2026, 1), idx(2026, 2), TODAY)).toBe(0.3);
  });
});

describe("price change and end of a recurring series", () => {
  // Rent 650 until Aug 2026, 700 from September (a later row of the same series)
  const rent = [row({ date: "2026-01-05" }), row({ date: "2026-09-01", amount: "700" })];

  it("keeps the old price for months before the change", () => {
    expect(recurringTotalsForMonth(rent.filter((r) => r.date < "2026-08-01"), 2026, 7, TODAY).expense).toBe(650);
  });

  it("uses the new price from the month of the change", () => {
    expect(recurringTotalsForMonth(rent, 2026, 9, TODAY).expense).toBe(700);
  });

  it("isActiveInMonth: a series that ended on 1 Oct 2026 still counts in September but not October", () => {
    expect(isActiveInMonth("2026-10-01", 2026, 9)).toBe(true);
    expect(isActiveInMonth("2026-10-01", 2026, 10)).toBe(false);
    expect(isActiveInMonth("2026-10-01", 2027, 1)).toBe(false);
    expect(isActiveInMonth(null, 2030, 1)).toBe(true);
  });

  it("an ended series no longer counts towards the monthly total", () => {
    const ended = [row({ date: "2026-01-05", endedOn: "2026-09-01" })];
    expect(recurringTotalsForMonth(ended, 2026, 8, TODAY).expense).toBe(650);
    expect(recurringTotalsForMonth(ended, 2026, 9, TODAY).expense).toBe(0);
  });

  it("the cumulative balance follows price changes and stops at the end", () => {
    // Jan..Dec: 650 for Jan-Aug (8 months), 700 for Sep-Oct (2 months, Oct due day 5 passed), nothing after
    const balance = cumulativeBalanceFromRows(new Map(), [...rent, ], idx(2026, 1), idx(2026, 10), TODAY);
    expect(balance).toBe(-(650 * 8 + 700 * 2));
    const ended = [row({ date: "2026-01-05", endedOn: "2026-04-01" })];
    expect(cumulativeBalanceFromRows(new Map(), ended, idx(2026, 1), idx(2026, 10), TODAY)).toBe(-(650 * 3));
  });
});

describe("activeSeriesTotal", () => {
  it("counts each series once through its latest row, regardless of due day", () => {
    const rows = [
      row({ date: "2026-01-05", amount: "300" }),
      row({ date: "2026-09-01", amount: "320" }),
      row({ userId: "u2", date: "2026-02-10", amount: "251.25" }),
      row({ description: "Energie", date: "2026-03-01", amount: "80" }),
    ];
    expect(activeSeriesTotal(rows, 2026, 10)).toBe(320 + 251.25 + 80);
    expect(activeSeriesTotal(rows, 2026, 8)).toBe(300 + 251.25 + 80);
  });

  it("ignores rows dated after the month and series that have ended", () => {
    const rows = [
      row({ date: "2026-01-05", amount: "300", endedOn: "2026-11-01" }),
      row({ description: "Poistenie", date: "2026-12-01", amount: "50" }),
    ];
    expect(activeSeriesTotal(rows, 2026, 10)).toBe(300);
    expect(activeSeriesTotal(rows, 2026, 11)).toBe(0);
  });
});
