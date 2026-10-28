import { Router, Request, Response, NextFunction } from "express";
import { verifyAdminToken, ADMIN_COOKIE, ADMIN_CSRF_COOKIE, ADMIN_CSRF_HEADER } from "../lib/tokens";
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

// Double-submit CSRF check, on top of the admin cookies being SameSite=Lax:
// a cross-site attacker can't read our cookies, so they can't produce a header
// value that matches ADMIN_CSRF_COOKIE.
function requireAdminCsrf(req: Request, res: Response, next: NextFunction): void {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
    next();
    return;
  }
  const cookieToken = req.cookies?.[ADMIN_CSRF_COOKIE];
  const headerToken = req.headers[ADMIN_CSRF_HEADER];
  if (!cookieToken || typeof headerToken !== "string" || headerToken !== cookieToken) {
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
router.get("/stats", getStats);
router.get("/users", getUserList);

export default router;
