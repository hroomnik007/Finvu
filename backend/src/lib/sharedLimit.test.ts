import { describe, expect, it } from "vitest";
import { pickSharedLimit } from "./sharedLimit";

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
