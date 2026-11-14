// ==============================================================================
// Accessibility Preference Drawer / Settings Bar
// WCAG 2.2 AA Controls: High Contrast, Font Resizing, Amharic Voice Engine
// ==============================================================================

import React from "react";
import {
  useAccessibility,
  CONTRAST_MODES,
  FONT_SIZES,
} from "../../context/AccessibilityContext";
import { Button } from "../ui/button";
import { Eye, Type, Volume2, Mic, X, Check, Gauge } from "lucide-react";

export function AccessibilityBar({ isOpen, onClose }) {
  const {
    language,
    contrastMode,
    setContrastMode,
    fontSize,
    setFontSize,
    autoReadAloud,
    setAutoReadAloud,
    speechRate,
    setSpeechRate,
    voiceModel,
    setVoiceModel,
    screenReaderMode,
    setScreenReaderMode,
    announce,
  } = useAccessibility();

  if (!isOpen) return null;

  return (
    <aside
      aria-label={language === "am" ? "የተደራሽነት ማስተካከያ ፓነል" : "Accessibility Settings Panel"}
      className="border-b-2 border-primary bg-surface p-4 sm:p-6 transition-all shadow-lg animate-in slide-in-from-top duration-200"
    >
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Title & Close */}
        <div className="flex items-center justify-between pb-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Eye className="size-5 text-primary" />
            <h2 className="font-bold text-base sm:text-lg">
              {language === "am" ? "የተደራሽነት እና የድምፅ ማስተካከያዎች" : "Accessibility & Voice Controls"}
            </h2>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            aria-label={language === "am" ? "ፓነሉን ዝጋ" : "Close accessibility panel"}
          >
            <X className="size-4" />
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* 1. High Contrast Modes */}
          <div className="space-y-2">
            <label className="text-sm font-semibold flex items-center gap-1.5">
              <Eye className="size-4 text-primary" />
              {language === "am" ? "የቀለም ንፅፅር ሁነታ" : "Color Contrast Mode"}
            </label>
            <div className="grid grid-cols-1 gap-1.5">
              {Object.entries(CONTRAST_MODES).map(([key, mode]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setContrastMode(mode.id);
                    announce(`የቀለም ንፅፅር ወደ ${mode.label} ተቀይሯል`);
                  }}
                  className={`text-left px-3 py-2 rounded-md text-xs font-medium border flex items-center justify-between transition-colors ${
                    contrastMode === mode.id
                      ? "border-primary bg-primary/10 text-primary font-bold ring-2 ring-primary/30"
                      : "border-border hover:bg-muted"
                  }`}
                  aria-pressed={contrastMode === mode.id}
                >
                  <span>{mode.label}</span>
                  {contrastMode === mode.id && <Check className="size-4 text-primary shrink-0" />}
                </button>
              ))}
            </div>
          </div>

          {/* 2. Text Scaling */}
          <div className="space-y-2">
            <label className="text-sm font-semibold flex items-center gap-1.5">
              <Type className="size-4 text-primary" />
              {language === "am" ? "የፊደል መጠን" : "Font Size Scaling"}
            </label>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(FONT_SIZES).map(([key, size]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setFontSize(key);
                    announce(`የፊደል መጠን ወደ ${size.label} ተቀይሯል`);
                  }}
                  className={`px-3 py-2 rounded-md text-xs font-medium border text-center transition-colors ${
                    fontSize === key
                      ? "border-primary bg-primary/10 text-primary font-bold ring-2 ring-primary/30"
                      : "border-border hover:bg-muted"
                  }`}
                  aria-pressed={fontSize === key}
                >
                  {size.label}
                </button>
              ))}
            </div>

            {/* Screen Reader Mode Toggle */}
            <div className="pt-2">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-medium">
                <input
                  type="checkbox"
                  checked={screenReaderMode}
                  onChange={(e) => {
                    setScreenReaderMode(e.target.checked);
                    announce(
                      e.target.checked
                        ? "የስክሪን አንባቢ ሁነታ ነቅቷል"
                        : "የስክሪን አንባቢ ሁነታ ጠፍቷል"
                    );
                  }}
                  className="size-4 rounded border-border text-primary focus:ring-primary"
                />
                <span>
                  {language === "am"
                    ? "ለስክሪን አንባቢ የተመቻቸ ሁነታ (Screen Reader Mode)"
                    : "Optimize for Screen Readers (NVDA/JAWS)"}
                </span>
              </label>
            </div>
          </div>

          {/* 3. Amharic Voice & AI Models */}
          <div className="space-y-3">
            <label className="text-sm font-semibold flex items-center gap-1.5">
              <Volume2 className="size-4 text-primary" />
              {language === "am" ? "የአዲስ (Addis) የአማርኛ ድምፅ" : "Addis Amharic Voice Selection"}
            </label>

            <div className="space-y-1.5">
              <button
                type="button"
                onClick={() => {
                  setVoiceModel("Addis-Selam-Neural");
                  announce("የአማርኛ ድምፅ ወደ አዲስ ሴላም (Addis Selam) ተቀይሯል");
                }}
                className={`w-full text-left p-2.5 rounded-md text-xs border flex items-center justify-between ${
                  voiceModel === "Addis-Selam-Neural"
                    ? "border-primary bg-primary/10 text-primary font-bold ring-2 ring-primary/30"
                    : "border-border hover:bg-muted"
                }`}
              >
                <div>
                  <div className="font-bold">Addis TTS - ሰላም (Selam)</div>
                  <div className="text-[11px] opacity-80">
                    {language === "am" ? "የሴት ድምፅ፡ ግልጽ፣ የተረጋጋና ለተደራሽነት የተመቻቸ" : "Female voice: Clear, calm & accessible"}
                  </div>
                </div>
                {voiceModel === "Addis-Selam-Neural" && <Check className="size-4 text-primary shrink-0" />}
              </button>

              <button
                type="button"
                onClick={() => {
                  setVoiceModel("Addis-Dawit-Neural");
                  announce("የአማርኛ ድምፅ ወደ አዲስ ዳዊት (Addis Dawit) ተቀይሯል");
                }}
                className={`w-full text-left p-2.5 rounded-md text-xs border flex items-center justify-between ${
                  voiceModel === "Addis-Dawit-Neural"
                    ? "border-primary bg-primary/10 text-primary font-bold ring-2 ring-primary/30"
                    : "border-border hover:bg-muted"
                }`}
              >
                <div>
                  <div className="font-bold">Addis TTS - ዳዊት (Dawit)</div>
                  <div className="text-[11px] opacity-80">
                    {language === "am" ? "የወንድ ድምፅ፡ ተፈጥሯዊ የንግግር ቅላጼ ያለው" : "Male voice: Natural cadence & articulation"}
                  </div>
                </div>
                {voiceModel === "Addis-Dawit-Neural" && <Check className="size-4 text-primary shrink-0" />}
              </button>
            </div>

            {/* Auto Read Aloud Toggle */}
            <div className="pt-1 space-y-2">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-medium">
                <input
                  type="checkbox"
                  checked={autoReadAloud}
                  onChange={(e) => {
                    setAutoReadAloud(e.target.checked);
                    announce(
                      e.target.checked
                        ? "ጥያቄዎችን በራስ-ሰር በድምፅ ማንበብ ነቅቷል"
                        : "ጥያቄዎችን በራስ-ሰር ማንበብ ቆሟል"
                    );
                  }}
                  className="size-4 rounded border-border text-primary focus:ring-primary"
                />
                <span>
                  {language === "am"
                    ? "ጥያቄዎችን በራስ-ሰር ጮክ ብለህ አንብብ (Auto Read Aloud)"
                    : "Auto-read questions aloud when moving to next step"}
                </span>
              </label>

              {/* Speech Speed */}
              <div className="flex items-center gap-2 pt-1 text-xs">
                <Gauge className="size-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">
                  {language === "am" ? "የድምፅ ፍጥነት፡" : "Voice speed:"}
                </span>
                {[0.75, 1.0, 1.25].map((rate) => (
                  <button
                    key={rate}
                    type="button"
                    onClick={() => {
                      setSpeechRate(rate);
                      announce(`የድምፅ ንባብ ፍጥነት ወደ ${rate}x ተቀይሯል`);
                    }}
                    className={`px-2 py-0.5 rounded text-[11px] font-medium border ${
                      speechRate === rate
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border hover:bg-muted"
                    }`}
                  >
                    {rate}x
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
