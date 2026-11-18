import { z } from "zod";

// Pure validation, no side effects (no dotenv, no process.env): env.ts applies it
// to the real environment, tests and checks apply it to any record.

export const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  PORT: z.coerce.number().default(3001),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  BCRYPT_ROUNDS: z.coerce.number().default(12),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().default("noreply@finvu.pedani.eu"),
  APP_URL: z.string().default("https://finvu.pedani.eu"),
  ADMIN_USERNAME: z.string().min(1).default("admin"),
  ADMIN_PASSWORD: z.string().min(12),
  JWT_ADMIN_SECRET: z.string().min(32),
  GOOGLE_CLIENT_ID: z.string().optional(),
  // Default to the host/origin of APP_URL; override only for unusual setups.
  WEBAUTHN_RP_ID: z.string().optional(),
  WEBAUTHN_ORIGIN: z.string().optional(),
  // Passkey sign-in / registration / re-auth are switched off: a passkey can only be
  // used through a password manager in this PWA, so the UI promise was misleading.
  // Listing, renaming and deleting stored passkeys stays available. "true" re-enables.
  PASSKEYS_ENABLED: z.enum(["true", "false"]).default("false").transform(v => v === "true"),
  UPLOAD_DIR: z.string().default("uploads"),
});

export type Env = z.infer<typeof envSchema>;

// Words that only appear in template / example values (.env.example uses
// "replace-with-…"), and values that are a guess away.
const PLACEHOLDER_PARTS = [
  "replace-with", "replace_with", "change-me", "changeme",
  "your-secret", "your-password", "your-key", "example", "placeholder",
];
const PLACEHOLDER_EXACT = new Set(["password", "admin", "secret"]);

export function looksLikePlaceholder(value: string): boolean {
  const v = value.trim().toLowerCase();
  return PLACEHOLDER_EXACT.has(v) || PLACEHOLDER_PARTS.some((p) => v.includes(p));
}

// The password part of a connection string, or undefined when there is none
// (or the URL cannot be parsed; the schema has already rejected that case).
function databasePassword(url: string): string | undefined {
  try {
    const p = new URL(url).password;
    return p ? decodeURIComponent(p) : undefined;
  } catch {
    return undefined;
  }
}

export type SecretIssue = { variable: string; rule: "placeholder" | "not-distinct" };

// Variable names and rule names only, never a value.
export function checkSecrets(env: Pick<Env, "JWT_ACCESS_SECRET" | "JWT_REFRESH_SECRET" | "JWT_ADMIN_SECRET" | "ADMIN_PASSWORD" | "DATABASE_URL">): SecretIssue[] {
  const issues: SecretIssue[] = [];
  const candidates: [string, string | undefined][] = [
    ["JWT_ACCESS_SECRET", env.JWT_ACCESS_SECRET],
    ["JWT_REFRESH_SECRET", env.JWT_REFRESH_SECRET],
    ["JWT_ADMIN_SECRET", env.JWT_ADMIN_SECRET],
    ["ADMIN_PASSWORD", env.ADMIN_PASSWORD],
    ["DATABASE_URL (password)", databasePassword(env.DATABASE_URL)],
  ];
  for (const [variable, value] of candidates) {
    if (value !== undefined && looksLikePlaceholder(value)) issues.push({ variable, rule: "placeholder" });
  }

  const jwt: [string, string][] = [
    ["JWT_ACCESS_SECRET", env.JWT_ACCESS_SECRET],
    ["JWT_REFRESH_SECRET", env.JWT_REFRESH_SECRET],
    ["JWT_ADMIN_SECRET", env.JWT_ADMIN_SECRET],
  ];
  for (let i = 0; i < jwt.length; i++) {
    for (let j = i + 1; j < jwt.length; j++) {
      if (jwt[i][1] === jwt[j][1]) issues.push({ variable: `${jwt[i][0]} / ${jwt[j][0]}`, rule: "not-distinct" });
    }
  }
  return issues;
}

export function formatIssue(issue: SecretIssue): string {
  return issue.rule === "placeholder"
    ? `${issue.variable}: placeholder or weak value (rule: placeholder)`
    : `${issue.variable}: the JWT secrets must all be different (rule: not-distinct)`;
}

// Parses the environment and applies the secret rules: in production a broken
// rule stops the start, in development and test it is only a warning so that
// .env.example based setups and the test suite keep working.
export function loadEnv(raw: Record<string, string | undefined>, warn: (msg: string) => void = console.warn): Env {
  const env = envSchema.parse(raw);
  const issues = checkSecrets(env);
  if (issues.length) {
    const lines = issues.map(formatIssue);
    if (env.NODE_ENV === "production") {
      throw new Error(`Invalid environment:\n  ${lines.join("\n  ")}`);
    }
    for (const l of lines) warn(`[env] warning: ${l}`);
  }
  return env;
}
