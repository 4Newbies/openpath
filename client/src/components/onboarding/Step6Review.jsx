// ==============================================================================
// Step 6: Review & Final Registration Confirmation
// Accessible Summary with Voice Readback (WCAG 2.2 AA Criteria 3.3.4 & 3.3.6)
// ==============================================================================

import React, { useState } from "react";
import { useAccessibility } from "../../context/AccessibilityContext";
import { useOnboarding } from "../../context/OnboardingContext";
import { useVoice } from "../../context/VoiceContext";
import { VoiceAssistantBar } from "../voice/VoiceAssistantBar";
import { Button } from "../ui/button";
import {
  ShieldCheck,
  User,
  Phone,
  GraduationCap,
  Eye,
  CheckCircle2,
  Volume2,
  ArrowLeft,
  Edit,
  Loader2,
  Sparkles,
} from "lucide-react";

export function Step6Review() {
  const { language, announce } = useAccessibility();
  const { answers, goToStep, goToPreviousStep, finalizeRegistration, isLoading, stepsData } = useOnboarding();
  const { speakText, isPlayingAudio, stopAudio } = useVoice();
  const stepInfo = stepsData[5] || {};

  const idInfo = answers.identity || {};
  const contactInfo = answers.contact || {};
  const eduInfo = answers.education || {};
  const accessInfo = answers.accommodations || {};
  const langInfo = answers.language_accessibility || {};

  // Construct full spoken summary in natural Amharic
  const generateSpokenSummaryAmharic = () => {
    return `
      የምዝገባ ማጠቃለያዎ ይህን ይመስላል። 
      ሙሉ ስምዎ፡ ${idInfo.fullNameAmharic || idInfo.fullNameEnglish || "አልተገለጸም"}። 
      መኖሪያ ክልል፡ ${idInfo.currentRegion || "አዲስ አበባ"}። 
      የመታወቂያ ሰነድ አይነት፡ ${idInfo.idType || "የስደተኞች ምዝገባ"}። 
      የመገናኛ ስልክ ቁጥር፡ ${contactInfo.phoneNumber || "አልተገለጸም"}። 
      የትምህርት ደረጃ፡ ${eduInfo.educationLevel || "መሰረታዊ"}። 
      ዋና የመማር አላማ፡ ${eduInfo.primaryLearningGoal || "የኮምፒውተር ክህሎት"}። 
      ሁሉንም መረጃዎች ትክክለኛ ከሆኑ 'ምዝገባን አጠናቅቅ' የሚለውን ቁልፍ ይጫኑ።
    `.trim();
  };

  const handleReadFullSummary = () => {
    if (isPlayingAudio) {
      stopAudio();
    } else {
      const summaryText = language === "am" ? generateSpokenSummaryAmharic() : `
        Registration summary: Name: ${idInfo.fullNameEnglish || idInfo.fullNameAmharic}.
        Location: ${idInfo.currentRegion}.
        Phone: ${contactInfo.phoneNumber}.
        Education goal: ${eduInfo.primaryLearningGoal}.
        Press Complete Registration to finish.
      `;
      speakText(summaryText);
    }
  };

  return (
    <div className="space-y-6">
      <VoiceAssistantBar
        questionTitle={language === "am" ? stepInfo.titleAmharic : stepInfo.titleEnglish}
        questionPrompt={language === "am" ? stepInfo.promptAmharic : stepInfo.promptEnglish}
        activeFieldHint="general"
      />

      {/* Voice Readback Banner */}
      <div className="p-4 rounded-xl border-2 border-primary/40 bg-primary/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-lg bg-primary text-primary-foreground flex items-center justify-center shrink-0">
            <Volume2 className="size-5" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-foreground">
              {language === "am" ? "የሙሉ ማጠቃለያውን የድምፅ ንባብ ያዳምጡ" : "Listen to Full Spoken Summary"}
            </h3>
            <p className="text-xs text-muted-foreground">
              {language === "am"
                ? "ማንበብ ሳያስፈልግዎ ያስገቧቸውን መረጃዎች በሙሉ በሰለጠነ አማርኛ ድምፅ ያዳምጡ"
                : "Have the entire review read aloud in natural Amharic speech without reading the screen."}
            </p>
          </div>
        </div>

        <Button
          type="button"
          onClick={handleReadFullSummary}
          variant={isPlayingAudio ? "destructive" : "default"}
          className="w-full sm:w-auto font-bold flex items-center gap-2 shrink-0 shadow-sm"
        >
          <Volume2 className="size-4" />
          <span>
            {isPlayingAudio
              ? language === "am" ? "ድምፁን አቁም" : "Stop Audio"
              : language === "am" ? "ሙሉ ማጠቃለያውን አዳምጥ" : "Read Summary Aloud"}
          </span>
        </Button>
      </div>

      {/* Structured Review Sections */}
      <div className="space-y-4">
        {/* 1. Identity & Refugee ID */}
        <div className="p-4 rounded-xl border border-border bg-surface flex flex-col sm:flex-row justify-between items-start gap-4">
          <div className="space-y-1.5 flex-1">
            <div className="flex items-center gap-2 text-xs font-bold text-primary uppercase tracking-wider">
              <User className="size-4" />
              <span>{language === "am" ? "ማንነት እና ሰነዶች" : "Identity & Documents"}</span>
            </div>
            <div className="text-base font-bold text-foreground">
              {idInfo.fullNameAmharic || idInfo.fullNameEnglish || "(ስም አልተሞላም)"}
            </div>
            {idInfo.fullNameEnglish && (
              <div className="text-xs text-muted-foreground">{idInfo.fullNameEnglish}</div>
            )}
            <div className="text-xs text-foreground/80 pt-1 space-y-0.5">
              <div>
                <span className="font-semibold text-muted-foreground">
                  {language === "am" ? "መኖሪያ ክልል፡" : "Region:"}{" "}
                </span>
                {idInfo.currentRegion}
              </div>
              <div>
                <span className="font-semibold text-muted-foreground">
                  {language === "am" ? "የመታወቂያ አይነት፡" : "Document:"}{" "}
                </span>
                <span className="px-2 py-0.5 rounded bg-primary/10 text-primary font-mono text-[11px] font-bold">
                  {idInfo.idType || "UNHCR / Alternative ID"}
                </span>
                {idInfo.documentNumber && ` (${idInfo.documentNumber})`}
              </div>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => goToStep(1)}
            className="flex items-center gap-1.5 text-xs text-primary"
          >
            <Edit className="size-3.5" />
            <span>{language === "am" ? "አስተካክል" : "Edit"}</span>
          </Button>
        </div>

        {/* 2. Contact */}
        <div className="p-4 rounded-xl border border-border bg-surface flex flex-col sm:flex-row justify-between items-start gap-4">
          <div className="space-y-1.5 flex-1">
            <div className="flex items-center gap-2 text-xs font-bold text-primary uppercase tracking-wider">
              <Phone className="size-4" />
              <span>{language === "am" ? "የመገናኛ ዘዴ" : "Contact & Liaison"}</span>
            </div>
            <div className="text-sm font-bold text-foreground font-mono">
              {contactInfo.phoneNumber || "(ስልክ አልተገለጸም)"}
            </div>
            <div className="text-xs text-muted-foreground">
              {language === "am" ? "ተመራጭ መንገድ፡" : "Channel:"}{" "}
              <span className="font-semibold text-foreground">
                {contactInfo.preferredContactMethod || "PHONE_CALL"}
              </span>
            </div>
            {contactInfo.trustedContactName && (
              <div className="text-xs text-muted-foreground">
                {language === "am" ? "ታማኝ ተወካይ፡" : "Advocate:"}{" "}
                {contactInfo.trustedContactName} ({contactInfo.trustedContactPhone})
              </div>
            )}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => goToStep(2)}
            className="flex items-center gap-1.5 text-xs text-primary"
          >
            <Edit className="size-3.5" />
            <span>{language === "am" ? "አስተካክል" : "Edit"}</span>
          </Button>
        </div>

        {/* 3. Education & Goals */}
        <div className="p-4 rounded-xl border border-border bg-surface flex flex-col sm:flex-row justify-between items-start gap-4">
          <div className="space-y-1.5 flex-1">
            <div className="flex items-center gap-2 text-xs font-bold text-primary uppercase tracking-wider">
              <GraduationCap className="size-4" />
              <span>{language === "am" ? "ትምህርትና አላማ" : "Education & Goals"}</span>
            </div>
            <div className="text-sm font-semibold text-foreground">
              {eduInfo.educationLevel || "BASIC_LITERACY_NUMERACY"}
            </div>
            <div className="text-xs text-muted-foreground">
              {language === "am" ? "የመማር አላማ፡" : "Goal:"}{" "}
              <span className="text-foreground font-medium">
                {eduInfo.primaryLearningGoal || "(አልተገለጸም)"}
              </span>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => goToStep(3)}
            className="flex items-center gap-1.5 text-xs text-primary"
          >
            <Edit className="size-3.5" />
            <span>{language === "am" ? "አስተካክል" : "Edit"}</span>
          </Button>
        </div>

        {/* 4. Accessibility Accommodations */}
        <div className="p-4 rounded-xl border border-border bg-surface flex flex-col sm:flex-row justify-between items-start gap-4">
          <div className="space-y-1.5 flex-1">
            <div className="flex items-center gap-2 text-xs font-bold text-primary uppercase tracking-wider">
              <Eye className="size-4" />
              <span>{language === "am" ? "የተመረጡ የተደራሽነት ድጋፎች" : "Accessibility Accommodations"}</span>
            </div>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {[
                ...(accessInfo.visualAccommodations || []),
                ...(accessInfo.motorAccommodations || []),
                ...(accessInfo.readingAccommodations || []),
              ].map((acc, i) => (
                <span
                  key={i}
                  className="px-2.5 py-1 rounded-full bg-surface-secondary border border-border text-[11px] font-medium"
                >
                  ✓ {acc.replace(/_/g, " ")}
                </span>
              ))}
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => goToStep(4)}
            className="flex items-center gap-1.5 text-xs text-primary"
          >
            <Edit className="size-3.5" />
            <span>{language === "am" ? "አስተካክል" : "Edit"}</span>
          </Button>
        </div>
      </div>

      {/* Confirmation & Completion CTA */}
      <div className="pt-6 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-4">
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={goToPreviousStep}
          className="w-full sm:w-auto flex items-center justify-center gap-2"
        >
          <ArrowLeft className="size-4" />
          <span>{language === "am" ? "ወደ ኋላ ተመለስ" : "Back"}</span>
        </Button>

        <Button
          type="button"
          size="lg"
          disabled={isLoading}
          onClick={finalizeRegistration}
          className="w-full sm:w-auto h-14 px-10 text-base font-extrabold flex items-center justify-center gap-3 bg-success hover:bg-success/90 text-white shadow-lg"
          aria-label={
            language === "am"
              ? "ምዝገባን በይፋ አጠናቅቅ እና የተማሪ መታወቂያ ተቀበል"
              : "Finalize registration and receive student ID"
          }
        >
          {isLoading ? (
            <>
              <Loader2 className="size-5 animate-spin" />
              <span>{language === "am" ? "በማስቀመጥ ላይ..." : "Submitting..."}</span>
            </>
          ) : (
            <>
              <CheckCircle2 className="size-5" />
              <span>{language === "am" ? "ምዝገባን አጠናቅቅ" : "Complete Registration"}</span>
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
