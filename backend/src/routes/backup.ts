import { Router, type Response } from "express";
import rateLimit from "express-rate-limit";
import { authenticateToken, type AuthRequest } from "../middleware/authenticate";
import { buildBackup, restoreBackup, restoreSchema } from "../lib/backup";
import { DEMO_EMAIL } from "../lib/resetDemo";
import { zodDetails } from "../lib/validation";

const router = Router();
router.use(authenticateToken);

const perUser = (req: AuthRequest) => `u:${req.userId}`;

// A backup reads everything the user has, so it is capped like the other heavy reads
const exportLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => perUser(req as AuthRequest),
  message: { error: "Príliš veľa záloh naraz. Skús to o chvíľu." },
});

// Restoring rewrites the account in one transaction: a few tries per quarter hour are plenty
const restoreLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => perUser(req as AuthRequest),
  message: { error: "Príliš veľa obnovení naraz. Skús to o chvíľu." },
});

router.get("/", exportLimiter, async (req: AuthRequest, res: Response) => {
  const backup = await buildBackup(req.userId!);
  res.setHeader("Cache-Control", "no-store");
  res.json(backup);
});

router.post("/restore", restoreLimiter, async (req: AuthRequest, res: Response) => {
  if (req.userEmail?.toLowerCase() === DEMO_EMAIL) {
    res.status(403).json({ error: "Táto akcia nie je v demo účte povolená.", code: "DEMO_RESTRICTED" });
    return;
  }
  const body = restoreSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Validation error", code: "INVALID_BACKUP", details: zodDetails(body.error).slice(0, 20) });
    return;
  }
  const counts = await restoreBackup(req.userId!, body.data.backup, body.data.mode);
  res.json({ data: counts });
});

export default router;
