import { Router } from "express";
import { authenticateToken } from "../middleware/authenticate";
import { idempotent } from "../middleware/idempotency";
import { uuidParam } from "../middleware/validateParams";
import {
  listTransactions,
  createTransaction,
  createTransactionsBulk,
  findDuplicateTransactions,
  changeFixedPrice,
  endFixedSeries,
  bulkSetTransactionCategory,
  bulkDeleteTransactions,
  updateTransaction,
  deleteTransaction,
  getSummary,
  getBalanceAtMonth,
  getSummaryCards,
} from "../controllers/transactions.controller";
import { getMonthlySeries } from "../controllers/series.controller";
import { suggestTransactionCategory } from "../controllers/categorySuggest.controller";

const router = Router();

router.use(authenticateToken);
router.param("id", uuidParam);

router.get("/summary",          getSummary);
router.get("/balance-at-month", getBalanceAtMonth);
router.get("/summary-cards",    getSummaryCards);
router.get("/monthly-series",   getMonthlySeries);
router.get("/suggest-category", suggestTransactionCategory);
router.get("/",        listTransactions);
router.post("/bulk",   idempotent, createTransactionsBulk);
router.post("/duplicates", findDuplicateTransactions);
router.patch("/bulk",  bulkSetTransactionCategory);
router.post("/bulk-delete", bulkDeleteTransactions);
router.post("/",       idempotent, createTransaction);
router.put("/:id",     updateTransaction);
router.post("/:id/price-change", changeFixedPrice);
router.post("/:id/end", endFixedSeries);
router.delete("/:id",  deleteTransaction);

export default router;
