import { describe, expect, it } from "vitest";
import { compareToken, hashToken } from "./tokens";

describe("token hashing", () => {
  it("hashes to a deterministic 64-char SHA-256 hex digest", async () => {
    const a = await hashToken("some-opaque-token");
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(await hashToken("some-opaque-token")).toBe(a);
    expect(await hashToken("another-token")).not.toBe(a);
  });

  it("compares a token with its stored hash", async () => {
    const hash = await hashToken("abc");
    expect(await compareToken("abc", hash)).toBe(true);
    expect(await compareToken("abd", hash)).toBe(false);
  });

  it("never matches a legacy bcrypt hash and does not throw", async () => {
    const legacy = "$2b$12$abcdefghijklmnopqrstuuVxQ1c7x2x1x8Qx8m1x8Qx8m1x8Qx8m1";
    expect(await compareToken("abc", legacy)).toBe(false);
  });
});
