import { Router } from "express";
import { authenticateToken } from "../middleware/authenticate";
import { uuidParam } from "../middleware/validateParams";
import {
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  deleteAllCategories,
  reorderCategories,
  setCategoriesShared,
} from "../controllers/categories.controller";

const router = Router();

router.use(authenticateToken);
router.param("id", uuidParam);

router.get("/",          listCategories);
router.post("/",         createCategory);
router.patch("/reorder", reorderCategories);
router.post("/share",    setCategoriesShared);
router.delete("/",       deleteAllCategories);
router.put("/:id",       updateCategory);
router.delete("/:id",    deleteCategory);

export default router;
