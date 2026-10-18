import { Router } from "express";
import { authenticateToken } from "../middleware/authenticate";
import { uuidParam } from "../middleware/validateParams";
import {
  listTransactions,
  createTransaction,
  updateTransaction,
  deleteTransaction,
  getSummary,
  getBalanceAtMonth,
  getSummaryCards,
} from "../controllers/transactions.controller";

const router = Router();

router.use(authenticateToken);
router.param("id", uuidParam);

router.get("/summary",          getSummary);
router.get("/balance-at-month", getBalanceAtMonth);
router.get("/summary-cards",    getSummaryCards);
router.get("/",        listTransactions);
router.post("/",       createTransaction);
router.put("/:id",     updateTransaction);
router.delete("/:id",  deleteTransaction);

export default router;
