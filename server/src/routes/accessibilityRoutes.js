import { Router } from "express";
import { accessibilityController } from "../controllers/accessibilityController.js";

const router = Router();

router.get("/:userId", accessibilityController.getPreferences);
router.put("/:userId", accessibilityController.updatePreferences);

export default router;
