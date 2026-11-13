// ==============================================================================
// OpenPath Frontend API Client
// Connects to Express backend for Auth, Onboarding, Voice STT/TTS, and Support
// ==============================================================================

const API_BASE = "http://localhost:5000/api";

export const api = {
  // ----------------------------------------------------------------------------
  // Authentication & Session
  // ----------------------------------------------------------------------------
  async startSession(primaryLanguage = "AMHARIC", isRefugee = false) {
    const res = await fetch(`${API_BASE}/auth/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ primaryLanguage, isRefugeeStatus: isRefugee }),
    });
    return res.json();
  },

  async resumeSession(recoveryCode) {
    const res = await fetch(`${API_BASE}/auth/resume`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recoveryCode }),
    });
    return res.json();
  },

  async getSessionStatus(sessionId) {
    const res = await fetch(`${API_BASE}/auth/session/${sessionId}`);
    return res.json();
  },

  // ----------------------------------------------------------------------------
  // Onboarding Steps & Answers
  // ----------------------------------------------------------------------------
  async getSteps() {
    const res = await fetch(`${API_BASE}/onboarding/steps`);
    return res.json();
  },

  async saveStepAnswer(payload) {
    const res = await fetch(`${API_BASE}/onboarding/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return res.json();
  },

  async saveProgress(sessionId) {
    const res = await fetch(`${API_BASE}/onboarding/save-progress`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
    });
    return res.json();
  },

  async completeOnboarding(sessionId) {
    const res = await fetch(`${API_BASE}/onboarding/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
    });
    return res.json();
  },

  // ----------------------------------------------------------------------------
  // Amharic Voice Engine: Addis Scribe STT & Azure Ameha / MMS-TTS
  // ----------------------------------------------------------------------------
  async speechToText({ audioData, audioFormat = "audio/webm", contextHint = "general", sessionId }) {
    const res = await fetch(`${API_BASE}/voice/stt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ audioData, audioFormat, contextHint, sessionId }),
    });
    return res.json();
  },

  async textToSpeech({ text, voiceModel = "AZURE_AMEHA", rate = 1.0, sessionId }) {
    const res = await fetch(`${API_BASE}/voice/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voiceModel, rate, sessionId }),
    });
    return res.json();
  },

  async getVoicePrompts() {
    const res = await fetch(`${API_BASE}/voice/prompts`);
    return res.json();
  },

  async getVoiceLogs() {
    const res = await fetch(`${API_BASE}/voice/logs`);
    return res.json();
  },

  // ----------------------------------------------------------------------------
  // Accessibility Preferences
  // ----------------------------------------------------------------------------
  async getPreferences(userId) {
    const res = await fetch(`${API_BASE}/accessibility/${userId}`);
    return res.json();
  },

  async updatePreferences(userId, preferences) {
    const res = await fetch(`${API_BASE}/accessibility/${userId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(preferences),
    });
    return res.json();
  },

  // ----------------------------------------------------------------------------
  // Support Requests
  // ----------------------------------------------------------------------------
  async submitSupportRequest(payload) {
    const res = await fetch(`${API_BASE}/support/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return res.json();
  },
};
