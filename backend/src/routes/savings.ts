import { Router } from "express";
import { authenticateToken } from "../middleware/authenticate";
import { uuidParam } from "../middleware/validateParams";
import {
  listSavingsGoals,
  createSavingsGoal,
  updateSavingsGoal,
  deleteSavingsGoal,
  pauseSavingsGoal,
  resumeSavingsGoal,
  listDeposits,
  addDeposit,
  deleteDeposit,
} from "../controllers/savings.controller";

const router = Router();

router.use(authenticateToken);
router.param("id", uuidParam);
router.param("depositId", uuidParam);

router.get("/",     listSavingsGoals);
router.post("/",    createSavingsGoal);
router.patch("/:id", updateSavingsGoal);
router.patch("/:id/pause", pauseSavingsGoal);
router.patch("/:id/resume", resumeSavingsGoal);
router.delete("/:id", deleteSavingsGoal);
router.get("/:id/deposits", listDeposits);
router.post("/:id/deposits", addDeposit);
router.delete("/:id/deposits/:depositId", deleteDeposit);

export default router;
