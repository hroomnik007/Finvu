import { describe, it, expect, vi } from "vitest";
import { checkDatabase } from "./health";

describe("checkDatabase", () => {
  it("is true when the query resolves", async () => {
    expect(await checkDatabase(async () => [{ "?column?": 1 }])).toBe(true);
  });

  it("is false when the query rejects", async () => {
    expect(await checkDatabase(async () => { throw new Error("ECONNREFUSED"); })).toBe(false);
  });

  it("is false when the query hangs past the timeout", async () => {
    vi.useFakeTimers();
    const result = checkDatabase(() => new Promise(() => {}), 500);
    await vi.advanceTimersByTimeAsync(500);
    expect(await result).toBe(false);
    vi.useRealTimers();
  });
});
