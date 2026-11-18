import { describe, expect, it, vi } from "vitest";
import { checkSecrets, loadEnv, looksLikePlaceholder } from "./envSchema";

// Distinct, non-placeholder values (each >= 32 characters).
const good = {
  DATABASE_URL: "postgresql://app:9f2c4e7a1b3d5f6e8a0c2e4f6a8b0d2c@db:5432/app",
  JWT_ACCESS_SECRET: "a".repeat(20) + "access-0123456789ab",
  JWT_REFRESH_SECRET: "b".repeat(20) + "refresh-0123456789a",
  JWT_ADMIN_SECRET: "c".repeat(20) + "admin-0123456789abc",
  ADMIN_PASSWORD: "Xk3!long-enough-pw",
};

const prod = (over: Record<string, string> = {}) => ({ ...good, NODE_ENV: "production", ...over });

describe("looksLikePlaceholder", () => {
  it.each([
    "replace-with-a-long-random-secret-0000000000",
    "REPLACE_WITH_SOMETHING_LONG_AND_RANDOM_000000",
    "please-change-me-0000000000000000000000000",
    "ChangeMe-0000000000000000000000000000000000",
    "your-secret-here-000000000000000000000000000",
    "your-password-here",
    "your-key-000000000000000000000000000000000",
    "an-example-value-0000000000000000000000000",
    "PLACEHOLDER-0000000000000000000000000000000",
    "password",
    "Admin",
    "SECRET",
  ])("flags %s", (v) => expect(looksLikePlaceholder(v)).toBe(true));

  it.each(["9f2c4e7a1b3d5f6e8a0c2e4f6a8b0d2c", "my-password-is-long-and-random", "administrator-xyz", "secretive-but-fine-1234"])(
    "accepts %s",
    (v) => expect(looksLikePlaceholder(v)).toBe(false),
  );
});

describe("checkSecrets", () => {
  it("passes distinct, real-looking values", () => {
    expect(checkSecrets(good)).toEqual([]);
  });

  it.each(["JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET", "JWT_ADMIN_SECRET", "ADMIN_PASSWORD"] as const)(
    "flags a placeholder in %s",
    (name) => {
      expect(checkSecrets({ ...good, [name]: "replace-with-a-long-random-secret-0000000000" })).toContainEqual({ variable: name, rule: "placeholder" });
    },
  );

  it("flags a placeholder or an exact weak value as the DATABASE_URL password", () => {
    expect(checkSecrets({ ...good, DATABASE_URL: "postgresql://app:change-me@db:5432/app" }))
      .toEqual([{ variable: "DATABASE_URL (password)", rule: "placeholder" }]);
    expect(checkSecrets({ ...good, DATABASE_URL: "postgresql://app:password@db:5432/app" }))
      .toEqual([{ variable: "DATABASE_URL (password)", rule: "placeholder" }]);
  });

  it("does not look at the user, host or database name of DATABASE_URL", () => {
    expect(checkSecrets({ ...good, DATABASE_URL: "postgresql://admin:9f2c4e7a1b3d5f6e@example.com:5432/secret" })).toEqual([]);
  });

  it("accepts a DATABASE_URL without a password", () => {
    expect(checkSecrets({ ...good, DATABASE_URL: "postgresql://app@db:5432/app" })).toEqual([]);
  });

  it("requires the three JWT secrets to differ", () => {
    expect(checkSecrets({ ...good, JWT_REFRESH_SECRET: good.JWT_ACCESS_SECRET }))
      .toEqual([{ variable: "JWT_ACCESS_SECRET / JWT_REFRESH_SECRET", rule: "not-distinct" }]);
    const same = { ...good, JWT_REFRESH_SECRET: good.JWT_ACCESS_SECRET, JWT_ADMIN_SECRET: good.JWT_ACCESS_SECRET };
    expect(checkSecrets(same).map((i) => i.rule)).toEqual(["not-distinct", "not-distinct", "not-distinct"]);
  });
});

describe("loadEnv", () => {
  it("loads a good production environment", () => {
    expect(loadEnv(prod()).NODE_ENV).toBe("production");
  });

  it("stops a production start on a placeholder, naming variable and rule but not the value", () => {
    const value = "replace-with-a-long-random-secret-0000000000";
    let message = "";
    try {
      loadEnv(prod({ JWT_ADMIN_SECRET: value }));
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain("JWT_ADMIN_SECRET");
    expect(message).toContain("rule: placeholder");
    expect(message).not.toContain(value);
  });

  it("stops a production start when JWT secrets repeat", () => {
    expect(() => loadEnv(prod({ JWT_ADMIN_SECRET: good.JWT_ACCESS_SECRET }))).toThrow(/rule: not-distinct/);
  });

  it.each(["development", "test", undefined])("only warns in %s, without the value", (nodeEnv) => {
    const warn = vi.fn();
    const value = "replace-with-a-long-random-secret-0000000000";
    const raw: Record<string, string | undefined> = { ...good, JWT_ACCESS_SECRET: value, JWT_REFRESH_SECRET: value, NODE_ENV: nodeEnv };
    expect(() => loadEnv(raw, warn)).not.toThrow();
    const logged = warn.mock.calls.flat().join("\n");
    expect(logged).toContain("JWT_ACCESS_SECRET");
    expect(logged).toContain("not-distinct");
    expect(logged).not.toContain(value);
  });

  it("does not crash when optional variables are unset", () => {
    const { ...raw } = prod();
    expect(() => loadEnv({ ...raw, SMTP_PASS: undefined, GOOGLE_CLIENT_ID: undefined, APP_URL: undefined })).not.toThrow();
  });
});
