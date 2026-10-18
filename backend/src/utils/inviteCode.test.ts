import { describe, expect, it } from "vitest";
import { generateInviteCode } from "./inviteCode";

describe("generateInviteCode", () => {
  it("produces LLLL-DDDD codes without the ambiguous letters I and O", () => {
    for (let i = 0; i < 500; i++) {
      const code = generateInviteCode();
      expect(code).toMatch(/^[A-HJ-NP-Z]{4}-\d{4}$/);
    }
  });

  it("does not repeat in a small sample", () => {
    const codes = new Set(Array.from({ length: 200 }, () => generateInviteCode()));
    expect(codes.size).toBe(200);
  });
});
