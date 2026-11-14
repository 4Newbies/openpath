// ==============================================================================
// Voice Context - Addis Speech Recognition & Synthesis Hub
// Powers Addis Scribe STT and Addis TTS (with Native Human Speech Fallback)
// ==============================================================================

import React, { createContext, useContext, useState, useRef, useCallback, useEffect } from "react";
import { api } from "../services/api";
import { useAccessibility } from "./AccessibilityContext";

const VoiceContext = createContext(null);

export function VoiceProvider({ children }) {
  const { announce, voiceModel, speechRate, language } = useAccessibility();

  // TTS State
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [currentPlayingText, setCurrentPlayingText] = useState("");
  const audioPlayerRef = useRef(null);

  // STT State (Addis Scribe + Web Speech Recognition)
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessingSTT, setIsProcessingSTT] = useState(false);
  const [activeVoiceField, setActiveVoiceField] = useState(null);
  const [lastTranscript, setLastTranscript] = useState("");
  const [liveInterimText, setLiveInterimText] = useState("");

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recognitionRef = useRef(null);
  const liveTranscriptRef = useRef("");
  const onCompleteCallbackRef = useRef(null);

  // Stop any ongoing speech or audio
  const stopAudio = useCallback(() => {
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current = null;
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setIsPlayingAudio(false);
    setCurrentPlayingText("");
  }, []);

  /**
   * Browser SpeechSynthesis (Natural Human Voice - NEVER sine-wave noise)
   */
  const playHumanSpeech = useCallback(
    (text, lang = "am") => {
      if (typeof window === "undefined" || !("speechSynthesis" in window)) {
        setIsPlayingAudio(false);
        return;
      }

      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = speechRate || 1.0;
      utterance.lang = lang === "am" ? "am-ET" : "en-US";

      // Select matching voice if available
      const voices = window.speechSynthesis.getVoices();
      const matchingVoice =
        voices.find((v) => v.lang.startsWith(lang === "am" ? "am" : "en")) ||
        voices.find((v) => v.lang.includes(lang === "am" ? "ET" : "US")) ||
        voices[0];

      if (matchingVoice) {
        utterance.voice = matchingVoice;
      }

      utterance.onstart = () => {
        setIsPlayingAudio(true);
        setCurrentPlayingText(text);
      };

      utterance.onend = () => {
        setIsPlayingAudio(false);
        setCurrentPlayingText("");
      };

      utterance.onerror = (e) => {
        console.warn("[VoiceContext] SpeechSynthesis error:", e);
        setIsPlayingAudio(false);
        setCurrentPlayingText("");
      };

      window.speechSynthesis.speak(utterance);
    },
    [speechRate]
  );

  /**
   * Speak text using Addis TTS (or natural human speech synthesis)
   */
  const speakText = useCallback(
    async (text, customVoice = null) => {
      if (!text || !text.trim()) return;

      stopAudio();
      setIsPlayingAudio(true);
      setCurrentPlayingText(text);
      announce(language === "am" ? `የሚነበብ፡ ${text}` : `Reading aloud: ${text}`);

      try {
        const response = await api.textToSpeech({
          text,
          voice: customVoice || voiceModel || "am-hamen",
          rate: speechRate,
        });

        // If Addis API returned a real audio URL or base64 stream
        if (response.success && response.data?.audioDataUri) {
          const audio = new Audio(response.data.audioDataUri);
          audioPlayerRef.current = audio;
          audio.playbackRate = speechRate || 1.0;

          audio.onended = () => {
            setIsPlayingAudio(false);
            setCurrentPlayingText("");
          };

          audio.onerror = (e) => {
            console.warn("[VoiceContext] Addis audio URL playback failed, switching to natural human voice:", e);
            playHumanSpeech(text, language);
          };

          await audio.play();
        } else {
          // Speak with natural human voice (NEVER a beep/sine wave)
          playHumanSpeech(text, language);
        }
      } catch (err) {
        console.warn("[VoiceContext] Addis TTS request failed, speaking via human voice:", err);
        playHumanSpeech(text, language);
      }
    },
    [voiceModel, speechRate, language, announce, stopAudio, playHumanSpeech]
  );

  /**
   * Start recording user speech via Addis Scribe + Browser Live Speech Recognition
   */
  const startRecording = useCallback(
    async (fieldName, contextHint = "general", onTranscriptionComplete) => {
      stopAudio();
      setActiveVoiceField(fieldName);
      audioChunksRef.current = [];
      liveTranscriptRef.current = "";
      setLiveInterimText("");
      onCompleteCallbackRef.current = onTranscriptionComplete;

      // 1. Initialize Browser Real-Time Speech Recognition
      const SpeechRecognition =
        typeof window !== "undefined"
          ? window.SpeechRecognition || window.webkitSpeechRecognition
          : null;

      if (SpeechRecognition) {
        try {
          const recognition = new SpeechRecognition();
          recognition.lang = language === "am" ? "am-ET" : "en-US";
          recognition.continuous = true;
          recognition.interimResults = true;

          recognition.onresult = (event) => {
            let fullText = "";
            for (let i = 0; i < event.results.length; i++) {
              fullText += event.results[i][0].transcript;
            }
            const cleanText = fullText.trim();
            if (cleanText) {
              liveTranscriptRef.current = cleanText;
              setLiveInterimText(cleanText);
            }
          };

          recognition.onerror = (err) => {
            console.warn("[VoiceContext] Browser speech recognition event:", err.error);
          };

          recognition.start();
          recognitionRef.current = recognition;
        } catch (e) {
          console.warn("[VoiceContext] Speech recognition init:", e.message);
        }
      }

      // 2. Initialize MediaStream Recording (for Addis Scribe API upload)
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;

        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            audioChunksRef.current.push(event.data);
          }
        };

        mediaRecorder.onstop = async () => {
          setIsProcessingSTT(true);
          announce(
            language === "am"
              ? "አዲስ ስክራይብ ድምፅዎን እያስተረጎመ ነው..."
              : "Addis Scribe is transcribing your speech..."
          );

          const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
          const reader = new FileReader();

          reader.onloadend = async () => {
            const base64Audio = reader.result;
            let finalTranscript = liveTranscriptRef.current || "";

            try {
              // Call Addis Scribe STT API
              const res = await api.speechToText({
                audioData: base64Audio,
                audioFormat: "audio/webm",
                contextHint,
              });

              if (res.success && res.data?.transcribedText) {
                finalTranscript = res.data.transcribedText.trim();
              }
            } catch (err) {
              console.warn("[VoiceContext] Addis Scribe STT API error:", err);
            } finally {
              setIsProcessingSTT(false);
              setIsRecording(false);
              setActiveVoiceField(null);
              setLiveInterimText("");

              // Apply the user's REAL spoken words
              if (finalTranscript) {
                setLastTranscript(finalTranscript);
                announce(
                  language === "am"
                    ? `የተመዘገበ ቃል፡ ${finalTranscript}`
                    : `Recorded speech: ${finalTranscript}`
                );
                if (onCompleteCallbackRef.current) {
                  onCompleteCallbackRef.current(finalTranscript);
                }
              } else {
                announce(
                  language === "am"
                    ? "ምንም ድምፅ አልተሰማም። እባክዎ እንደገና ይናገሩ።"
                    : "No speech heard. Please speak clearly into your microphone.",
                  true
                );
              }
            }
          };

          reader.readAsDataURL(audioBlob);

          // Stop mic tracks
          stream.getTracks().forEach((track) => track.stop());
        };

        mediaRecorder.start();
        setIsRecording(true);
        announce(
          language === "am"
            ? "ድምፅ መቅረጫ ተከፍቷል። አሁን አማርኛ ይናገሩ..."
            : "Microphone active. Speak your answer now..."
        );
      } catch (err) {
        console.warn("[VoiceContext] Microphone access error:", err);
        setIsRecording(false);
        announce(
          language === "am"
            ? "ማይክራፎን ማግኘት አልተቻለም። እባክዎ ፈቃድ ይስጡ ወይም በጽሑፍ ያስገቡ።"
            : "Could not access microphone. Please grant microphone permission.",
          true
        );
      }
    },
    [stopAudio, language, announce]
  );

  /**
   * Stop recording
   */
  const stopRecording = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {
        // ignore
      }
      recognitionRef.current = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  }, []);

  return (
    <VoiceContext.Provider
      value={{
        isPlayingAudio,
        currentPlayingText,
        isRecording,
        isProcessingSTT,
        activeVoiceField,
        lastTranscript,
        liveInterimText,
        speakText,
        stopAudio,
        startRecording,
        stopRecording,
      }}
    >
      {children}
    </VoiceContext.Provider>
  );
}

export function useVoice() {
  const context = useContext(VoiceContext);
  if (!context) {
    throw new Error("useVoice must be used within a VoiceProvider");
  }
  return context;
}
