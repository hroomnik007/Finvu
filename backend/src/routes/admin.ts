import { randomBytes, timingSafeEqual } from "crypto";
import { Router, Request, Response, NextFunction } from "express";
import {
  verifyAdminToken, ADMIN_COOKIE, ADMIN_CSRF_COOKIE, ADMIN_CSRF_COOKIE_OPTIONS, ADMIN_CSRF_HEADER,
} from "../lib/tokens";
import { getStats, getUserList } from "../controllers/admin.controller";
import { adminLogout } from "../controllers/auth.controller";

function authenticateAdmin(req: Request, res: Response, next: NextFunction): void {
  const token: string | undefined = req.cookies?.[ADMIN_COOKIE];
  if (!token) {
    res.status(401).json({ error: "Admin token required" });
    return;
  }
  try {
    verifyAdminToken(token);
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired admin token" });
  }
}

function tokensMatch(cookie: unknown, header: unknown): boolean {
  if (typeof cookie !== "string" || !cookie || typeof header !== "string") return false;
  const a = Buffer.from(cookie);
  const b = Buffer.from(header);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Double-submit CSRF check, on top of the admin cookies being SameSite=Lax:
// a cross-site attacker can't read our cookies or the token returned to the
// frontend, so they can't produce a header value that matches ADMIN_CSRF_COOKIE.
function requireAdminCsrf(req: Request, res: Response, next: NextFunction): void {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
    next();
    return;
  }
  const cookieToken = req.cookies?.[ADMIN_CSRF_COOKIE];
  const headerToken = req.headers[ADMIN_CSRF_HEADER];
  if (!tokensMatch(cookieToken, headerToken)) {
    res.status(403).json({ error: "CSRF check failed" });
    return;
  }
  next();
}

const router = Router();

router.use(requireAdminCsrf);

router.post("/logout", adminLogout);

router.use(authenticateAdmin);
router.get("/session", (_req, res) => res.json({ ok: true }));
// Lets the frontend recover the CSRF token after a page reload (it only keeps
// it in memory). Returns the current one, or issues a new one if the cookie is
// gone while the admin session is still valid.
router.get("/csrf", (req, res) => {
  let csrfToken: string | undefined = req.cookies?.[ADMIN_CSRF_COOKIE];
  if (typeof csrfToken !== "string" || !/^[0-9a-f]{64}$/.test(csrfToken)) {
    csrfToken = randomBytes(32).toString("hex");
    res.cookie(ADMIN_CSRF_COOKIE, csrfToken, ADMIN_CSRF_COOKIE_OPTIONS);
  }
  res.set("Cache-Control", "no-store");
  res.json({ csrfToken });
});
router.get("/stats", getStats);
router.get("/users", getUserList);

export default router;
