import { Router } from "express";
import { authenticateToken } from "../middleware/authenticate";
import { uuidParam } from "../middleware/validateParams";
import { listRules, saveRule, deleteRule } from "../controllers/categoryRules.controller";

const router = Router();

router.use(authenticateToken);
router.param("id", uuidParam);

router.get("/", listRules);
router.post("/", saveRule);
router.delete("/:id", deleteRule);

export default router;
