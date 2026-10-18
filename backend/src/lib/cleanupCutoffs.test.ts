import { expect, it } from "vitest";
import { cleanupCutoffs } from "./cleanupCutoffs";

it("keeps expired tokens a day, revoked ones a week and idle sessions 90 days", () => {
  const now = new Date("2026-10-18T03:30:00Z");
  const c = cleanupCutoffs(now);
  expect(c.tokens.toISOString()).toBe("2026-10-17T03:30:00.000Z");
  expect(c.revokedTokens.toISOString()).toBe("2026-10-11T03:30:00.000Z");
  expect(c.sessions.toISOString()).toBe("2026-07-20T03:30:00.000Z");
});
