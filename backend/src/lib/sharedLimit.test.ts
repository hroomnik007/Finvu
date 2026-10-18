import { describe, expect, it } from "vitest";
import { pickSharedLimit, sumLatestPerSeries } from "./sharedLimit";

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

  it("has no limit when nobody set one", () => {
    expect(pickSharedLimit({ fixedTotal: 0, reserves: [], limits: [] })).toBeNull();
  });
});

describe("sumLatestPerSeries", () => {
  it("counts a recurring expense once through its latest row", () => {
    const rows = [
      { userId: "a", description: "Nájom", amount: "300" },
      { userId: "a", description: "Nájom", amount: "320" },
      { userId: "b", description: "Nájom", amount: "251.25" },
      { userId: "a", description: "Energie", amount: "80" },
    ];
    expect(sumLatestPerSeries(rows)).toBe(320 + 251.25 + 80);
  });

  it("keeps members' same-named series apart", () => {
    expect(sumLatestPerSeries([{ userId: "a", description: "X", amount: "10" }, { userId: "b", description: "X", amount: "20" }])).toBe(30);
  });

  it("is 0 without rows", () => {
    expect(sumLatestPerSeries([])).toBe(0);
  });
});
