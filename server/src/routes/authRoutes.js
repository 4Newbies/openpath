import { Router } from "express";
import { authController } from "../controllers/authController.js";

const router = Router();

router.post("/start", authController.startOnboardingSession);
router.post("/resume", authController.resumeWithCode);
router.get("/session/:sessionId", authController.getSessionStatus);

export default router;
