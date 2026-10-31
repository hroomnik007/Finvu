import { Router } from "express";
import rateLimit from "express-rate-limit";
import {
  createHousehold,
  joinHousehold,
  getMyHousehold,
  getHouseholdMembers,
  getMonthlyStats,
  getActivity,
  leaveHousehold,
  toggleHousehold,
  regenerateInviteCode,
  removeMember,
} from "../controllers/households.controller";

const router = Router();

// Unlike every other credential-guessing endpoint in the codebase
// (login/pin-login/register), /join had no rate limiter at all — an
// authenticated attacker could make unlimited invite-code guesses against a
// target household (security audit run-1). Mirrors the login/pin-login shape.
const joinLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Príliš veľa pokusov. Skús to neskôr." },
});

router.post("/", createHousehold);
router.post("/join", joinLimiter, joinHousehold);
router.get("/me", getMyHousehold);
router.delete("/leave", leaveHousehold);
router.patch("/toggle", toggleHousehold);
router.get("/:id/members", getHouseholdMembers);
router.get("/:id/stats/monthly", getMonthlyStats);
router.get("/:id/activity", getActivity);
router.post("/:id/invite-code", regenerateInviteCode);
router.delete("/:id/members/:memberId", removeMember);

export default router;
