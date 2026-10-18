import { describe, expect, it } from "vitest";
import { normalizeKeyword } from "./importRules";

describe("normalizeKeyword", () => {
  it("ignores case, diacritics and extra whitespace", () => {
    expect(normalizeKeyword("  LÍDL   Bratislava ")).toBe("lidl bratislava");
    expect(normalizeKeyword("Kaufland")).toBe("kaufland");
  });
});
