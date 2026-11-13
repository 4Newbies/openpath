// ==============================================================================
// Step 1: Language & Accessibility Setup (One-Question-At-A-Time)
// ==============================================================================

import React, { useState } from "react";
import { useAccessibility, CONTRAST_MODES, FONT_SIZES } from "../../context/AccessibilityContext";
import { useOnboarding } from "../../context/OnboardingContext";
import { VoiceAssistantBar } from "../voice/VoiceAssistantBar";
import { Button } from "../ui/button";
import { Check, ArrowRight, Volume2, Globe, Eye, Type } from "lucide-react";

export function Step1LanguageAccess() {
  const {
    language,
    setLanguage,
    contrastMode,
    setContrastMode,
    fontSize,
    setFontSize,
    autoReadAloud,
    setAutoReadAloud,
    voiceModel,
    setVoiceModel,
    screenReaderMode,
    setScreenReaderMode,
    speechRate,
    announce,
  } = useAccessibility();

  const { saveCurrentStep, stepsData, isLoading, answers } = useOnboarding();
  const stepInfo = stepsData[0] || {};

  const initialValues = answers.language_accessibility || {};

  const handleContinue = (e) => {
    e.preventDefault();
    const payload = {
      primaryLanguage: language === "am" ? "AMHARIC" : "ENGLISH",
      contrastMode,
      fontSize,
      autoReadAloud,
      voiceModel,
      screenReaderMode,
      speechRate,
    };
    saveCurrentStep("language_accessibility", payload);
  };

  return (
    <div className="space-y-6">
      {/* Voice Assistant Bar */}
      <VoiceAssistantBar
        questionTitle={language === "am" ? stepInfo.titleAmharic : stepInfo.titleEnglish}
        questionPrompt={language === "am" ? stepInfo.promptAmharic : stepInfo.promptEnglish}
        activeFieldHint="general"
      />

      <form onSubmit={handleContinue} className="space-y-8">
        {/* 1. Primary Language Selection */}
        <fieldset className="p-4 sm:p-5 rounded-xl border border-border bg-surface">
          <legend className="px-2 text-sm font-bold flex items-center gap-1.5 text-primary">
            <Globe className="size-4" />
            {language === "am" ? "1. የምርጫ ቋንቋዎን ይምረጡ" : "1. Choose Your Preferred Language"}
          </legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
            <button
              type="button"
              onClick={() => {
                setLanguage("am");
                announce("የመጀመሪያ ቋንቋ ወደ አማርኛ ተቀናብሯል");
              }}
              className={`p-4 rounded-xl text-left border-2 flex items-center justify-between transition-all ${
                language === "am"
                  ? "border-primary bg-primary/10 shadow-sm ring-2 ring-primary/40 font-bold"
                  : "border-border hover:bg-muted"
              }`}
            >
              <div>
                <div className="text-base font-bold text-foreground">አማርኛ (Amharic)</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  የአማርኛ የድምፅና የጽሑፍ ድጋፍ (Addis Scribe & Azure Ameha)
                </div>
              </div>
              {language === "am" && <Check className="size-5 text-primary shrink-0" />}
            </button>

            <button
              type="button"
              onClick={() => {
                setLanguage("en");
                announce("Primary language set to English");
              }}
              className={`p-4 rounded-xl text-left border-2 flex items-center justify-between transition-all ${
                language === "en"
                  ? "border-primary bg-primary/10 shadow-sm ring-2 ring-primary/40 font-bold"
                  : "border-border hover:bg-muted"
              }`}
            >
              <div>
                <div className="text-base font-bold text-foreground">English</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  English voice and screen reader guidance
                </div>
              </div>
              {language === "en" && <Check className="size-5 text-primary shrink-0" />}
            </button>
          </div>
        </fieldset>

        {/* 2. Amharic TTS Voice Engine Model */}
        <fieldset className="p-4 sm:p-5 rounded-xl border border-border bg-surface">
          <legend className="px-2 text-sm font-bold flex items-center gap-1.5 text-primary">
            <Volume2 className="size-4" />
            {language === "am"
              ? "2. የአማርኛ ንግግርና ድምፅ ሞዴል (Amharic Voice Model)"
              : "2. Amharic Speech Synthesis Voice Model"}
          </legend>
          <p className="text-xs text-muted-foreground mb-3">
            {language === "am"
              ? "ጥያቄዎችን እና መመሪያዎችን ጮክ ብሎ ለማንበብ የሚመርጡትን ልዩ የአማርኛ የድምፅ ሞዴል ይምረጡ፡"
              : "Select the specialized Amharic speech synthesis model tailored for accessibility:"}
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => {
                setVoiceModel("AZURE_AMEHA");
                announce("Azure Ameha Neural Amharic Voice model selected");
              }}
              className={`p-4 rounded-xl text-left border-2 flex items-start justify-between transition-all ${
                voiceModel === "AZURE_AMEHA"
                  ? "border-primary bg-primary/10 shadow-sm ring-2 ring-primary/40"
                  : "border-border hover:bg-muted"
              }`}
            >
              <div>
                <span className="font-bold text-sm block">Azure Ameha (አሜሃ - am-ET-AmehaNeural)</span>
                <span className="text-xs text-muted-foreground mt-1 block">
                  {language === "am"
                    ? "ከፍተኛ ጥራት ያለው፣ ግልጽ እና ለአረጋውያንና የማየት እክል ላለባቸው ምቹ የተፈጥሮ አማርኛ ድምፅ"
                    : "High-clarity neural Amharic voice with natural pacing and Ge'ez phonetic precision."}
                </span>
              </div>
              {voiceModel === "AZURE_AMEHA" && <Check className="size-5 text-primary shrink-0 ml-2" />}
            </button>

            <button
              type="button"
              onClick={() => {
                setVoiceModel("MMS_TTS");
                announce("Meta MMS-TTS Amharic Voice model selected");
              }}
              className={`p-4 rounded-xl text-left border-2 flex items-start justify-between transition-all ${
                voiceModel === "MMS_TTS"
                  ? "border-primary bg-primary/10 shadow-sm ring-2 ring-primary/40"
                  : "border-border hover:bg-muted"
              }`}
            >
              <div>
                <span className="font-bold text-sm block">Meta MMS-TTS (mms-tts-amh)</span>
                <span className="text-xs text-muted-foreground mt-1 block">
                  {language === "am"
                    ? "ክፍት ምንጭ የሜታ የብዙ ቋንቋዎች የድምፅ ሞዴል፤ በአማርኛ ቃላት ላይ የሰለጠነ"
                    : "Open-source Massively Multilingual Speech Amharic acoustic model."}
                </span>
              </div>
              {voiceModel === "MMS_TTS" && <Check className="size-5 text-primary shrink-0 ml-2" />}
            </button>
          </div>
        </fieldset>

        {/* 3. Visual & Screen Contrast */}
        <fieldset className="p-4 sm:p-5 rounded-xl border border-border bg-surface">
          <legend className="px-2 text-sm font-bold flex items-center gap-1.5 text-primary">
            <Eye className="size-4" />
            {language === "am" ? "3. የእይታ እና የንፅፅር ሁነታ" : "3. Visual & Contrast Preferences"}
          </legend>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
            {Object.entries(CONTRAST_MODES).map(([key, mode]) => (
              <button
                key={key}
                type="button"
                onClick={() => setContrastMode(mode.id)}
                className={`p-3 rounded-lg text-left text-xs font-semibold border flex items-center justify-between transition-all ${
                  contrastMode === mode.id
                    ? "border-primary bg-primary/10 text-primary ring-2 ring-primary/30"
                    : "border-border hover:bg-muted"
                }`}
              >
                <span>{mode.label}</span>
                {contrastMode === mode.id && <Check className="size-4 text-primary shrink-0" />}
              </button>
            ))}
          </div>

          <div className="mt-4 pt-3 border-t border-border flex items-center justify-between flex-wrap gap-3">
            <label className="text-xs font-semibold flex items-center gap-1.5">
              <Type className="size-4 text-primary" />
              {language === "am" ? "የፊደል መጠን፡" : "Text Size:"}
            </label>
            <div className="flex items-center gap-1.5">
              {Object.entries(FONT_SIZES).map(([key, size]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFontSize(key)}
                  className={`px-3 py-1.5 rounded-md text-xs font-bold border transition-colors ${
                    fontSize === key
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border hover:bg-muted"
                  }`}
                >
                  {key === "normal" ? "A" : key === "large" ? "A+" : key === "extraLarge" ? "A++" : "Max"}
                </button>
              ))}
            </div>
          </div>
        </fieldset>

        {/* Action Button */}
        <div className="flex justify-end pt-4">
          <Button
            type="submit"
            size="lg"
            disabled={isLoading}
            className="w-full sm:w-auto h-12 px-8 text-base font-bold flex items-center justify-center gap-2 shadow-md"
          >
            <span>{language === "am" ? "ወደ ቀጣዩ ጥያቄ ሂድ" : "Proceed to Next Question"}</span>
            <ArrowRight className="size-5" />
          </Button>
        </div>
      </form>
    </div>
  );
}
