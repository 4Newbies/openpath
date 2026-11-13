// ==============================================================================
// Save Progress Modal - Recovery Code with Voice Readback
// ==============================================================================

import React, { useState } from "react";
import { useAccessibility } from "../../context/AccessibilityContext";
import { useOnboarding } from "../../context/OnboardingContext";
import { useVoice } from "../../context/VoiceContext";
import { Button } from "../ui/button";
import { Save, Volume2, Copy, Check, X, ShieldCheck } from "lucide-react";

export function SaveProgressModal() {
  const { language, announce } = useAccessibility();
  const { isSaveModalOpen, setIsSaveModalOpen, recoveryCode, currentStepIndex } = useOnboarding();
  const { speakText, isPlayingAudio, stopAudio } = useVoice();
  const [copied, setCopied] = useState(false);

  if (!isSaveModalOpen) return null;

  const spokenCodeAmharic = `
    የማስመለሻ ኮድዎ፡ ${recoveryCode.split("").join(" ")} ነው። 
    ይህንን ኮድ በመያዝ በማንኛውም ጊዜ ያቆሙበት ደረጃ ላይ ተመልሰው መቀጠል ይችላሉ።
  `.trim();

  const handleReadCode = () => {
    if (isPlayingAudio) {
      stopAudio();
    } else {
      speakText(spokenCodeAmharic);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(recoveryCode);
    setCopied(true);
    announce(language === "am" ? "ኮዱ ተቀድቷል" : "Recovery code copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="save-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
    >
      <div className="w-full max-w-md p-6 rounded-2xl border-2 border-primary bg-surface shadow-2xl space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b border-border">
          <div className="flex items-center gap-2 text-primary font-bold">
            <Save className="size-5" />
            <h3 id="save-modal-title" className="text-base font-bold text-foreground">
              {language === "am" ? "የምዝገባ እድገት ተቀምጧል" : "Progress Successfully Saved"}
            </h3>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsSaveModalOpen(false)}
            aria-label="ዝጋ"
          >
            <X className="size-4" />
          </Button>
        </div>

        {/* Message */}
        <p className="text-xs text-muted-foreground">
          {language === "am"
            ? "እስካሁን የሞሏቸው ምላሾች በሙሉ በሚገባ ተቀምጠዋል። ይህንን 6-አሃዝ የማስመለሻ ኮድ በመጠቀም በማንኛውም ጊዜ መቀጠል ይችላሉ፡"
            : "All your answers have been safely stored. Use this memorable 6-character code anytime to resume your registration:"}
        </p>

        {/* Recovery Code Display Card */}
        <div className="p-4 rounded-xl border-2 border-primary/40 bg-primary/10 text-center space-y-2">
          <div className="text-xs text-muted-foreground uppercase font-bold tracking-wider">
            {language === "am" ? "የእርስዎ የማስመለሻ ኮድ" : "Your Recovery Code"}
          </div>
          <div className="text-3xl font-black font-mono tracking-widest text-primary">
            {recoveryCode}
          </div>
          <div className="text-[11px] text-muted-foreground">
            {language === "am" ? `ደረጃ ${currentStepIndex + 1} ላይ ተቀምጧል` : `Saved at Step ${currentStepIndex + 1}`}
          </div>
        </div>

        {/* Voice Readout and Copy Buttons */}
        <div className="grid grid-cols-2 gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={handleReadCode}
            className="flex items-center justify-center gap-1.5 text-xs font-bold"
          >
            <Volume2 className="size-4 text-primary" />
            <span>
              {isPlayingAudio
                ? language === "am" ? "አቁም" : "Stop"
                : language === "am" ? "ኮዱን አዳምጥ" : "Listen to Code"}
            </span>
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={handleCopy}
            className="flex items-center justify-center gap-1.5 text-xs font-bold"
          >
            {copied ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}
            <span>{copied ? (language === "am" ? "ተቀድቷል!" : "Copied!") : (language === "am" ? "ኮዱን ቅዳ" : "Copy Code")}</span>
          </Button>
        </div>

        {/* Close Button */}
        <div className="pt-2">
          <Button
            type="button"
            className="w-full font-bold"
            onClick={() => setIsSaveModalOpen(false)}
          >
            {language === "am" ? "ገባኝ፣ አመሰግናለሁ" : "Got It, Continue"}
          </Button>
        </div>
      </div>
    </div>
  );
}
