// ==============================================================================
// Addis Scribe Amharic Speech-to-Text (STT) Service
// Official API: https://api.addisassistant.com/api/v1/scribe/transcribe
// ==============================================================================

import crypto from "node:crypto";

export class AddisScribeSTTService {
  constructor(config = {}) {
    this.configuredApiUrl = config.apiUrl;
    this.configuredApiKey = config.apiKey;
    this.modelName = "Addis Scribe Streaming (Turbo)";
  }

  get apiUrl() {
    return this.configuredApiUrl || process.env.ADDIS_SCRIBE_API_URL || "https://api.addisassistant.com/api/v1/scribe/transcribe";
  }

  get apiKey() {
    return this.configuredApiKey || process.env.ADDIS_SCRIBE_API_KEY || "";
  }

  /**
   * Transcribe Amharic speech audio into written Amharic text
   * @param {Object} options
   * @param {Buffer} options.audioBuffer - Raw audio buffer
   * @param {string} options.audioFormat - e.g. "audio/webm", "audio/wav"
   * @param {string} options.contextHint - Field context
   * @returns {Promise<{text: string, confidence: number, language: string, model: string, durationSecs: number, latencyMs: number, fromAddisApi?: boolean, useBrowserFallback?: boolean}>}
   */
  async transcribeAudio({ audioBuffer, audioFormat = "audio/webm", contextHint = "general" }) {
    const startTime = Date.now();
    const apiKey = this.apiKey;
    const apiUrl = this.apiUrl;

    // 1. Call Official Addis Scribe API with User's Audio
    if (apiKey && apiKey !== "dev_key" && audioBuffer && audioBuffer.length > 0) {
      try {
        const requestId = crypto.randomUUID();
        const extension = audioFormat.includes("wav") ? "wav" : audioFormat.includes("mp3") ? "mp3" : "webm";
        const mimeType = audioFormat || (extension === "wav" ? "audio/wav" : "audio/webm");

        console.log(`[Addis Scribe STT] Uploading audio (${audioBuffer.length} bytes, format: ${mimeType}) to ${apiUrl}`);

        const formData = new FormData();
        const audioFile = new File([audioBuffer], `recording.${extension}`, { type: mimeType });
        formData.append("audio", audioFile);
        formData.append("request_id", requestId);

        // Addis Scribe requires query parameters backend=turbo and request_id
        const separator = apiUrl.includes("?") ? "&" : "?";
        const url = `${apiUrl}${separator}backend=turbo&request_id=${requestId}`;

        const response = await fetch(url, {
          method: "POST",
          headers: {
            "x-api-key": apiKey,
          },
          body: formData,
        });

        if (response.ok) {
          const result = await response.json();
          const transcript = result.data?.text || result.text || "";
          console.log(`[Addis Scribe STT] Response 200 OK: "${transcript}" (computed in ${result.data?.compute_ms || 0}ms)`);

          return {
            text: transcript.trim(),
            confidence: transcript.trim().length > 0 ? 0.95 : 0.0,
            language: "am",
            model: result.data?.model || "Addis Scribe Streaming Turbo",
            durationSecs: result.data?.seconds || 1.0,
            latencyMs: Date.now() - startTime,
            fromAddisApi: true,
          };
        } else {
          const errText = await response.text().catch(() => "");
          console.warn(`[Addis Scribe STT] API returned HTTP ${response.status}: ${errText}`);
        }
      } catch (err) {
        console.warn("[Addis Scribe STT] Live API call failed:", err.message);
      }
    }

    // 2. Clean fallback when audio is empty or API call is unconfigured/fails
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
