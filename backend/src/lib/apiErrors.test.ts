import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { API_ERRORS, apiError } from "./apiErrors";

describe("apiError", () => {
  it("pairs the code with its English text", () => {
    expect(apiError("NO_HOUSEHOLD")).toEqual({ error: API_ERRORS.NO_HOUSEHOLD, code: "NO_HOUSEHOLD" });
  });

  it("error texts stay English: the app translates by code", () => {
    for (const text of Object.values(API_ERRORS)) expect(text).toMatch(/^[\x20-\x7E]+$/);
  });

  // A localized `error: "…"` in a response would be shown as-is to every language
  it("no handler answers with a hardcoded non-English error text", () => {
    const src = join(__dirname, "..");
    const files = ["controllers", "routes", "middleware", "lib"].flatMap((d) =>
      readdirSync(join(src, d)).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts")).map((f) => join(src, d, f)));
    const hits = files.flatMap((f) =>
      readFileSync(f, "utf8").split("\n")
        .filter((l) => /error:\s*["'`][^"'`]*[À-ž]/.test(l))
        .map((l) => `${f}: ${l.trim()}`));
    expect(hits).toEqual([]);
  });
});
