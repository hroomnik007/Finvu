import jwt from "jsonwebtoken";
import { createHash, timingSafeEqual, randomBytes } from "crypto";
import { env } from "../config/env";

// Refresh tokens are high-entropy, machine-generated opaque strings (unlike
// passwords, which are low-entropy and need bcrypt's slow, salted hashing to
// resist brute-force/dictionary attacks). bcrypt also silently truncates its
// input at 72 bytes — a signed refresh-token JWT exceeds that well before the
// parts that vary between tokens (iat/exp/signature), so every token issued
// to the same user used to hash identically. SHA-256 has no such truncation
// and is the standard choice for hashing opaque token secrets.
function sha256Hex(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface AccessTokenPayload {
  userId: string;
  email: string;
}

export interface AdminTokenPayload {
  role: "admin";
  sub: "admin";
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: "15m" });
}

export function signRefreshToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, { expiresIn: "30d" });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
}

export function verifyRefreshToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as AccessTokenPayload;
}

export function signAdminToken(): string {
  return jwt.sign({ role: "admin", sub: "admin" }, env.JWT_ADMIN_SECRET, { expiresIn: "4h" });
}

export function verifyAdminToken(token: string): AdminTokenPayload {
  const payload = jwt.verify(token, env.JWT_ADMIN_SECRET) as AdminTokenPayload;
  if (payload.role !== "admin" || payload.sub !== "admin") throw new Error("Not an admin token");
  return payload;
}

export function hashToken(token: string): Promise<string> {
  return Promise.resolve(sha256Hex(token));
}

export function compareToken(token: string, hash: string): Promise<boolean> {
  const a = Buffer.from(sha256Hex(token), "hex");
  const b = Buffer.from(hash, "hex");
  // Old bcrypt-hashed rows (pre-fix) won't decode to a 32-byte buffer and
  // must not match — also guards timingSafeEqual, which throws on unequal
  // lengths instead of returning false.
  if (a.length !== b.length) return Promise.resolve(false);
  return Promise.resolve(timingSafeEqual(a, b));
}

export function refreshTokenExpiry(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d;
}

// One set of cookie options for every auth cookie.
// SameSite=Lax is enough: finvu.pedani.eu and api.pedani.eu are the same site
// (pedani.eu), so the frontend's credentialed fetch() calls carry Lax cookies,
// while cross-site requests (another site's form or fetch) do not. Local dev
// (localhost:5173 -> localhost:3001) is same-site too.
export function cookieOptions(path: string, maxAge: number, httpOnly = true) {
  return {
    httpOnly,
    secure: env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge,
    path,
  };
}

// clearCookie must use the same attributes as the set, minus maxAge.
export function clearCookieOptions(opts: ReturnType<typeof cookieOptions>) {
  const { maxAge: _maxAge, ...rest } = opts;
  return rest;
}

export const REFRESH_COOKIE = "refreshToken";

export const REFRESH_COOKIE_OPTIONS = cookieOptions("/api/auth", 30 * 24 * 60 * 60 * 1000);

export const ADMIN_COOKIE = "adminToken";

export const ADMIN_COOKIE_OPTIONS = cookieOptions("/api/admin", 4 * 60 * 60 * 1000);

// Double-submit CSRF token for mutating /api/admin routes. The frontend
// (finvu.pedani.eu) can't read cookies set by api.pedani.eu, so it gets the
// token from the admin-login response or GET /api/admin/csrf, keeps it in
// memory and sends it back as a header; requireAdminCsrf in routes/admin.ts
// rejects any non-GET request where header and cookie don't match.
// SameSite=Lax already keeps the admin cookie off cross-site requests; this
// stays as a second layer.
export const ADMIN_CSRF_COOKIE = "adminCsrf";
export const ADMIN_CSRF_HEADER = "x-admin-csrf-token";

export const ADMIN_CSRF_COOKIE_OPTIONS = cookieOptions("/api/admin", 4 * 60 * 60 * 1000);

// ── PIN device binding ──────────────────────────────────────────────────────
// PIN login is a full-strength remote credential (same privilege as password
// login), so a bare email+PIN must not be enough from an arbitrary browser —
// it must also present a token proving it's a device the PIN was actually set
// up on. Issued by updatePin, verified (and slid forward) by pinLogin, wiped
// by updatePin/removePin/changePassword/resetPassword. Same opaque-token +
// SHA-256-hash-at-rest pattern as REFRESH_COOKIE (see hashToken/compareToken
// above) — never stored or logged in plaintext.
export const PIN_DEVICE_COOKIE = "pinDevice";

export function generatePinDeviceToken(): string {
  return randomBytes(32).toString("hex");
}

export function pinDeviceTokenExpiry(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 90);
  return d;
}

// httpOnly + a dedicated, narrowly-scoped, short-lived (relative to the
// refresh cookie) opaque token is the main defense here; Lax adds to it.
export const PIN_DEVICE_COOKIE_OPTIONS = cookieOptions("/api/auth", 90 * 24 * 60 * 60 * 1000);
