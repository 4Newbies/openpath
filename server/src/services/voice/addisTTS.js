// ==============================================================================
// Addis Amharic Text-to-Speech (TTS) Service
// Connects to Addis Voices 2 API (https://api.addisassistant.com/api/v1/voice/generations)
// ==============================================================================

import crypto from "node:crypto";

export class AddisTTSService {
  constructor(config = {}) {
    this.configuredApiUrl = config.apiUrl;
    this.configuredApiKey = config.apiKey;
    this.configuredVoice = config.defaultVoice;
  }

  get apiUrl() {
    return this.configuredApiUrl || process.env.ADDIS_TTS_API_URL || "https://api.addisassistant.com/api/v1/voice/generations";
  }

  get apiKey() {
    return this.configuredApiKey || process.env.ADDIS_TTS_API_KEY || process.env.ADDIS_SCRIBE_API_KEY || "";
  }

  get defaultVoice() {
    return this.configuredVoice || process.env.ADDIS_TTS_DEFAULT_VOICE || "am-hamen";
  }

  /**
   * Normalize voice ID to match official Addis Voices catalog
   * Available Amharic voices: am-hamen (female default), am-simon (male calm), am-dawit, etc.
   */
  normalizeVoiceId(voiceId) {
    if (!voiceId) return this.defaultVoice;
    const lower = voiceId.toLowerCase();
    if (lower.includes("selam")) return "am-hamen"; // female
    if (lower.includes("dawit")) return "am-dawit";
    if (lower.includes("simon")) return "am-simon";
    if (lower.startsWith("am-")) return voiceId;
    return this.defaultVoice;
  }

  /**
   * Synthesize Amharic text into speech audio using Addis Voices API
   * @param {Object} options
   * @param {string} options.text - Amharic text to speak (e.g. "ሙሉ ስምዎን ያስገቡ")
   * @param {string} options.voice - Voice ID (e.g. "am-hamen")
   * @param {number} options.rate - Speaking rate
   * @returns {Promise<{audioDataUri: string|null, durationSecs: number, modelUsed: string, text: string, useBrowserSpeech?: boolean, fromAddisApi?: boolean, errorInfo?: string}>}
   */
  async synthesize({ text, voice = null, rate = 1.0 }) {
    if (!text || !text.trim()) {
      throw new Error("Text is required for Addis TTS synthesis");
    }

    const trimmedText = text.trim();
    const selectedVoice = this.normalizeVoiceId(voice);
    const startTime = Date.now();
    const apiKey = this.apiKey;
    const apiUrl = this.apiUrl;

    // 1. Call Official Addis Assistant Voice Generations API
    if (apiKey && apiKey !== "dev_key") {
      try {
        const clientRequestId = crypto.randomUUID();
        console.log(`[Addis TTS] Calling ${apiUrl} with voice: ${selectedVoice}`);

        const response = await fetch(apiUrl, {
          method: "POST",
          headers: {
            "x-api-key": apiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            client_request_id: clientRequestId,
            voice_id: selectedVoice,
            language: "am",
            text: trimmedText,
          }),
        });

        if (response.ok) {
          const contentType = response.headers.get("content-type") || "";
          if (contentType.includes("application/json")) {
            const data = await response.json();
            const audioUrl = data.audio_url || data.data?.audio_url || data.inline || data.data?.inline;
            if (audioUrl) {
              return {
                audioDataUri: audioUrl,
                durationSecs: data.seconds || data.data?.seconds || Math.max(1.5, trimmedText.length * 0.1),
                modelUsed: `Addis Voices 2 (${selectedVoice})`,
                latencyMs: Date.now() - startTime,
                text: trimmedText,
                fromAddisApi: true,
              };
            }
          } else {
            // Direct audio binary stream (MP3/WAV)
            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            const base64 = buffer.toString("base64");
            const mime = contentType.includes("mp3") || contentType.includes("mpeg") ? "audio/mp3" : "audio/wav";
            return {
              audioDataUri: `data:${mime};base64,${base64}`,
              audioBuffer: buffer,
              durationSecs: Math.max(1.5, trimmedText.length * 0.1),
              modelUsed: `Addis Voices 2 (${selectedVoice})`,
              latencyMs: Date.now() - startTime,
              text: trimmedText,
              fromAddisApi: true,
            };
          }
        } else {
          const errBody = await response.text().catch(() => "");
          if (response.status === 402) {
            console.warn(`[Addis TTS] Note: Addis account credit balance is insufficient (HTTP 402). Auto-switching to natural browser speech.`);
          } else {
            console.warn(`[Addis TTS] API returned HTTP ${response.status}: ${errBody}`);
          }
        }
      } catch (err) {
        console.warn("[Addis TTS] Live API call failed:", err.message);
      }
    }

    // 2. Resilient Human Speech Fallback:
    // Inform the client to use browser speech synthesis with spoken words, NEVER a noise tone!
    return {
      audioDataUri: null,
      useBrowserSpeech: true,
      durationSecs: Math.max(1.5, trimmedText.length * 0.08),
      modelUsed: `Addis Voice Engine (${selectedVoice})`,
      latencyMs: Date.now() - startTime,
      text: trimmedText,
    };
  }
}

export const addisTTS = new AddisTTSService();
