import { describe, expect, it } from "vitest";
import { buildSeries, monthsBetween } from "./monthlySeries";
import type { RawTx } from "./monthlySummary";

const tx = (o: Partial<RawTx>): RawTx => ({
  userId: "u1", type: "expense", amount: "10", categoryId: null, description: null,
  date: "2026-05-05", isFixed: false, endedOn: null, ...o,
});

describe("monthsBetween", () => {
  it("lists the months across a year boundary", () => {
    expect(monthsBetween("2025-11", "2026-02")).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });
});

describe("buildSeries", () => {
  const txs: RawTx[] = [
    tx({ type: "income", amount: "2000", description: "Plat", date: "2026-01-10", isFixed: true }),
    tx({ type: "income", amount: "2300", description: "Plat", date: "2026-03-10", isFixed: true }),
    tx({ amount: "650", description: JSON.stringify({ l: "Nájom", n: "", d: 20 }), date: "2026-01-05", isFixed: true, categoryId: "c1" }),
    tx({ amount: "40", date: "2026-02-12", categoryId: "c2" }),
    tx({ userId: "u2", amount: "60", date: "2026-02-13", categoryId: "c3" }),
  ];
  const today = new Date(2026, 3, 10); // 10 Apr 2026

  it("carries recurring items month to month with the price valid in each", () => {
    const s = buildSeries(txs, "2026-01", "2026-04", today);
    expect(s.map((m) => m.income)).toEqual([2000, 2000, 2300, 2300]);
    expect(s.map((m) => m.expense)).toEqual([650, 750, 650, 0]); // April: rent not due yet (day 20)
  });

  it("splits by member and merges same-named categories across members", () => {
    const s = buildSeries(txs, "2026-02", "2026-02", today, {
      userNames: new Map([["u1", "Peter"], ["u2", "Jana"]]),
      categoryInfo: new Map([["c1", { name: "Bývanie", color: "#111" }], ["c2", { name: "Jedlo", color: "#222" }], ["c3", { name: " jedlo", color: "#333" }]]),
    });
    expect(s[0].members).toEqual([
      { userId: "u2", name: "Jana", income: 0, expense: 60 },
      { userId: "u1", name: "Peter", income: 2000, expense: 690 },
    ]);
    expect(s[0].categories?.find((c) => c.type === "expense" && c.name.trim().toLowerCase() === "jedlo")?.total).toBe(100);
  });

  it("treats months before the tracking start as empty: January recurring income, start in April", () => {
    const babka = [tx({ type: "income", amount: "200", description: "Babka", date: "2026-01-05", isFixed: true })];
    const s = buildSeries(babka, "2026-01", "2026-06", today, { startMonths: new Map([["u1", "2026-04"]]) });
    expect(s.map((m) => m.income)).toEqual([0, 0, 0, 200, 200, 200]);
  });

  it("applies each member's own start, one-off rows included", () => {
    const s = buildSeries(txs, "2026-01", "2026-03", today, { startMonths: new Map([["u1", "2026-03"], ["u2", "2026-02"]]) });
    expect(s.map((m) => m.income)).toEqual([0, 0, 2300]);
    expect(s.map((m) => m.expense)).toEqual([0, 60, 650]);
  });
});
