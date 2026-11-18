import { afterEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { DatabaseError } from "pg";
import { DrizzleQueryError } from "drizzle-orm";
import { errorHandler } from "./errorHandler";

const EMAIL = "jana.novakova@example.sk";

function uniqueViolation(): DrizzleQueryError {
  const pg = new DatabaseError('duplicate key value violates unique constraint "users_email_unique"', 200, "error");
  Object.assign(pg, {
    code: "23505",
    detail: `Key (email)=(${EMAIL}) already exists.`,
    table: "users",
    constraint: "users_email_unique",
    routine: "_bt_check_unique",
  });
  return new DrizzleQueryError('insert into "users" ("email") values ($1)', [EMAIL], pg);
}

function mockRes() {
  const res = { statusCode: 0, body: undefined as unknown } as { statusCode: number; body: unknown; status: (c: number) => typeof res; json: (b: unknown) => typeof res };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
}

const req = { method: "POST", originalUrl: `/api/auth/register?email=${encodeURIComponent(EMAIL)}` } as Request;

afterEach(() => vi.restoreAllMocks());

describe("errorHandler", () => {
  it("logs a pg unique violation without the e-mail address and answers as before", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = mockRes();
    errorHandler(uniqueViolation(), req, res as unknown as Response, () => {});

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: "Internal server error" });

    const logged = spy.mock.calls.flat().map(String).join("\n");
    expect(logged).toContain("[error] POST /api/auth/register:");
    expect(logged).toContain("code=23505");
    expect(logged).toContain("constraint=users_email_unique");
    expect(logged).not.toContain(EMAIL);
    expect(logged).not.toContain(encodeURIComponent(EMAIL));
    expect(logged).not.toContain("insert into");
  });

  it("keeps 4xx responses unchanged", () => {
    const res = mockRes();
    errorHandler(Object.assign(new Error("Not found"), { status: 404 }), req, res as unknown as Response, () => {});
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: "Not found" });
  });
});
