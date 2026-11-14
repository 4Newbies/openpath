// ==============================================================================
// Addis Amharic Text-to-Speech (TTS) Service
// Connects to Addis Voices 2 API (https://api.addisassistant.com/api/v1/voice/generations)
// ==============================================================================

export class AddisTTSService {
  constructor(config = {}) {
    this.apiUrl = config.apiUrl || process.env.ADDIS_TTS_API_URL || "https://api.addisassistant.com/api/v1/voice/generations";
    this.apiKey = config.apiKey || process.env.ADDIS_TTS_API_KEY || process.env.ADDIS_SCRIBE_API_KEY || "";
    this.defaultVoice = config.defaultVoice || process.env.ADDIS_TTS_DEFAULT_VOICE || "am-hamen";
  }

  /**
   * Synthesize Amharic text into speech audio using Addis Voices API
   * @param {Object} options
   * @param {string} options.text - Amharic text to speak (e.g. "ሙሉ ስምዎን ያስገቡ")
   * @param {string} options.voice - Voice ID (e.g. "am-hamen")
   * @param {number} options.rate - Speaking rate
   * @returns {Promise<{audioDataUri: string|null, durationSecs: number, modelUsed: string, text: string, useBrowserSpeech?: boolean}>}
   */
  async synthesize({ text, voice = null, rate = 1.0 }) {
    if (!text || !text.trim()) {
      throw new Error("Text is required for Addis TTS synthesis");
    }

    const trimmedText = text.trim();
    const selectedVoice = voice || this.defaultVoice || "am-hamen";
    const startTime = Date.now();

    // 1. Call Official Addis Assistant Voice Generations API
    if (this.apiKey && this.apiKey !== "dev_key") {
      try {
        console.log(`[Addis TTS] Calling ${this.apiUrl} with voice: ${selectedVoice}`);
        const response = await fetch(this.apiUrl, {
          method: "POST",
          headers: {
            "x-api-key": this.apiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
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
          console.warn(`[Addis TTS] API returned ${response.status}: ${errBody}`);
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
