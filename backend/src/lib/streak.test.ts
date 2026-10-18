import { describe, expect, it } from "vitest";
import { nextStreak } from "./streak";
import { localDateISO } from "./localDate";

describe("nextStreak", () => {
  it("starts at 1 and keeps the value within a day", () => {
    expect(nextStreak(0, null, "2026-11-01")).toBe(1);
    expect(nextStreak(4, "2026-11-01", "2026-11-01")).toBe(4);
  });

  it("grows on the next day and resets after a gap", () => {
    expect(nextStreak(4, "2026-10-31", "2026-11-01")).toBe(5);
    expect(nextStreak(4, "2026-10-29", "2026-11-01")).toBe(1);
  });

  it("counts an entry made at 00:30 local time on the day it was made, not the UTC day before", () => {
    const yesterdayEvening = new Date("2026-10-31T20:00:00Z"); // 21:00 in Bratislava, 31 Oct
    const justAfterMidnight = new Date("2026-10-31T23:30:00Z"); // 00:30 in Bratislava, 1 Nov
    const last = localDateISO(yesterdayEvening);
    expect(nextStreak(3, last, localDateISO(justAfterMidnight))).toBe(4);
  });
});
