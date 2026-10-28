import { describe, it, expect, vi, beforeEach } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import type { Response } from "express";

const execute = vi.fn();
const selectRows = vi.fn();
vi.mock("../db", () => {
  const chain = { from: () => chain, where: () => chain, limit: () => selectRows() };
  return { db: { execute: (q: unknown) => execute(q), select: () => chain } };
});

import { authenticateToken, touchAndCheckUser, type AuthRequest } from "./authenticate";
import { signAccessToken } from "../lib/tokens";

const USER = "11111111-1111-1111-1111-111111111111";

function run(url: string) {
  const req = { headers: { authorization: `Bearer ${signAccessToken({ userId: USER, email: "a@example.com" })}` }, originalUrl: url } as unknown as AuthRequest;
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
  const next = vi.fn();
  return authenticateToken(req, res as unknown as Response, next).then(() => ({ res, next }));
}

beforeEach(() => {
  execute.mockReset().mockResolvedValue({ rows: [{ is_deactivated: false }] });
  selectRows.mockReset().mockResolvedValue([{ isDeactivated: false }]);
});

describe("last_active_at throttle", () => {
  it("uses one conditional statement that only writes a stale stamp", async () => {
    const now = new Date("2026-01-01T10:00:00Z");
    await touchAndCheckUser(USER, now);
    const { sql: text, params } = new PgDialect().sqlToQuery(execute.mock.calls[0][0] as SQL);
    expect(text).toMatch(/WITH touched AS \(\s*UPDATE users SET last_active_at/);
    expect(text).toMatch(/last_active_at IS NULL\s+OR last_active_at < \$\d+::timestamp - CASE/);
    expect(text).toContain("auto_lock_minutes * interval '6 seconds'");
    expect(text).toContain("ELSE interval '5 minutes'");
    expect(text).toMatch(/SELECT is_deactivated FROM users WHERE id = \$\d+$/);
    expect(params).toEqual([now.toISOString(), USER, now.toISOString(), USER]);
  });

  it("normal requests go through the throttled update", async () => {
    const { next } = await run("/api/v1/transactions");
    expect(execute).toHaveBeenCalledTimes(1);
    expect(selectRows).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });

  it("session-check only reads, so it sees the real last activity", async () => {
    const { next } = await run("/api/v1/auth/session-check");
    expect(execute).not.toHaveBeenCalled();
    expect(selectRows).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalled();
  });

  it("still rejects deactivated and deleted accounts on every request", async () => {
    execute.mockResolvedValueOnce({ rows: [{ is_deactivated: true }] });
    let r = await run("/api/v1/transactions");
    expect(r.res.status).toHaveBeenCalledWith(401);
    expect(r.res.json).toHaveBeenCalledWith(expect.objectContaining({ code: "ACCOUNT_DEACTIVATED" }));
    expect(r.next).not.toHaveBeenCalled();

    execute.mockResolvedValueOnce({ rows: [] });
    r = await run("/api/v1/transactions");
    expect(r.res.status).toHaveBeenCalledWith(401);
    expect(r.next).not.toHaveBeenCalled();
  });
});
