// ==============================================================================
// Resume Modal - Restore Onboarding Session by Code
// ==============================================================================

import React, { useState } from "react";
import { useAccessibility } from "../../context/AccessibilityContext";
import { useOnboarding } from "../../context/OnboardingContext";
import { useVoice } from "../../context/VoiceContext";
import { Button } from "../ui/button";
import { FolderOpen, X, ArrowRight, Loader2, Mic } from "lucide-react";

export function ResumeModal() {
  const { language, announce } = useAccessibility();
  const { isResumeModalOpen, setIsResumeModalOpen, resumeWithRecoveryCode, isLoading } = useOnboarding();
  const { startRecording, isRecording, isProcessingSTT } = useVoice();
  const [code, setCode] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  if (!isResumeModalOpen) return null;

  const handleVoiceCode = () => {
    startRecording("resume_code", "general", (text) => {
      // Clean up text
      const clean = text.replace(/[^A-Za-z0-9-]/g, "").toUpperCase();
      setCode(clean);
      announce(`የገባው ኮድ፡ ${clean}`);
    });
  };

  const handleResume = async (e) => {
    e.preventDefault();
    if (!code.trim()) {
      setErrorMessage(language === "am" ? "እባክዎ የማስመለሻ ኮድ ያስገቡ" : "Please enter recovery code");
      return;
    }

    setErrorMessage("");
    const result = await resumeWithRecoveryCode(code.trim());
    if (!result.success) {
      setErrorMessage(result.error || (language === "am" ? "ኮዱ አልተገኘም" : "Code not found"));
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="resume-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
    >
      <div className="w-full max-w-md p-6 rounded-2xl border-2 border-primary bg-surface shadow-2xl space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b border-border">
          <div className="flex items-center gap-2 text-primary font-bold">
            <FolderOpen className="size-5" />
            <h3 id="resume-modal-title" className="text-base font-bold text-foreground">
              {language === "am" ? "የቀድሞ ምዝገባን ቀጥል" : "Resume Registration"}
            </h3>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsResumeModalOpen(false)}
            aria-label="ዝጋ"
          >
            <X className="size-4" />
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          {language === "am"
            ? "ቀደም ሲል የተሰጠዎትን 6-አሃዝ የማስመለሻ ኮድ (ምሳሌ፡ OP-84A2) እዚህ ያስገቡ ወይም በድምፅ ይናገሩ፡"
            : "Enter your 6-character recovery code (e.g. OP-84A2) or dictate it by voice:"}
        </p>

        <form onSubmit={handleResume} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="recoveryCodeInput" className="block text-xs font-bold text-foreground">
              {language === "am" ? "የማስመለሻ ኮድ (Recovery Code) *" : "Recovery Code *"}
            </label>
            <div className="flex gap-2">
              <input
                id="recoveryCodeInput"
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="OP-XXXX"
                className="flex-1 h-12 px-3.5 rounded-lg border-2 border-input bg-background font-mono text-center text-lg font-bold tracking-widest focus:ring-2 focus:ring-primary focus:outline-none"
                autoFocus
              />
              <Button
                type="button"
                variant="outline"
                onClick={handleVoiceCode}
                disabled={isRecording || isProcessingSTT}
                className="h-12 px-3"
                title="Dictate code by voice"
                aria-label="ኮዱን በድምፅ ይናገሩ"
              >
                <Mic className="size-4 text-primary" />
              </Button>
            </div>
            {errorMessage && (
              <p role="alert" className="text-xs text-destructive font-semibold">
                {errorMessage}
              </p>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsResumeModalOpen(false)}
            >
              {language === "am" ? "ሰርዝ" : "Cancel"}
            </Button>

            <Button
              type="submit"
              disabled={isLoading || !code.trim()}
              className="font-bold flex items-center gap-1.5"
            >
              {isLoading ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  <span>{language === "am" ? "በመፈለግ ላይ..." : "Loading..."}</span>
                </>
              ) : (
                <>
                  <span>{language === "am" ? "ክፍለ ጊዜውን ቀጥል" : "Resume Session"}</span>
                  <ArrowRight className="size-4" />
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
