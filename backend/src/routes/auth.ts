import { Router, type NextFunction, type Request, type Response } from "express";
import { env } from "../config/env";
import {
  register, login, refresh, logout, me,
  verifyEmail, forgotPassword, resetPassword, deleteAccount,
  updateAvatar, adminLogin, updateWeeklyEmail, googleAuth, updateUserSettings,
  pinLogin, updatePin, removePin, changePassword, getAuthMethods, sessionCheck, pingSession,
  getSessions, deleteSession, deactivateAccount,
  pinDeviceStatus, getPinDevices, deletePinDevice, resendVerification,
} from "../controllers/auth.controller";
import {
  webauthnRegisterOptions, webauthnRegisterVerify,
  webauthnAuthenticateOptions, webauthnAuthenticateVerify,
  listPasskeys, deletePasskey, renamePasskey, webauthnReauthOptions,
} from "../controllers/webauthn.controller";
import { authenticateToken } from "../middleware/authenticate";
import { authLimiter, signInLimiter } from "../lib/authLimiters";


const MIN = 60 * 1000;

const registerLimiter = authLimiter(15 * MIN, 5);

// Admin and Google sign-in keep the all-requests limiter.
const loginLimiter = authLimiter(15 * MIN, 20);

// Password, PIN and passkey sign-in count only failed attempts per IP (see
// lib/authLimiters). The per-account lockout still applies on top.
const passwordLoginLimiter = signInLimiter(15 * MIN, 20);
const pinLoginLimiter = signInLimiter(10 * MIN, 8);
const webauthnVerifyLimiter = signInLimiter(10 * MIN, 20);

// Not an auth endpoint with sensitive failure consequences (it only ever
// reveals "does this cookie match a valid device token"), but still worth a
// cap since it's unauthenticated and open to anonymous polling.
const pinDeviceStatusLimiter = authLimiter(10 * MIN, 30);

// GET /webauthn/authenticate-options is intentionally unauthenticated (a
// caller hasn't logged in yet when requesting a login challenge) — without a
// limiter it was an unauthenticated memory-exhaustion DoS (security audit
// run-1). Mirrors pinLoginLimiter's shape.
const webauthnOptionsLimiter = authLimiter(10 * MIN, 20);

const generalLimiter = authLimiter(15 * MIN, 20);

// Re-authentication endpoints (current password / current PIN are checked in
// the handler) — without a cap a stolen access token could be used to guess
// either one, a 4-digit PIN in particular.
const sensitiveLimiter = authLimiter(15 * MIN, 10);

// /methods has its own budget: it shares nothing with verify/forgot/reset, so
// exhausting one cannot lock out the others.
const methodsLimiter = authLimiter(15 * MIN, 60);

const refreshLimiter = authLimiter(15 * MIN, 200);

const sessionCheckLimiter = authLimiter(15 * MIN, 60);

// Separate from loginLimiter: pingSession fires every 60s while the app is
// visible (up to ~15 pings per 15-min window), which was sharing — and
// exhausting — the login attempt quota, causing genuine login attempts to be
// rejected as rate-limited.
const pingLimiter = authLimiter(15 * MIN, 60);

const router = Router();

router.get("/methods",          methodsLimiter,       getAuthMethods);
router.get("/session-check",    sessionCheckLimiter,  authenticateToken, sessionCheck);
router.get("/ping",             pingLimiter,          authenticateToken, pingSession);
router.post("/register",        registerLimiter, register);
router.post("/login",           passwordLoginLimiter, login);
router.post("/refresh",         refreshLimiter,  refresh);
router.post("/logout",          logout);
router.get("/me",               authenticateToken, me);
router.get("/verify-email",     generalLimiter, verifyEmail);
router.post("/resend-verification", registerLimiter, resendVerification);
router.post("/forgot-password", generalLimiter, forgotPassword);
router.post("/reset-password",  generalLimiter, resetPassword);
router.delete("/account",       sensitiveLimiter, authenticateToken, deleteAccount);
router.patch("/avatar",         authenticateToken, updateAvatar);
router.patch("/weekly-email",   authenticateToken, updateWeeklyEmail);
router.patch("/settings",       authenticateToken, updateUserSettings);
router.post("/admin-login",     loginLimiter, adminLogin);
router.post("/google",          loginLimiter, googleAuth);
router.post("/pin-login",       pinLoginLimiter, pinLogin);
router.get("/pin-device-status", pinDeviceStatusLimiter, pinDeviceStatus);
router.patch("/pin",            sensitiveLimiter, authenticateToken, updatePin);
router.delete("/pin",           sensitiveLimiter, authenticateToken, removePin);
router.get("/pin-devices",      authenticateToken, getPinDevices);
router.delete("/pin-devices/:id", authenticateToken, deletePinDevice);
router.patch("/password",       sensitiveLimiter, authenticateToken, changePassword);

// Sessions
router.get("/sessions",                       authenticateToken, getSessions);
router.delete("/sessions/:id",                authenticateToken, deleteSession);
router.post("/deactivate",                    sensitiveLimiter, authenticateToken, deactivateAccount);

// WebAuthn. Registering, signing in and re-authenticating with a passkey are switched
// off (PASSKEYS_ENABLED, default false); stored passkeys can still be listed, renamed
// and deleted below so nobody is left unable to revoke one.
function passkeysEnabled(_req: Request, res: Response, next: NextFunction): void {
  if (env.PASSKEYS_ENABLED) { next(); return; }
  res.status(410).json({ error: "Passkeys are no longer supported.", code: "PASSKEYS_DISABLED" });
}
router.post("/webauthn/register-options",     passkeysEnabled, sensitiveLimiter, authenticateToken, webauthnRegisterOptions);
router.post("/webauthn/register-verify",      passkeysEnabled, authenticateToken, webauthnRegisterVerify);
router.get("/webauthn/authenticate-options",  passkeysEnabled, webauthnOptionsLimiter, webauthnAuthenticateOptions);
router.post("/webauthn/authenticate-verify",  passkeysEnabled, webauthnVerifyLimiter, webauthnAuthenticateVerify);
router.post("/webauthn/reauth-options",       passkeysEnabled, sensitiveLimiter, authenticateToken, webauthnReauthOptions);
router.get("/webauthn/credentials",           authenticateToken, listPasskeys);
router.patch("/webauthn/credentials/:id",     authenticateToken, renamePasskey);
router.delete("/webauthn/credentials/:id",    authenticateToken, deletePasskey);

export default router;
