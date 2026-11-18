import { describe, expect, it } from "vitest";
import { DatabaseError } from "pg";
import { DrizzleQueryError } from "drizzle-orm";
import { describeError, redactText, stackFrames } from "./safeErrorLog";

const EMAIL = "jana.novakova@example.sk";

// What pg raises on a duplicate e-mail, with the fields the server fills in.
function fakeUniqueViolation(): DatabaseError {
  const e = new DatabaseError('duplicate key value violates unique constraint "users_email_unique"', 200, "error");
  Object.assign(e, {
    severity: "ERROR",
    code: "23505",
    detail: `Key (email)=(${EMAIL}) already exists.`,
    schema: "public",
    table: "users",
    constraint: "users_email_unique",
    routine: "_bt_check_unique",
    where: `SQL statement "insert into users values ('${EMAIL}')"`,
  });
  return e;
}

// Drizzle's wrapper: the message (and so the stack) holds the SQL and the params.
function fakeDrizzleUniqueViolation(): DrizzleQueryError {
  return new DrizzleQueryError(
    'insert into "users" ("email", "name") values ($1, $2)',
    [EMAIL, "Jana Nováková"],
    fakeUniqueViolation(),
  );
}

describe("describeError", () => {
  it("keeps code, constraint, table and routine but not the e-mail from detail", () => {
    const out = describeError(fakeUniqueViolation());
    expect(out).toContain("code=23505");
    expect(out).toContain("constraint=users_email_unique");
    expect(out).toContain("table=users");
    expect(out).toContain("routine=_bt_check_unique");
    expect(out).toContain("duplicate key value violates unique constraint");
    expect(out).not.toContain(EMAIL);
    expect(out).not.toContain("already exists");
  });

  it("unwraps a DrizzleQueryError without logging SQL text or params", () => {
    const out = describeError(fakeDrizzleUniqueViolation());
    expect(out).toContain("name=DrizzleQueryError");
    expect(out).toContain("code=23505");
    expect(out).not.toContain(EMAIL);
    expect(out).not.toContain("Nováková");
    expect(out).not.toContain("insert into");
    expect(out).not.toContain("params");
    // the stack frames are kept for debugging
    expect(out).toMatch(/\n\s+at /);
  });

  it("redacts quoted values in a pg message", () => {
    const e = Object.assign(new DatabaseError('invalid input syntax for type uuid: "not-a-uuid"', 100, "error"), { code: "22P02" });
    const out = describeError(e);
    expect(out).toContain("code=22P02");
    expect(out).not.toContain("not-a-uuid");
  });

  it("never logs a connection string", () => {
    const e = new Error("connect failed for postgresql://app:s3cretpw@db:5432/app (timeout)");
    const out = describeError(e);
    expect(out).not.toContain("s3cretpw");
    expect(out).not.toContain("postgresql://");
    expect(out).toContain("<url>");
  });

  it("handles non-error values", () => {
    expect(describeError("boom")).toBe("non-error value (string)");
    expect(describeError(undefined)).toBe("non-error value (undefined)");
  });

  it("truncates long messages", () => {
    expect(describeError(new Error("x".repeat(5000))).length).toBeLessThan(2000);
  });
});

describe("redactText / stackFrames", () => {
  it("replaces e-mail addresses, quoted values and key/value pairs", () => {
    expect(redactText(`Key (email)=(${EMAIL}) for 'abc' and "def" by ${EMAIL}`)).toBe(`Key (…)=(…) for '…' and "…" by <email>`);
  });

  it("drops the message lines from a stack", () => {
    const stack = `Error: Failed query: select 1\nparams: ${EMAIL}\n    at foo (/app/a.js:1:2)\n    at bar (/app/b.js:3:4)`;
    expect(stackFrames(stack)).toEqual(["at foo (/app/a.js:1:2)", "at bar (/app/b.js:3:4)"]);
  });
});

describe("hardening", () => {
  it("does not take a crafted value containing a newline and 'at' for a stack frame", () => {
    const e = new DrizzleQueryError("insert into t values ($1)", [`x\n    at ${EMAIL} secret note`], fakeUniqueViolation());
    const out = describeError(e);
    expect(out).not.toContain(EMAIL);
    expect(out).not.toContain("secret note");
    expect(out).toMatch(/\n\s+at /);
  });

  it("keeps the frames after a very large wrapped message and stays fast", () => {
    const params = Array.from({ length: 20_000 }, (_, i) => `user${i}@example.sk`);
    const placeholders = params.map((_, i) => "($" + String(i + 1) + ")").join(",");
    const e = new DrizzleQueryError("insert into t values " + placeholders, params, fakeUniqueViolation());
    const t0 = performance.now();
    const out = describeError(e);
    expect(performance.now() - t0).toBeLessThan(500);
    expect(out).toMatch(/\n\s+at /);
    expect(out).not.toContain("@example.sk");
  });

  it("stays fast on a huge message without a TLD", () => {
    const t0 = performance.now();
    describeError(new Error("a@" + "b.".repeat(200_000)));
    expect(performance.now() - t0).toBeLessThan(500);
  });
});
