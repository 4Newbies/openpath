// ==============================================================================
// Auth Controller - Accessible Authentication & Refugee Onboarding Entry
// ==============================================================================

import crypto from "node:crypto";
import { db } from "../db/dbClient.js";

function generateRecoveryCode() {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const nums = "23456789";
  const randChar = (set) => set[Math.floor(Math.random() * set.length)];
  return `OP-${randChar(letters)}${randChar(nums)}${randChar(letters)}${randChar(nums)}`;
}

export const authController = {
  /**
   * Start a new accessible onboarding session
   * Supports immediate start without requiring password or email up front
   */
  async startOnboardingSession(req, res) {
    try {
      const { primaryLanguage = "AMHARIC", isRefugeeStatus = false } = req.body || {};
      
      const user = await db.users.create({
        primaryLanguage,
        isRefugeeStatus: Boolean(isRefugeeStatus),
        authType: "PROVISIONAL_SESSION",
      });

      const recoveryCode = generateRecoveryCode();
      const account = await db.accounts.create({
        userId: user.id,
        refugeeRecoveryCode: recoveryCode,
        provisionalToken: crypto.randomBytes(24).toString("hex"),
      });

      // Default accessibility preferences
      const preferences = await db.accessibilityPreferences.upsert(user.id, {
        voiceGuidanceEnabled: true,
        autoReadAloud: true,
        amharicVoiceModel: "AZURE_AMEHA",
        speechRate: 1.0,
      });

      // Initialize Onboarding Session
      const session = await db.onboardingSessions.create({
        userId: user.id,
        recoveryCode,
        totalSteps: 6,
      });

      return res.status(201).json({
        success: true,
        message: "Onboarding session created successfully",
        data: {
          sessionId: session.id,
          userId: user.id,
          recoveryCode,
          currentStepIndex: 0,
          primaryLanguage,
          preferences,
        },
      });
    } catch (err) {
      console.error("[Auth] Start session error:", err);
      return res.status(500).json({
        success: false,
        error: "Failed to initialize onboarding session",
        errorAmharic: "የምዝገባ ክፍለ ጊዜ መጀመር አልተቻለም። እባክዎ እንደገና ይሞክሩ።",
      });
    }
  },

  /**
   * Resume onboarding via 6-digit recovery code
   */
  async resumeWithCode(req, res) {
    try {
      const { recoveryCode } = req.body;
      if (!recoveryCode) {
        return res.status(400).json({
          success: false,
          error: "Recovery code is required",
          errorAmharic: "እባክዎ የማስመለሻ ኮድዎን ያስገቡ",
        });
      }

      const session = await db.onboardingSessions.findByRecoveryCode(recoveryCode);
      if (!session) {
        return res.status(404).json({
          success: false,
          error: "No active session found with this code",
          errorAmharic: "በዚህ ኮድ የተመዘገበ ክፍለ ጊዜ አልተገኘም። እባክዎ ኮዱን ያረጋግጡ።",
        });
      }

      const user = await db.users.findById(session.userId);
      const answers = await db.onboardingAnswers.findBySessionId(session.id);
      const preferences = await db.accessibilityPreferences.findByUserId(session.userId);
      const profile = await db.profiles.findByUserId(session.userId);

      return res.json({
        success: true,
        data: {
          sessionId: session.id,
          userId: session.userId,
          recoveryCode: session.recoveryCode,
          currentStepIndex: session.currentStepIndex,
          isCompleted: session.isCompleted,
          user,
          answers,
          preferences,
          profile,
        },
      });
    } catch (err) {
      console.error("[Auth] Resume error:", err);
      return res.status(500).json({
        success: false,
        error: "Failed to resume session",
        errorAmharic: "ክፍለ ጊዜውን ማስቀጠል አልተቻለም",
      });
    }
  },

  /**
   * Get current session info
   */
  async getSessionStatus(req, res) {
    try {
      const { sessionId } = req.params;
      const session = await db.onboardingSessions.findById(sessionId);
      if (!session) {
        return res.status(404).json({ success: false, error: "Session not found" });
      }

      const answers = await db.onboardingAnswers.findBySessionId(sessionId);
      const preferences = await db.accessibilityPreferences.findByUserId(session.userId);

      return res.json({
        success: true,
        data: {
          session,
          answers,
          preferences,
        },
      });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  },
};
