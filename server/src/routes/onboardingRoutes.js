import { Router } from "express";
import { onboardingController } from "../controllers/onboardingController.js";

const router = Router();

router.get("/steps", onboardingController.getSteps);
router.post("/answer", onboardingController.saveStepAnswer);
router.post("/save-progress", onboardingController.saveProgress);
router.post("/complete", onboardingController.completeOnboarding);

export default router;
