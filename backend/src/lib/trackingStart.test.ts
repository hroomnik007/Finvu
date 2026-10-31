import { describe, expect, it } from "vitest";
import { earliestStart, isTrackedMonth, startMonthOf } from "./trackingStart";

describe("startMonthOf", () => {
  it("uses the tracking start date when set", () => {
    expect(startMonthOf("2026-04-01", new Date("2026-01-10T12:00:00Z"))).toBe("2026-04");
  });
  it("falls back to the month the account was created (Bratislava time)", () => {
    expect(startMonthOf(null, new Date("2026-02-15T10:00:00Z"))).toBe("2026-02");
    // 31 Jan 23:30 UTC is already 1 Feb in Bratislava
    expect(startMonthOf(null, new Date("2026-01-31T23:30:00Z"))).toBe("2026-02");
    expect(startMonthOf(undefined, "2025-12-03T08:00:00Z")).toBe("2025-12");
  });
  it("returns null when nothing is known", () => {
    expect(startMonthOf(null, null)).toBeNull();
  });
});

describe("isTrackedMonth / earliestStart", () => {
  const starts = new Map([["a", "2026-04"], ["b", "2026-02"]]);
  it("is empty before the start and counts from the start month", () => {
    expect(isTrackedMonth(starts, "a", "2026-03")).toBe(false);
    expect(isTrackedMonth(starts, "a", "2026-04")).toBe(true);
    expect(isTrackedMonth(starts, "c", "2020-01")).toBe(true);
    expect(isTrackedMonth(undefined, "a", "2020-01")).toBe(true);
  });
  it("finds the earliest start among the given users", () => {
    expect(earliestStart(starts, ["a", "b"])).toBe("2026-02");
    expect(earliestStart(starts, ["a"])).toBe("2026-04");
    expect(earliestStart(starts, ["x"])).toBeNull();
  });
});
