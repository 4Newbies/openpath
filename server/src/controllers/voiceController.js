// ==============================================================================
// Voice Controller - Addis Scribe STT & Addis TTS API Handlers
// ==============================================================================

import { addisScribeSTT } from "../services/voice/addisScribeSTT.js";
import { addisTTS } from "../services/voice/addisTTS.js";
import { ONBOARDING_PROMPTS, GENERAL_VOICE_FEEDBACK } from "../services/voice/audioPrompts.js";
import { db } from "../db/dbClient.js";

export const voiceController = {
  /**
   * Transcribe Amharic audio via Addis Scribe STT
   * POST /api/voice/stt
   */
  async handleSTT(req, res) {
    const startTime = Date.now();
    try {
      const { audioData, audioFormat = "audio/webm", contextHint = "general", sessionId } = req.body || {};

      let audioBuffer = null;
      if (audioData) {
        const cleanBase64 = audioData.replace(/^data:audio\/\w+;base64,/, "");
        audioBuffer = Buffer.from(cleanBase64, "base64");
      }

      // Execute Addis Scribe STT
      const result = await addisScribeSTT.transcribeAudio({
        audioBuffer,
        audioFormat,
        contextHint,
      });

      // Log Voice Interaction
      await db.voiceInteractions.log({
        sessionId,
        serviceType: "ADDIS_SCRIBE_STT",
        languageCode: "am-ET",
        inputText: `Audio [${audioFormat}, context: ${contextHint}]`,
        outputText: result.text,
        status: "SUCCESS",
        latencyMs: Date.now() - startTime,
        confidenceScore: result.confidence,
      });

      return res.json({
        success: true,
        data: {
          transcribedText: result.text,
          confidence: result.confidence,
          language: result.language,
          model: result.model,
          durationSecs: result.durationSecs,
          latencyMs: Date.now() - startTime,
        },
      });
    } catch (err) {
      console.error("[Voice Controller] STT error:", err);

      await db.voiceInteractions.log({
        serviceType: "ADDIS_SCRIBE_STT",
        status: "FAILED",
        errorMessage: err.message,
      });

      return res.status(500).json({
        success: false,
        error: "Speech-to-text processing failed",
        errorAmharic: "የድምፅ ንግግሩን ወደ ጽሑፍ መቀየር አልተቻለም። እባክዎ እንደገና ይሞክሩ።",
      });
    }
  },

  /**
   * Synthesize Amharic speech via Addis TTS
   * POST /api/voice/tts
   */
  async handleTTS(req, res) {
    const startTime = Date.now();
    try {
      const { text, voice = "Addis-Selam-Neural", rate = 1.0, sessionId } = req.body || {};

      if (!text) {
        return res.status(400).json({
          success: false,
          error: "Text is required for Addis TTS synthesis",
          errorAmharic: "እባክዎ የሚነበበውን ጽሑፍ ያቅርቡ",
        });
      }

      const result = await addisTTS.synthesize({
        text,
        voice,
        rate: Number(rate),
      });

      // Log Voice Interaction
      await db.voiceInteractions.log({
        sessionId,
        serviceType: "ADDIS_TTS",
        languageCode: "am-ET",
        inputText: text,
        outputText: `Audio synthesized (${result.durationSecs}s)`,
        status: "SUCCESS",
        latencyMs: Date.now() - startTime,
      });

      return res.json({
        success: true,
        data: {
          audioDataUri: result.audioDataUri,
          durationSecs: result.durationSecs,
          modelUsed: result.modelUsed,
          text: result.text,
          latencyMs: Date.now() - startTime,
        },
      });
    } catch (err) {
      console.error("[Voice Controller] Addis TTS error:", err);

      await db.voiceInteractions.log({
        serviceType: "ADDIS_TTS",
        status: "FAILED",
        errorMessage: err.message,
      });

      return res.status(500).json({
        success: false,
        error: "Text-to-speech synthesis failed",
        errorAmharic: "ድምፁን ማመንጨት አልተቻለም",
      });
    }
  },

  /**
   * Get pre-synthesized prompts catalog
   * GET /api/voice/prompts
   */
  async getPrompts(req, res) {
    return res.json({
      success: true,
      data: {
        steps: ONBOARDING_PROMPTS,
        feedback: GENERAL_VOICE_FEEDBACK,
      },
    });
  },

  /**
   * Get voice interaction logs for accessibility auditing
   * GET /api/voice/logs
   */
  async getVoiceLogs(req, res) {
    try {
      const logs = await db.voiceInteractions.getRecent(50);
      return res.json({
        success: true,
        data: logs,
      });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  },
};
