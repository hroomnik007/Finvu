import type { Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ result: { ok: true } as { ok: boolean; reason?: string }, calls: 0 }));
vi.mock("../db", () => ({ db: {} }));
vi.mock("../services/achievements.service", () => ({ evaluateAchievements: vi.fn(async () => ({ newlyUnlocked: [] })) }));
vi.mock("../lib/sharedReportLimit", async (orig) => ({
  ...(await orig<typeof import("../lib/sharedReportLimit")>()),
  insertSharedReportWithinCap: vi.fn(async () => { state.calls++; return state.result; }),
}));

const { createSharedReport } = await import("./sharedReports.controller");
const { MAX_ACTIVE_SHARED_REPORTS, SHARED_REPORT_LIMIT_CODE } = await import("../lib/sharedReportLimit");

function run(body: unknown) {
  const out: { status: number; body: any } = { status: 200, body: undefined };
  const res = { status(c: number) { out.status = c; return res; }, json(b: unknown) { out.body = b; return res; } };
  return createSharedReport({ body, userId: "u1" } as never, res as unknown as Response).then(() => out);
}

beforeEach(() => { state.result = { ok: true }; state.calls = 0; });

describe("createSharedReport cap", () => {
  it("under the cap: 201 with a token", async () => {
    const out = await run({ data: "x" });
    expect(out.status).toBe(201);
    expect(out.body.token).toMatch(/^[0-9a-f]{64}$/);
  });

  it("at the cap: 409 with the coded error and no token", async () => {
    state.result = { ok: false, reason: "limit" };
    const out = await run({ data: "x" });
    expect(out.status).toBe(409);
    expect(out.body).toMatchObject({ code: SHARED_REPORT_LIMIT_CODE, limit: MAX_ACTIVE_SHARED_REPORTS });
    expect(out.body.token).toBeUndefined();
  });

  it("invalid input is rejected before the cap is consulted", async () => {
    expect((await run({})).status).toBe(400);
    expect(state.calls).toBe(0);
  });
});
