import { describe, expect, it } from "vitest";
import {
  monthRows, totals, savingsRate, topCategories, largestPayment, categoriesOverLimit, upcomingPayments, memberSplit,
  renderSummaryHtml, escapeHtml, type RawTx, type SummaryData,
} from "./monthlySummary";

const tx = (o: Partial<RawTx>): RawTx => ({
  userId: "u1", type: "expense", amount: "10", categoryId: null, description: null,
  date: "2026-10-05", isFixed: false, endedOn: null, ...o,
});

describe("monthRows", () => {
  const txs: RawTx[] = [
    tx({ type: "income", amount: "2000", description: "Plat", date: "2026-01-10", isFixed: true }),
    tx({ type: "income", amount: "2300", description: "Plat", date: "2026-06-10", isFixed: true }),
    tx({ amount: "650", description: JSON.stringify({ l: "Nájom", n: "", d: 5 }), date: "2026-01-05", isFixed: true }),
    tx({ amount: "40", description: "Obed", date: "2026-10-12" }),
    tx({ amount: "99", description: "Septembrová", date: "2026-09-12" }),
  ];

  it("uses the latest price of a recurring series and only the month's one-offs", () => {
    const rows = monthRows(txs, 2026, 10);
    expect(totals(rows)).toEqual({ income: 2300, expense: 690 });
    expect(rows.find((r) => r.fixed && r.type === "expense")?.label).toBe("Nájom");
  });

  it("leaves out an ended series", () => {
    const ended = txs.map((t) => (t.isFixed ? { ...t, endedOn: "2026-10-01" } : t));
    expect(totals(monthRows(ended, 2026, 10))).toEqual({ income: 0, expense: 40 });
    expect(totals(monthRows(ended, 2026, 9)).income).toBe(2300);
  });
});

describe("savingsRate", () => {
  it("is the share of income kept, null without income", () => {
    expect(savingsRate(2000, 1500)).toBeCloseTo(0.25);
    expect(savingsRate(0, 100)).toBeNull();
  });
});

describe("topCategories / largestPayment", () => {
  const rows = monthRows([
    tx({ amount: "50", categoryId: "a" }), tx({ amount: "70", categoryId: "b" }), tx({ amount: "30", categoryId: "a" }),
    tx({ amount: "5", categoryId: null }), tx({ amount: "900", type: "income", categoryId: "a" }),
  ], 2026, 10);
  it("ranks expense categories by amount", () => {
    expect(topCategories(rows, new Map([["a", "Jedlo"], ["b", "Auto"]]), 2)).toEqual([
      { name: "Jedlo", amount: 80 }, { name: "Auto", amount: 70 },
    ]);
  });
  it("finds the largest expense, ignoring income", () => {
    expect(largestPayment(rows)?.amount).toBe(70);
  });
});

describe("categoriesOverLimit", () => {
  const names = new Map([["u1", "Peter"], ["u2", "Jana"]]);
  const cats = [
    { id: "c1", userId: "u1", name: "Jedlo", type: "expense", limit: 200, shared: true },
    { id: "c2", userId: "u2", name: "jedlo ", type: "expense", limit: 200, shared: true },
    { id: "c3", userId: "u1", name: "Zábava", type: "expense", limit: 50, shared: false },
    { id: "c4", userId: "u2", name: "Zábava", type: "expense", limit: 50, shared: false },
  ];
  const rows = monthRows([
    tx({ userId: "u1", amount: "120", categoryId: "c1" }), tx({ userId: "u2", amount: "130", categoryId: "c2" }),
    tx({ userId: "u1", amount: "60", categoryId: "c3" }), tx({ userId: "u2", amount: "300", categoryId: "c4" }),
  ], 2026, 10);

  it("judges shared categories on the whole family with a per-member split", () => {
    const over = categoriesOverLimit("u1", cats, rows, names);
    const shared = over.find((o) => o.shared)!;
    expect(shared.spent).toBe(250);
    expect(shared.split).toEqual([{ name: "Jana", amount: 130 }, { name: "Peter", amount: 120 }]);
  });

  it("judges own categories on the user's own spending only", () => {
    const over = categoriesOverLimit("u1", cats, rows, names);
    expect(over.find((o) => o.name === "Zábava")?.spent).toBe(60);
    expect(over).toHaveLength(2);
  });
});

describe("upcomingPayments", () => {
  it("lists next month's recurring expenses with the days left", () => {
    const txs = [
      tx({ amount: "650", description: JSON.stringify({ l: "Nájom", n: "", d: 5 }), date: "2026-01-05", isFixed: true }),
      tx({ amount: "20", description: JSON.stringify({ l: "Internet", n: "", d: 15 }), date: "2026-01-15", isFixed: true, endedOn: "2026-11-01" }),
      tx({ amount: "2000", type: "income", description: "Plat", date: "2026-01-10", isFixed: true }),
    ];
    const up = upcomingPayments(txs, new Date(2026, 9, 31));
    expect(up).toEqual([{ label: "Nájom", amount: 650, day: 5, inDays: 5 }]);
  });
});

describe("memberSplit + render", () => {
  const data: SummaryData = {
    year: 2026, month: 10, family: true, income: 3000, expense: 1800, prevIncome: 3000, prevExpense: 2000,
    top: [{ name: "<b>Jedlo</b>", amount: 500 }], largest: { label: "Nájom", amount: 650, date: "2026-10-05" },
    over: [{ name: "Jedlo", limit: 200, spent: 250, shared: true, split: [{ name: "Jana", amount: 130 }, { name: "Peter", amount: 120 }] }],
    upcoming: [{ label: "Nájom", amount: 650, day: 5, inDays: 5 }],
    goals: [{ name: "Dovolenka", saved: 300, target: 1000, paused: false, owner: "Peter" }],
    members: memberSplit(monthRows([tx({ userId: "u1", amount: "5" })], 2026, 10), new Map([["u1", "Peter"]])),
  };
  it("escapes user text and shows the comparison with last month", () => {
    const html = renderSummaryHtml(data);
    expect(html).toContain("&lt;b&gt;Jedlo&lt;/b&gt;");
    expect(html).not.toContain("<b>Jedlo</b>");
    expect(html).toContain("+7");
    expect(html).toContain("Dovolenka");
    expect(escapeHtml(`a"b'c`)).toBe("a&quot;b&#39;c");
  });
});
