import { Router } from "express";
import { authenticateToken } from "../middleware/authenticate";
import { listSuggestions, dismissSuggestion } from "../controllers/subscriptions.controller";

const router = Router();

router.use(authenticateToken);

router.get("/suggestions", listSuggestions);
router.post("/dismissals", dismissSuggestion);

export default router;
