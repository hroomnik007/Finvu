import { describe, expect, it } from "vitest";
import { pickSharedLimit, summarizeSharedFixed } from "./sharedLimit";

describe("pickSharedLimit", () => {
  it("adds up members' fixed expenses and the largest reserve", () => {
    expect(pickSharedLimit({ fixedTotal: 140 + 210, reserves: [120, 0], limits: [260, 210] })).toBe(470);
  });

  it("uses the fixed total alone when nobody keeps a reserve", () => {
    expect(pickSharedLimit({ fixedTotal: 59.2, reserves: [0, 0], limits: [59.2] })).toBe(59.2);
  });

  it("uses the highest limit for variable-only categories", () => {
    expect(pickSharedLimit({ fixedTotal: 0, reserves: [0, 0], limits: [300, 450] })).toBe(450);
  });

  it("uses the single limit when the other members have none", () => {
    expect(pickSharedLimit({ fixedTotal: 0, reserves: [0, 0], limits: [Number.NaN, 300] })).toBe(300);
  });

  it("partner's fixed expense plus the common reserve (Telekomunikácie: 37 + 23)", () => {
    // A typed limit doesn't matter while a member has a fixed expense in the category
    expect(pickSharedLimit({ fixedTotal: 37, reserves: [23], limits: [37, 37] })).toBe(60);
  });

  it("follows a lowered common reserve", () => {
    expect(pickSharedLimit({ fixedTotal: 37, reserves: [10], limits: [60, 60] })).toBe(47);
    expect(pickSharedLimit({ fixedTotal: 37, reserves: [0], limits: [60, 60] })).toBe(37);
  });

  it("has no limit when nobody set one", () => {
    expect(pickSharedLimit({ fixedTotal: 0, reserves: [], limits: [] })).toBeNull();
  });
});

describe("summarizeSharedFixed", () => {
  const copy = (id: string, name: string, limitReserve: string, shared = true) => ({ id, name, shared, limitReserve });
  const fixed = (categoryId: string, userId: string, amount: string, extra: { date?: string; endedOn?: string | null } = {}) => ({
    categoryId, userId, type: "expense", description: `fixed ${userId}`, amount, date: extra.date ?? "2026-07-03", endedOn: extra.endedOn ?? null,
  });

  it("counts the partner's fixed expense in the user's shared category", () => {
    const out = summarizeSharedFixed({
      copies: [copy("me", "Telekomunikácie", "23"), copy("partner", "telekomunikácie ", "23")],
      fixedRows: [fixed("partner", "danka", "37.00")],
      year: 2026, month: 11,
    });
    expect(out.get("telekomunikácie")).toEqual({ fixedTotal: 37, reserve: 23 });
  });

  it("adds up the fixed expenses of all members and ignores ended ones", () => {
    const out = summarizeSharedFixed({
      copies: [copy("a", "Bývanie", "0"), copy("b", "Bývanie", "0")],
      fixedRows: [
        fixed("a", "u1", "500"),
        fixed("b", "u2", "120.5"),
        { ...fixed("b", "u2", "80", { endedOn: "2026-10-01" }), description: "old" },
      ],
      year: 2026, month: 11,
    });
    expect(out.get("bývanie")).toEqual({ fixedTotal: 620.5, reserve: 0 });
  });

  it("reports no fixed total for a variable-only shared category", () => {
    const out = summarizeSharedFixed({ copies: [copy("a", "Jedlo", "0")], fixedRows: [], year: 2026, month: 11 });
    expect(out.get("jedlo")).toEqual({ fixedTotal: 0, reserve: 0 });
  });

  it("uses the largest reserve of the shared copies for older, differing data", () => {
    const out = summarizeSharedFixed({
      copies: [copy("a", "Auto", "15"), copy("b", "Auto", "40"), copy("c", "Auto", "99", false)],
      fixedRows: [fixed("a", "u1", "100")],
      year: 2026, month: 11,
    });
    // A member's unshared copy with the same name doesn't bring its own reserve
    expect(out.get("auto")).toEqual({ fixedTotal: 100, reserve: 40 });
  });

  it("ignores fixed expenses that start after the month", () => {
    const out = summarizeSharedFixed({
      copies: [copy("a", "Poistenie", "0")],
      fixedRows: [fixed("a", "u1", "30", { date: "2026-12-01" })],
      year: 2026, month: 11,
    });
    expect(out.get("poistenie")).toEqual({ fixedTotal: 0, reserve: 0 });
  });
});
