import { createHash } from "crypto";

// Per-account sign-in lockout, on top of the per-IP rate limiters: after
// MAX_FAILURES wrong attempts within WINDOW_MS the key is locked for LOCK_MS,
// and while locked even the right password is refused. The lock is short on
// purpose so nobody can keep someone else out for long, and it only covers
// password, PIN and admin login — Google and passkey sign-in are unaffected.
export { MAX_FAILURES, WINDOW_MS, LOCK_MS } from "./lockoutPolicy";

import { authError } from "./authErrors";

// Same body as the per-IP limiters (routes/auth.ts), so a client can't tell an
// account lock from an IP limit.
export const LOCKED_RESPONSE = authError("AUTH_RATE_LIMITED");

// Keyed by the e-mail itself (hashed), not the user id, so an address with no
// account is counted and locked exactly like one that exists.
export function passwordKey(normalizedEmail: string): string {
  return "pw:" + createHash("sha256").update(normalizedEmail).digest("hex");
}
export function pinKey(userId: string): string {
  return `pin:${userId}`;
}
export const ADMIN_KEY = "admin";

// The counting itself lives in lockoutStore.ts (Postgres, so locks survive a
// restart and are shared if the API ever runs more than one process).
export { isLocked, recordFailure, clearFailures, pruneLockouts } from "./lockoutStore";
