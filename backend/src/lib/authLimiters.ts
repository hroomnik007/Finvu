import rateLimit, { type RateLimitRequestHandler } from "express-rate-limit";
import { authError } from "./authErrors";

// Every auth limiter answers with the same coded body, so the app can show a
// translated "too many attempts" (and it matches the per-account lockout's
// LOCKED_RESPONSE exactly).
export const RATE_LIMITED_BODY = authError("AUTH_RATE_LIMITED");

export function authLimiter(windowMs: number, max: number): RateLimitRequestHandler {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: RATE_LIMITED_BODY,
  });
}

// Sign-in limiter (password, PIN, passkey): only failed attempts count
// against the IP, so a household or office behind one IP isn't locked out
// by its own successful sign-ins. Any response with status >= 400 counts —
// wrong password, unknown e-mail, unverified, and the limiter's own 429.
// The per-account lockout (lib/loginLockout, 5 fails / 15 min) is separate
// and unchanged.
export function signInLimiter(windowMs: number, max: number): RateLimitRequestHandler {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    message: RATE_LIMITED_BODY,
  });
}
