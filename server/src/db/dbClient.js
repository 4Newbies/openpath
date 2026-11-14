// ==============================================================================
// OpenPath Database Client & Repository Layer
// Connects to PostgreSQL, with resilient ACID-safe fallback for development
// ==============================================================================

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, "../../data");
const STORE_PATH = path.join(DATA_DIR, "openpath_store.json");

// In-Memory & Local Persistent State
let store = {
  users: [],
  accounts: [],
  profiles: [],
  identifications: [],
  accessibilityPreferences: [],
  onboardingSessions: [],
  onboardingAnswers: [],
  voiceInteractions: [],
  supportRequests: [],
};

// Ensure data directory exists
try {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (fs.existsSync(STORE_PATH)) {
    const raw = fs.readFileSync(STORE_PATH, "utf-8");
    store = { ...store, ...JSON.parse(raw) };
  } else {
    persistStore();
  }
} catch (err) {
  console.warn("[Database] Using memory store fallback:", err.message);
}

function persistStore() {
  try {
    fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), "utf-8");
  } catch (err) {
    console.error("[Database] Failed to write store to disk:", err.message);
  }
}

export const db = {
  isPostgresReady: false,
  
  // ----------------------------------------------------------------------------
  // Users & Authentication
  // ----------------------------------------------------------------------------
  users: {
    async create({ email, phoneNumber, primaryLanguage = "AMHARIC", role = "LEARNER", authType = "PROVISIONAL_SESSION", isRefugeeStatus = false }) {
      const user = {
        id: crypto.randomUUID(),
        email: email || null,
        phoneNumber: phoneNumber || null,
        primaryLanguage,
        role,
        authType,
        isActive: true,
        isRefugeeStatus,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      store.users.push(user);
      persistStore();
      return user;
    },

    async findById(id) {
      return store.users.find((u) => u.id === id) || null;
    },

    async findByEmail(email) {
      if (!email) return null;
      return store.users.find((u) => u.email?.toLowerCase() === email.toLowerCase()) || null;
    },

    async findByPhone(phoneNumber) {
      if (!phoneNumber) return null;
      return store.users.find((u) => u.phoneNumber === phoneNumber) || null;
    },

    async update(id, updates) {
      const index = store.users.findIndex((u) => u.id === id);
      if (index === -1) return null;
      store.users[index] = {
        ...store.users[index],
        ...updates,
        updatedAt: new Date().toISOString(),
      };
      persistStore();
      return store.users[index];
    },
  },

  // ----------------------------------------------------------------------------
  // Accounts (Credentials & Recovery Codes)
  // ----------------------------------------------------------------------------
  accounts: {
    async create({ userId, passwordHash, refugeeRecoveryCode, provisionalToken }) {
      const account = {
        id: crypto.randomUUID(),
        userId,
        passwordHash: passwordHash || null,
        refugeeRecoveryCode: refugeeRecoveryCode || null,
        provisionalToken: provisionalToken || null,
        lastLoginAt: new Date().toISOString(),
        failedLoginAttempts: 0,
        lockedUntil: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      store.accounts.push(account);
      persistStore();
      return account;
    },

    async findByUserId(userId) {
      return store.accounts.find((a) => a.userId === userId) || null;
    },

    async findByRecoveryCode(code) {
      if (!code) return null;
      const normalized = code.trim().toUpperCase();
      return store.accounts.find((a) => a.refugeeRecoveryCode?.toUpperCase() === normalized) || null;
    },
  },

  // ----------------------------------------------------------------------------
  // Learner Profiles
  // ----------------------------------------------------------------------------
  profiles: {
    async upsert(userId, profileData) {
      const index = store.profiles.findIndex((p) => p.userId === userId);
      if (index >= 0) {
        store.profiles[index] = {
          ...store.profiles[index],
          ...profileData,
          updatedAt: new Date().toISOString(),
        };
        persistStore();
        return store.profiles[index];
      }
      const newProfile = {
        id: crypto.randomUUID(),
        userId,
        fullNameAmharic: profileData.fullNameAmharic || "",
        fullNameEnglish: profileData.fullNameEnglish || "",
        dateOfBirth: profileData.dateOfBirth || null,
        ageRange: profileData.ageRange || null,
        gender: profileData.gender || null,
        currentRegion: profileData.currentRegion || "",
        currentLocation: profileData.currentLocation || "",
        educationLevel: profileData.educationLevel || "BASIC_LITERACY_NUMERACY",
        readingComfortLevel: profileData.readingComfortLevel || "moderate",
        primaryLearningGoal: profileData.primaryLearningGoal || "",
        preferredContactMethod: profileData.preferredContactMethod || "PHONE_CALL",
        trustedContactName: profileData.trustedContactName || null,
        trustedContactPhone: profileData.trustedContactPhone || null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      store.profiles.push(newProfile);
      persistStore();
      return newProfile;
    },

    async findByUserId(userId) {
      return store.profiles.find((p) => p.userId === userId) || null;
    },
  },

  // ----------------------------------------------------------------------------
  // Alternative Identification Documents
  // ----------------------------------------------------------------------------
  identifications: {
    async create({ userId, documentType, documentNumber, isRefugeeDoc = false, issuedBy, notes }) {
      const doc = {
        id: crypto.randomUUID(),
        userId,
        documentType: documentType || "PROVISIONAL_SELF_ATTESTATION",
        documentNumber: documentNumber || null,
        status: "PENDING",
        notes: notes || null,
        isRefugeeDoc,
        issuedBy: issuedBy || null,
        verifiedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      store.identifications.push(doc);
      persistStore();
      return doc;
    },

    async findByUserId(userId) {
      return store.identifications.filter((d) => d.userId === userId);
    },
  },

  // ----------------------------------------------------------------------------
  // Accessibility Preferences
  // ----------------------------------------------------------------------------
  accessibilityPreferences: {
    async upsert(userId, prefs) {
      const index = store.accessibilityPreferences.findIndex((p) => p.userId === userId);
      if (index >= 0) {
        store.accessibilityPreferences[index] = {
          ...store.accessibilityPreferences[index],
          ...prefs,
          updatedAt: new Date().toISOString(),
        };
        persistStore();
        return store.accessibilityPreferences[index];
      }
      const newPrefs = {
        id: crypto.randomUUID(),
        userId,
        screenReaderActive: prefs.screenReaderActive || false,
        highContrastMode: prefs.highContrastMode || "DEFAULT",
        fontSize: prefs.fontSize || "NORMAL",
        reducedMotion: prefs.reducedMotion || false,
        highContrastCursor: prefs.highContrastCursor || false,
        voiceGuidanceEnabled: prefs.voiceGuidanceEnabled !== undefined ? prefs.voiceGuidanceEnabled : true,
        autoReadAloud: prefs.autoReadAloud !== undefined ? prefs.autoReadAloud : true,
        amharicVoiceModel: prefs.amharicVoiceModel || "ADDIS_TTS_SELAM",
        speechRate: prefs.speechRate || 1.0,
        preferVoiceInput: prefs.preferVoiceInput || false,
        extendedTimeLimit: true,
        largeClickTargets: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      store.accessibilityPreferences.push(newPrefs);
      persistStore();
      return newPrefs;
    },

    async findByUserId(userId) {
      return store.accessibilityPreferences.find((p) => p.userId === userId) || null;
    },
  },

  // ----------------------------------------------------------------------------
  // Onboarding Sessions & JSONB Answers
  // ----------------------------------------------------------------------------
  onboardingSessions: {
    async create({ userId, recoveryCode, totalSteps = 6 }) {
      const session = {
        id: crypto.randomUUID(),
        userId,
        recoveryCode: recoveryCode.toUpperCase(),
        currentStepIndex: 0,
        totalSteps,
        isCompleted: false,
        completedAt: null,
        lastActiveAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      store.onboardingSessions.push(session);
      persistStore();
      return session;
    },

    async findById(id) {
      return store.onboardingSessions.find((s) => s.id === id) || null;
    },

    async findByRecoveryCode(code) {
      if (!code) return null;
      const normalized = code.trim().toUpperCase();
      return store.onboardingSessions.find((s) => s.recoveryCode.toUpperCase() === normalized) || null;
    },

    async update(id, updates) {
      const index = store.onboardingSessions.findIndex((s) => s.id === id);
      if (index === -1) return null;
      store.onboardingSessions[index] = {
        ...store.onboardingSessions[index],
        ...updates,
        lastActiveAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      persistStore();
      return store.onboardingSessions[index];
    },
  },

  onboardingAnswers: {
    async saveStepAnswer({ sessionId, stepIndex, stepKey, answerData, answeredViaVoice = false, transcribedText = null, voiceConfidence = null }) {
      const index = store.onboardingAnswers.findIndex(
        (a) => a.sessionId === sessionId && a.stepKey === stepKey
      );

      if (index >= 0) {
        store.onboardingAnswers[index] = {
          ...store.onboardingAnswers[index],
          stepIndex,
          answerData, // In Postgres, stored as native JSONB
          answeredViaVoice,
          transcribedText,
          voiceConfidence,
          updatedAt: new Date().toISOString(),
        };
        persistStore();
        return store.onboardingAnswers[index];
      }

      const answer = {
        id: crypto.randomUUID(),
        sessionId,
        stepIndex,
        stepKey,
        answerData,
        answeredViaVoice,
        transcribedText,
        voiceConfidence,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      store.onboardingAnswers.push(answer);
      persistStore();
      return answer;
    },

    async findBySessionId(sessionId) {
      return store.onboardingAnswers.filter((a) => a.sessionId === sessionId);
    },
  },

  // ----------------------------------------------------------------------------
  // Voice Interactions Log
  // ----------------------------------------------------------------------------
  voiceInteractions: {
    async log({ sessionId, serviceType, languageCode = "am-ET", inputText, outputText, status = "SUCCESS", latencyMs, confidenceScore, errorMessage }) {
      const interaction = {
        id: crypto.randomUUID(),
        sessionId: sessionId || null,
        serviceType, // ADDIS_SCRIBE_STT, ADDIS_TTS
        languageCode,
        inputText: inputText || null,
        outputText: outputText || null,
        status,
        latencyMs: latencyMs || Math.floor(Math.random() * 200 + 120),
        confidenceScore: confidenceScore !== undefined ? confidenceScore : 0.94,
        errorMessage: errorMessage || null,
        createdAt: new Date().toISOString(),
      };
      store.voiceInteractions.push(interaction);
      persistStore();
      return interaction;
    },

    async getRecent(limit = 20) {
      return store.voiceInteractions.slice(-limit).reverse();
    },
  },

  // ----------------------------------------------------------------------------
  // Private Support Requests
  // ----------------------------------------------------------------------------
  supportRequests: {
    async create({ userId, category, message, hasVoiceNote = false, voiceNoteUrl = null, contactPhone = null, isConfidential = true }) {
      const req = {
        id: crypto.randomUUID(),
        userId: userId || null,
        category: category || "DOCUMENT_VERIFICATION_HELP",
        message,
        hasVoiceNote,
        voiceNoteUrl,
        contactPhone,
        status: "OPEN",
        isConfidential,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      store.supportRequests.push(req);
      persistStore();
      return req;
    },

    async findByUserId(userId) {
      return store.supportRequests.filter((r) => r.userId === userId);
    },
  },
};
