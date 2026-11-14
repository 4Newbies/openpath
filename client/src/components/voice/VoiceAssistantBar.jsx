// ==============================================================================
// Voice Assistant Bar - Amharic Speech Recognition & Synthesis Component
// ==============================================================================

import React, { useEffect } from "react";
import { useAccessibility } from "../../context/AccessibilityContext";
import { useVoice } from "../../context/VoiceContext";
import { Button } from "../ui/button";
import { Volume2, VolumeX, Mic, MicOff, Sparkles, Loader2 } from "lucide-react";

export function VoiceAssistantBar({
  questionTitle,
  questionPrompt,
  onVoiceInputCaptured,
  activeFieldHint = "general",
}) {
  const { language, voiceModel } = useAccessibility();
  const {
    isPlayingAudio,
    speakText,
    stopAudio,
    isRecording,
    isProcessingSTT,
    startRecording,
    stopRecording,
    liveInterimText,
  } = useVoice();

  // Full question text to speak
  const fullTextToRead = `${questionTitle}። ${questionPrompt}`;

  // Keyboard shortcuts Alt+R (Read) and Alt+V (Voice input)
  useEffect(() => {
    const handleVoiceShortcuts = (e) => {
      if (e.altKey && e.key.toLowerCase() === "r") {
        e.preventDefault();
        if (isPlayingAudio) {
          stopAudio();
        } else {
          speakText(fullTextToRead);
        }
      }
      if (e.altKey && e.key.toLowerCase() === "v") {
        e.preventDefault();
        if (isRecording) {
          stopRecording();
        } else {
          startRecording("active_question", activeFieldHint, onVoiceInputCaptured);
        }
      }
    };

    window.addEventListener("keydown", handleVoiceShortcuts);
    return () => window.removeEventListener("keydown", handleVoiceShortcuts);
  }, [
    isPlayingAudio,
    isRecording,
    fullTextToRead,
    activeFieldHint,
    onVoiceInputCaptured,
    speakText,
    stopAudio,
    startRecording,
    stopRecording,
  ]);

  return (
    <div
      role="region"
      aria-label={language === "am" ? "የድምፅ እገዛ መቆጣጠሪያ" : "Voice Assistance Controls"}
      className="p-3 sm:p-4 rounded-xl border-2 border-primary/30 bg-primary/5 flex flex-col gap-2 my-4 transition-all"
    >
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 w-full">
        {/* Voice Read Aloud Button */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Button
            type="button"
            variant={isPlayingAudio ? "destructive" : "default"}
            onClick={() => {
              if (isPlayingAudio) {
                stopAudio();
              } else {
                speakText(fullTextToRead);
              }
            }}
            className="flex-1 sm:flex-initial h-10 px-4 font-bold flex items-center justify-center gap-2 shadow-sm"
            aria-label={
              isPlayingAudio
                ? language === "am"
                  ? "የድምፅ ንባብ አቁም (Alt+R)"
                  : "Stop audio read-aloud (Alt+R)"
                : language === "am"
                  ? "ጥያቄውን በድምፅ ያዳምጡ (Alt+R)"
                  : "Listen to question aloud (Alt+R)"
            }
          >
            {isPlayingAudio ? (
              <>
                <VolumeX className="size-5 animate-pulse" />
                <span>{language === "am" ? "ድምፁን አቁም" : "Stop Audio"}</span>
              </>
            ) : (
              <>
                <Volume2 className="size-5" />
                <span>{language === "am" ? "ጥያቄውን ያዳምጡ" : "Listen to Question"}</span>
              </>
            )}
          </Button>

          {/* Engine Badge */}
          <span className="text-[11px] font-semibold text-muted-foreground hidden md:inline-flex items-center gap-1 px-2 py-1 rounded bg-surface border border-border">
            <Sparkles className="size-3 text-primary" />
            Addis TTS
          </span>
        </div>

        {/* Voice Dictation (Addis Scribe STT) */}
        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          {isProcessingSTT && (
            <div className="flex items-center gap-1.5 text-xs font-semibold text-primary animate-pulse">
              <Loader2 className="size-4 animate-spin" />
              <span>
                {language === "am" ? "አዲስ ስክራይብ እያስተረጎመ ነው..." : "Addis Scribe transcribing..."}
              </span>
            </div>
          )}

          <Button
            type="button"
            variant={isRecording ? "destructive" : "secondary"}
            onClick={() => {
              if (isRecording) {
                stopRecording();
              } else {
                startRecording("active_question", activeFieldHint, onVoiceInputCaptured);
              }
            }}
            disabled={isProcessingSTT}
            className={`flex-1 sm:flex-initial h-10 px-4 font-bold flex items-center justify-center gap-2 border-2 ${
              isRecording
                ? "border-destructive animate-pulse bg-destructive text-destructive-foreground"
                : "border-primary/40 hover:border-primary"
            }`}
            aria-label={
              isRecording
                ? language === "am"
                  ? "መቅረጽ አቁም (Alt+V)"
                  : "Stop voice recording (Alt+V)"
                : language === "am"
                  ? "በአማርኛ ድምፅ ይመልሱ (Alt+V)"
                  : "Answer question by voice (Alt+V)"
            }
          >
            {isRecording ? (
              <>
                <MicOff className="size-5" />
                <span>{language === "am" ? "መቅረጽ አቁም" : "Stop Recording"}</span>
              </>
            ) : (
              <>
                <Mic className="size-5 text-primary" />
                <span>{language === "am" ? "በድምፅ ይመልሱ" : "Answer by Voice"}</span>
              </>
            )}
          </Button>

          <span className="text-[11px] font-semibold text-muted-foreground hidden lg:inline-flex items-center gap-1 px-2 py-1 rounded bg-surface border border-border">
            Addis Scribe STT
          </span>
        </div>
      </div>

      {/* Live speech feedback while speaking */}
      {isRecording && (
        <div className="w-full mt-1 px-3 py-2 rounded-lg bg-surface border border-destructive/40 flex items-center gap-2 text-xs animate-in fade-in duration-150">
          <span className="size-2 rounded-full bg-destructive animate-ping shrink-0" />
          <span className="font-bold text-destructive shrink-0">
            {language === "am" ? "እያዳመጠ ነው፡" : "Listening:"}
          </span>
          <span className="font-medium text-foreground italic truncate">
            {liveInterimText
              ? `"${liveInterimText}"`
              : language === "am"
                ? "አሁን በማይክራፎንዎ ይናገሩ..."
                : "Speak into your microphone now..."}
          </span>
        </div>
      )}
    </div>
  );
}
