// ==============================================================================
// Addis Scribe Amharic Speech-to-Text (STT) Service
// Official API: https://api.addisassistant.com/api/v1/scribe/transcribe
// ==============================================================================

export class AddisScribeSTTService {
  constructor(config = {}) {
    this.apiUrl = config.apiUrl || process.env.ADDIS_SCRIBE_API_URL || "https://api.addisassistant.com/api/v1/scribe/transcribe";
    this.apiKey = config.apiKey || process.env.ADDIS_SCRIBE_API_KEY || "";
    this.modelName = "Addis-Scribe-v2";
  }

  /**
   * Transcribe Amharic speech audio into written Amharic text
   * @param {Object} options
   * @param {Buffer} options.audioBuffer - Raw audio buffer
   * @param {string} options.audioFormat - e.g. "audio/webm", "audio/wav"
   * @param {string} options.contextHint - Field context
   * @returns {Promise<{text: string, confidence: number, language: string, model: string, durationSecs: number, latencyMs: number}>}
   */
  async transcribeAudio({ audioBuffer, audioFormat = "audio/webm", contextHint = "general" }) {
    const startTime = Date.now();

    // 1. Call Official Addis Scribe API with User's Audio
    if (this.apiKey && this.apiKey !== "dev_key" && audioBuffer && audioBuffer.length > 0) {
      try {
        console.log(`[Addis Scribe STT] Uploading audio (${audioBuffer.length} bytes) to ${this.apiUrl}`);
        
        const formData = new FormData();
        const extension = audioFormat.includes("wav") ? "wav" : audioFormat.includes("mp3") ? "mp3" : "webm";
        const audioBlob = new Blob([audioBuffer], { type: audioFormat });
        formData.append("audio", audioBlob, `recording.${extension}`);

        const url = this.apiUrl.includes("?") ? this.apiUrl : `${this.apiUrl}?backend=turbo`;
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "x-api-key": this.apiKey,
          },
          body: formData,
        });

        if (response.ok) {
          const result = await response.json();
          const transcript = result.data?.text || result.text || "";
          if (transcript) {
            console.log(`[Addis Scribe STT] Success: "${transcript}"`);
            return {
              text: transcript.trim(),
              confidence: 0.96,
              language: "am",
              model: "Addis Scribe Turbo",
              durationSecs: result.data?.seconds || 2.5,
              latencyMs: Date.now() - startTime,
              fromAddisApi: true,
            };
          }
        } else {
          const errText = await response.text().catch(() => "");
          console.warn(`[Addis Scribe STT] API returned HTTP ${response.status}: ${errText}`);
        }
      } catch (err) {
        console.warn("[Addis Scribe STT] Live API call failed:", err.message);
      }
    }

    // 2. Return clean empty result if API returned nothing (NO FAKE HARDCODED DATA)
    return {
      text: "",
      confidence: 0.0,
      language: "am",
      model: "Addis Scribe Voice Engine",
      durationSecs: 0,
      latencyMs: Date.now() - startTime,
      useBrowserFallback: true,
    };
  }

  /**
   * Normalize Ge'ez script orthographic variants
   */
  normalizeAmharicText(text) {
    if (!text) return "";
    return text
      .replace(/[ሐኀ]/g, "ሀ")
      .replace(/[ሠ]/g, "ሰ")
      .replace(/[ዐ]/g, "አ")
      .replace(/[ፀ]/g, "ጸ")
      .trim();
  }
}

export const addisScribeSTT = new AddisScribeSTTService();
