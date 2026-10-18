import { Router } from "express";
import rateLimit from "express-rate-limit";
import {
  register, login, refresh, logout, me,
  verifyEmail, forgotPassword, resetPassword, deleteAccount,
  updateAvatar, demoLogin, adminLogin, updateWeeklyEmail, googleAuth, updateUserSettings,
  pinLogin, updatePin, removePin, changePassword, getAuthMethods, sessionCheck, pingSession,
  getSessions, deleteSession, deactivateAccount,
  pinDeviceStatus, getPinDevices, deletePinDevice, resendVerification,
} from "../controllers/auth.controller";
import {
  webauthnRegisterOptions, webauthnRegisterVerify,
  webauthnAuthenticateOptions, webauthnAuthenticateVerify,
} from "../controllers/webauthn.controller";
import { authenticateToken } from "../middleware/authenticate";


const registerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Príliš veľa pokusov. Skúste neskôr." },
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Príliš veľa pokusov. Skúste neskôr." },
});

const pinLoginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Príliš veľa pokusov PIN. Skúste za 10 minút." },
});

// Not an auth endpoint with sensitive failure consequences (it only ever
// reveals "does this cookie match a valid device token"), but still worth a
// cap since it's unauthenticated and open to anonymous polling.
const pinDeviceStatusLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Príliš veľa pokusov. Skúste za 10 minút." },
});

// GET /webauthn/authenticate-options is intentionally unauthenticated (a
// caller hasn't logged in yet when requesting a login challenge) — without a
// limiter it was an unauthenticated memory-exhaustion DoS (security audit
// run-1). Mirrors pinLoginLimiter's shape.
const webauthnOptionsLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Príliš veľa pokusov. Skúste za 10 minút." },
});

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Príliš veľa pokusov. Skúste neskôr." },
})

// Re-authentication endpoints (current password / current PIN are checked in
// the handler) — without a cap a stolen access token could be used to guess
// either one, a 4-digit PIN in particular.
const sensitiveLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Príliš veľa pokusov. Skúste neskôr." },
});

// /methods has its own budget: it shares nothing with verify/forgot/reset, so
// exhausting one cannot lock out the others.
const methodsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Príliš veľa pokusov. Skúste neskôr." },
});

const webauthnVerifyLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Príliš veľa pokusov. Skúste za 10 minút." },
});

const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Príliš veľa pokusov. Skúste neskôr.' },
});

const sessionCheckLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Príliš veľa pokusov. Skúste neskôr.' },
});

// Separate from loginLimiter: pingSession fires every 60s while the app is
// visible (up to ~15 pings per 15-min window), which was sharing — and
// exhausting — the login attempt quota, causing genuine login attempts to be
// rejected as rate-limited.
const pingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Príliš veľa pokusov. Skúste neskôr.' },
});

const router = Router();

router.get("/methods",          methodsLimiter,       getAuthMethods);
router.get("/session-check",    sessionCheckLimiter,  authenticateToken, sessionCheck);
router.get("/ping",             pingLimiter,          authenticateToken, pingSession);
router.post("/register",        registerLimiter, register);
router.post("/login",           loginLimiter,    login);
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
router.post("/demo-login",      registerLimiter, demoLogin);
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

// WebAuthn
router.get("/webauthn/register-options",      authenticateToken, webauthnRegisterOptions);
router.post("/webauthn/register-verify",      authenticateToken, webauthnRegisterVerify);
router.get("/webauthn/authenticate-options",  webauthnOptionsLimiter, webauthnAuthenticateOptions);
router.post("/webauthn/authenticate-verify",  webauthnVerifyLimiter, webauthnAuthenticateVerify);

export default router;
