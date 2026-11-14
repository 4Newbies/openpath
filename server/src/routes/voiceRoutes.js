import { Router } from "express";
import { voiceController } from "../controllers/voiceController.js";

const router = Router();

// Addis Scribe STT endpoint
router.post("/stt", voiceController.handleSTT);

// Addis TTS endpoint
router.post("/tts", voiceController.handleTTS);

// Audio prompts catalog
router.get("/prompts", voiceController.getPrompts);

// Voice interaction audits
router.get("/logs", voiceController.getVoiceLogs);

export default router;
