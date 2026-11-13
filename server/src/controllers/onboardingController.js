// ==============================================================================
// Onboarding Controller - One-Question-At-A-Time Progress Management
// ==============================================================================

import { db } from "../db/dbClient.js";
import { ONBOARDING_PROMPTS } from "../services/voice/audioPrompts.js";

export const onboardingController = {
  /**
   * Get all onboarding step definitions and bilingual prompts
   */
  async getSteps(req, res) {
    return res.json({
      success: true,
      data: {
        totalSteps: ONBOARDING_PROMPTS.length,
        steps: ONBOARDING_PROMPTS,
      },
    });
  },

  /**
   * Save an answer for a single step (JSONB format)
   */
  async saveStepAnswer(req, res) {
    try {
      const { sessionId, stepIndex, stepKey, answerData, answeredViaVoice, transcribedText, voiceConfidence } = req.body;

      if (!sessionId || stepKey === undefined || !answerData) {
        return res.status(400).json({
          success: false,
          error: "Session ID, stepKey, and answerData are required",
          errorAmharic: "እባክዎ የተሟላ የመረጃ ምላሽ ያቅርቡ",
        });
      }

      const session = await db.onboardingSessions.findById(sessionId);
      if (!session) {
        return res.status(404).json({
          success: false,
          error: "Session not found",
          errorAmharic: "ክፍለ ጊዜው አልተገኘም",
        });
      }

      // Save answer in JSONB
      const answer = await db.onboardingAnswers.saveStepAnswer({
        sessionId,
        stepIndex: Number(stepIndex),
        stepKey,
        answerData,
        answeredViaVoice: Boolean(answeredViaVoice),
        transcribedText: transcribedText || null,
        voiceConfidence: voiceConfidence ? Number(voiceConfidence) : null,
      });

      // Update session progress
      const nextStep = Math.max(session.currentStepIndex, Number(stepIndex) + 1);
      await db.onboardingSessions.update(sessionId, {
        currentStepIndex: Math.min(nextStep, session.totalSteps - 1),
      });

      // Synchronize with learner profile if relevant step
      if (stepKey === "identity") {
        await db.profiles.upsert(session.userId, {
          fullNameAmharic: answerData.fullNameAmharic || "",
          fullNameEnglish: answerData.fullNameEnglish || "",
          ageRange: answerData.ageRange || null,
          gender: answerData.gender || null,
          currentRegion: answerData.currentRegion || "",
          currentLocation: answerData.currentLocation || "",
        });

        // Store identification document
        if (answerData.idType) {
          await db.identifications.create({
            userId: session.userId,
            documentType: answerData.idType,
            documentNumber: answerData.documentNumber || null,
            isRefugeeDoc: answerData.idType === "UNHCR_REFUGEE_REGISTRATION" || answerData.isRefugeeDoc === true,
            issuedBy: answerData.issuedBy || null,
            notes: answerData.idNotes || null,
          });
        }
      } else if (stepKey === "contact") {
        await db.profiles.upsert(session.userId, {
          preferredContactMethod: answerData.preferredContactMethod || "PHONE_CALL",
          trustedContactName: answerData.trustedContactName || null,
          trustedContactPhone: answerData.trustedContactPhone || null,
        });
        if (answerData.phoneNumber) {
          await db.users.update(session.userId, { phoneNumber: answerData.phoneNumber });
        }
      } else if (stepKey === "education") {
        await db.profiles.upsert(session.userId, {
          educationLevel: answerData.educationLevel || "BASIC_LITERACY_NUMERACY",
          readingComfortLevel: answerData.readingComfortLevel || "moderate",
          primaryLearningGoal: answerData.primaryLearningGoal || "",
        });
      } else if (stepKey === "language_accessibility") {
        await db.accessibilityPreferences.upsert(session.userId, {
          screenReaderActive: Boolean(answerData.screenReaderActive),
          highContrastMode: answerData.highContrastMode || "DEFAULT",
          fontSize: answerData.fontSize || "NORMAL",
          voiceGuidanceEnabled: answerData.voiceGuidanceEnabled !== undefined ? Boolean(answerData.voiceGuidanceEnabled) : true,
          autoReadAloud: answerData.autoReadAloud !== undefined ? Boolean(answerData.autoReadAloud) : true,
          amharicVoiceModel: answerData.amharicVoiceModel || "AZURE_AMEHA",
          speechRate: answerData.speechRate ? Number(answerData.speechRate) : 1.0,
        });
        if (answerData.primaryLanguage) {
          await db.users.update(session.userId, { primaryLanguage: answerData.primaryLanguage });
        }
      }

      return res.json({
        success: true,
        message: "Answer saved successfully",
        data: {
          answer,
          currentStepIndex: nextStep,
        },
      });
    } catch (err) {
      console.error("[Onboarding] Save step answer error:", err);
      return res.status(500).json({
        success: false,
        error: "Failed to save answer",
        errorAmharic: "ምላሹን ማስቀመጥ አልተቻለም",
      });
    }
  },

  /**
   * Save progress and retrieve recovery code
   */
  async saveProgress(req, res) {
    try {
      const { sessionId } = req.body;
      const session = await db.onboardingSessions.findById(sessionId);
      if (!session) {
        return res.status(404).json({ success: false, error: "Session not found" });
      }

      return res.json({
        success: true,
        message: "Progress safely stored",
        messageAmharic: "የምዝገባ እድገትዎ በሚገባ ተቀምጧል።",
        data: {
          recoveryCode: session.recoveryCode,
          currentStepIndex: session.currentStepIndex,
          totalSteps: session.totalSteps,
        },
      });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  },

  /**
   * Finalize and complete registration
   */
  async completeOnboarding(req, res) {
    try {
      const { sessionId } = req.body;
      const session = await db.onboardingSessions.findById(sessionId);
      if (!session) {
        return res.status(404).json({ success: false, error: "Session not found" });
      }

      // Mark session complete
      const updatedSession = await db.onboardingSessions.update(sessionId, {
        isCompleted: true,
        completedAt: new Date().toISOString(),
      });

      const user = await db.users.findById(session.userId);
      const profile = await db.profiles.findByUserId(session.userId);
      const preferences = await db.accessibilityPreferences.findByUserId(session.userId);
      const answers = await db.onboardingAnswers.findBySessionId(sessionId);
      const docs = await db.identifications.findByUserId(session.userId);

      const studentIdNumber = `OP-ET-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

      return res.json({
        success: true,
        message: "Onboarding completed successfully!",
        messageAmharic: "እንኳን ደስ አለዎት! ምዝገባዎ በተሳካ ሁኔታ ተጠናቋል።",
        data: {
          studentIdNumber,
          user,
          profile,
          preferences,
          documents: docs,
          session: updatedSession,
          answersCount: answers.length,
          assignedAdvisor: {
            name: "ሰላማዊት ታደሰ (Selamawit Tadesse)",
            role: "ተደራሽነትና ማህበራዊ ድጋፍ አማካሪ (Accessibility & Support Specialist)",
            contactPhone: "+251 911 000 111",
          },
        },
      });
    } catch (err) {
      console.error("[Onboarding] Complete error:", err);
      return res.status(500).json({
        success: false,
        error: "Failed to finalize registration",
        errorAmharic: "ምዝገባን ማጠናቀቅ አልተቻለም። እባክዎ እንደገና ይሞክሩ።",
      });
    }
  },
};
