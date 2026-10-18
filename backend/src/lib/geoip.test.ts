import { describe, expect, it } from "vitest";
import { formatLocation } from "./geoip";

describe("formatLocation", () => {
  it("joins city and country", () => {
    expect(formatLocation({ success: true, city: "Bratislava", country: "Slovakia" })).toBe("Bratislava, Slovakia");
  });
  it("copes with a missing city", () => {
    expect(formatLocation({ success: true, country: "Slovakia" })).toBe("Slovakia");
  });
  it("returns null for a failed lookup or junk", () => {
    expect(formatLocation({ success: false, message: "Reserved range" })).toBeNull();
    expect(formatLocation(null)).toBeNull();
    expect(formatLocation({ city: 5 })).toBeNull();
  });
});
