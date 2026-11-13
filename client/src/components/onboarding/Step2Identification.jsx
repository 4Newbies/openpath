// ==============================================================================
// Step 2: Personal Identification & Inclusive Refugee Alternative IDs
// ==============================================================================

import React, { useState } from "react";
import { useAccessibility } from "../../context/AccessibilityContext";
import { useOnboarding } from "../../context/OnboardingContext";
import { useVoice } from "../../context/VoiceContext";
import { VoiceAssistantBar } from "../voice/VoiceAssistantBar";
import { Button } from "../ui/button";
import {
  User,
  Mic,
  ArrowRight,
  ArrowLeft,
  ShieldCheck,
  FileQuestion,
  Sparkles,
  Info,
} from "lucide-react";

export function Step2Identification() {
  const { language, announce } = useAccessibility();
  const { saveCurrentStep, goToPreviousStep, stepsData, isLoading, answers } = useOnboarding();
  const { startRecording, isRecording, isProcessingSTT } = useVoice();
  const stepInfo = stepsData[1] || {};

  const saved = answers.identity || {};

  const [fullNameAmharic, setFullNameAmharic] = useState(saved.fullNameAmharic || "");
  const [fullNameEnglish, setFullNameEnglish] = useState(saved.fullNameEnglish || "");
  const [ageRange, setAgeRange] = useState(saved.ageRange || "18-24");
  const [currentRegion, setCurrentRegion] = useState(saved.currentRegion || "አዲስ አበባ");
  const [idType, setIdType] = useState(saved.idType || "UNHCR_REFUGEE_REGISTRATION");
  const [documentNumber, setDocumentNumber] = useState(saved.documentNumber || "");
  const [idNotes, setIdNotes] = useState(saved.idNotes || "");

  // Voice dictation handlers for specific fields using Addis Scribe
  const handleVoiceForAmharicName = () => {
    startRecording("fullNameAmharic", "fullNameAmharic", (text) => {
      setFullNameAmharic(text);
      announce(`ስምዎ ተመዝግቧል፡ ${text}`);
    });
  };

  const handleVoiceForLocation = () => {
    startRecording("currentRegion", "currentRegion", (text) => {
      setCurrentRegion(text);
      announce(`መኖሪያ አካባቢዎ ተመዝግቧል፡ ${text}`);
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!fullNameAmharic.trim() && !fullNameEnglish.trim()) {
      announce(
        language === "am"
          ? "እባክዎ ሙሉ ስምዎን ያስገቡ ወይም በድምፅ ይናገሩ"
          : "Please provide your full name by text or voice",
        true
      );
      return;
    }

    const payload = {
      fullNameAmharic: fullNameAmharic.trim(),
      fullNameEnglish: fullNameEnglish.trim(),
      ageRange,
      currentRegion,
      idType,
      documentNumber: documentNumber.trim(),
      idNotes: idNotes.trim(),
      isRefugeeDoc: idType === "UNHCR_REFUGEE_REGISTRATION" || idType === "PROVISIONAL_SELF_ATTESTATION",
    };

    saveCurrentStep("identity", payload, Boolean(fullNameAmharic), fullNameAmharic);
  };

  return (
    <div className="space-y-6">
      {/* Voice Assistant Bar */}
      <VoiceAssistantBar
        questionTitle={language === "am" ? stepInfo.titleAmharic : stepInfo.titleEnglish}
        questionPrompt={language === "am" ? stepInfo.promptAmharic : stepInfo.promptEnglish}
        onVoiceInputCaptured={(transcript) => {
          setFullNameAmharic(transcript);
        }}
        activeFieldHint="fullName"
      />

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Full Name Section with Addis Scribe Voice Support */}
        <div className="p-4 sm:p-5 rounded-xl border border-border bg-surface space-y-4">
          <h3 className="text-sm font-bold flex items-center gap-2 text-primary">
            <User className="size-4" />
            <span>{language === "am" ? "ሙሉ ስም (Full Name)" : "Full Name"}</span>
          </h3>

          <div className="space-y-2">
            <label htmlFor="fullNameAmharic" className="block text-xs font-semibold text-foreground">
              {language === "am" ? "ሙሉ ስም በአማርኛ (ወይም በድምፅ ይናገሩ) *" : "Full Name in Amharic (or speak via microphone) *"}
            </label>
            <div className="flex gap-2">
              <input
                id="fullNameAmharic"
                type="text"
                value={fullNameAmharic}
                onChange={(e) => setFullNameAmharic(e.target.value)}
                placeholder="ምሳሌ፡ ዮናስ ታደሰ አበበ"
                className="flex-1 h-11 px-3.5 rounded-lg border border-input bg-background text-sm font-medium focus:ring-2 focus:ring-primary focus:outline-none"
                aria-required="true"
              />
              <Button
                type="button"
                variant="outline"
                onClick={handleVoiceForAmharicName}
                disabled={isRecording || isProcessingSTT}
                className="h-11 px-3 font-semibold flex items-center gap-1.5 border-primary/40 hover:border-primary text-xs shrink-0"
                aria-label="በአማርኛ ድምፅ ስምዎን ይናገሩ (Addis Scribe STT)"
                title="Speak your name using Addis Scribe Amharic STT"
              >
                <Mic className="size-4 text-primary" />
                <span className="hidden sm:inline">
                  {language === "am" ? "በድምፅ ተናገር" : "Speak Name"}
                </span>
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {language === "am"
                ? "የኪቦርድ አጠቃቀም ችግር ካለብዎት 'በድምፅ ተናገር' የሚለውን ቁልፍ በመጫን በአማርኛ ይናገሩ"
                : "For motor or visual ease, click 'Speak Name' to dictate in Amharic using Addis Scribe STT."}
            </p>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="fullNameEnglish" className="block text-xs font-semibold text-foreground">
              {language === "am" ? "ሙሉ ስም በእንግሊዝኛ (ከተቻለ)" : "Full Name in English (Optional)"}
            </label>
            <input
              id="fullNameEnglish"
              type="text"
              value={fullNameEnglish}
              onChange={(e) => setFullNameEnglish(e.target.value)}
              placeholder="e.g. Yonas Tadesse Abebe"
              className="w-full h-11 px-3.5 rounded-lg border border-input bg-background text-sm focus:ring-2 focus:ring-primary focus:outline-none"
            />
          </div>

          {/* Age Range & Location */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div className="space-y-1.5">
              <label htmlFor="ageRange" className="block text-xs font-semibold text-foreground">
                {language === "am" ? "የእድሜ ክልል" : "Age Range"}
              </label>
              <select
                id="ageRange"
                value={ageRange}
                onChange={(e) => setAgeRange(e.target.value)}
                className="w-full h-11 px-3 rounded-lg border border-input bg-background text-sm focus:ring-2 focus:ring-primary focus:outline-none"
              >
                <option value="under_18">{language === "am" ? "ከ 18 ዓመት በታች" : "Under 18"}</option>
                <option value="18-24">18 - 24 {language === "am" ? "ዓመት" : "years"}</option>
                <option value="25-34">25 - 34 {language === "am" ? "ዓመት" : "years"}</option>
                <option value="35-49">35 - 49 {language === "am" ? "ዓመት" : "years"}</option>
                <option value="50_plus">{language === "am" ? "50 ዓመት እና ከዚያ በላይ" : "50+ years"}</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="currentRegion" className="block text-xs font-semibold text-foreground">
                {language === "am" ? "አሁን የሚገኙበት ክልል / ካምፕ" : "Current Region or Settlement"}
              </label>
              <div className="flex gap-2">
                <input
                  id="currentRegion"
                  type="text"
                  value={currentRegion}
                  onChange={(e) => setCurrentRegion(e.target.value)}
                  placeholder="ምሳሌ፡ አዲስ አበባ ወይም መልካዲዳ ካምፕ"
                  className="flex-1 h-11 px-3.5 rounded-lg border border-input bg-background text-sm focus:ring-2 focus:ring-primary focus:outline-none"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleVoiceForLocation}
                  disabled={isRecording || isProcessingSTT}
                  className="h-11 px-2.5"
                  aria-label="መኖሪያ አካባቢን በድምፅ ይናገሩ"
                >
                  <Mic className="size-4 text-primary" />
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Alternative Identification for Refugees & Learners without Standard ID */}
        <fieldset className="p-4 sm:p-5 rounded-xl border-2 border-primary/40 bg-surface space-y-4">
          <legend className="px-2 text-sm font-bold flex items-center gap-1.5 text-primary">
            <ShieldCheck className="size-4 text-primary" />
            {language === "am"
              ? "የመታወቂያ ሰነድ ምርጫ (አካታች እና አማራጭ መታወቂያዎች)"
              : "Identification Document (Inclusive & Refugee Options)"}
          </legend>

          <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 flex items-start gap-2.5 text-xs text-muted-foreground">
            <Info className="size-4 text-primary shrink-0 mt-0.5" />
            <p>
              {language === "am"
                ? "በክፍት መንገድ (OpenPath) መደበኛ መታወቂያ አለመያዝ ትምህርት እንዳይጀምሩ አያግድዎትም። የስደተኞች ምዝገባ (UNHCR)፣ የቄበሌ ካርድ፣ ወይም ያለ ሰነድ ራስን ማረጋገጥ መምረጥ ይችላሉ።"
                : "At OpenPath, lack of standard government papers will never prevent you from learning. We accept UNHCR Refugee registration, Kebele cards, community letters, or provisional self-attestation."}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {[
              {
                id: "UNHCR_REFUGEE_REGISTRATION",
                labelAmharic: "የስደተኞች ምዝገባ ካርድ (UNHCR)",
                labelEnglish: "UNHCR Refugee Registration Card",
                descAmharic: "ለስደተኞችና ተፈናቃዮች የተዘጋጀ ዓለም አቀፍ ምዝገባ",
              },
              {
                id: "KEBELE_ID",
                labelAmharic: "የቄበሌ መታወቂያ / ጊዜያዊ ካርድ",
                labelEnglish: "Kebele Resident / Temporary ID",
                descAmharic: "የአካባቢ መስተዳድር የተሰጠ መታወቂያ",
              },
              {
                id: "COMMUNITY_ELDER_LETTER",
                labelAmharic: "የማህበረሰብ ወይም የሀገር ሽማግሌ ደብዳቤ",
                labelEnglish: "Community Elder / Liaison Letter",
                descAmharic: "በአካባቢው ማህበረሰብ መሪ የተሰጠ ማረጋገጫ",
              },
              {
                id: "PROVISIONAL_SELF_ATTESTATION",
                labelAmharic: "ያለ ሰነድ ራስን ማረጋገጥ (ሰነድ ለሌላቸው)",
                labelEnglish: "Provisional Self-Attestation (No Documents)",
                descAmharic: "ምንም ዓይነት ሰነድ የሌላቸው ተማሪዎች ወዲያውኑ መማር ይችላሉ",
              },
              {
                id: "NATIONAL_ID",
                labelAmharic: "ብሔራዊ መታወቂያ (ፋይዳ / Fayda ID)",
                labelEnglish: "National ID / Fayda",
                descAmharic: "የኢትዮጵያ ዲጂታል ብሔራዊ መታወቂያ",
              },
              {
                id: "PASSPORT",
                labelAmharic: "ፓስፖርት",
                labelEnglish: "Passport",
                descAmharic: "ዓለም አቀፍ የጉዞ ሰነድ",
              },
            ].map((doc) => (
              <button
                key={doc.id}
                type="button"
                onClick={() => setIdType(doc.id)}
                className={`p-3 rounded-lg text-left border-2 transition-all ${
                  idType === doc.id
                    ? "border-primary bg-primary/10 shadow-sm ring-2 ring-primary/30"
                    : "border-border hover:bg-muted"
                }`}
              >
                <div className="font-bold text-xs text-foreground">
                  {language === "am" ? doc.labelAmharic : doc.labelEnglish}
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  {doc.descAmharic}
                </div>
              </button>
            ))}
          </div>

          {/* Document Number / Reference (Optional) */}
          <div className="space-y-1.5 pt-2">
            <label htmlFor="documentNumber" className="block text-xs font-semibold text-foreground">
              {language === "am"
                ? "የሰነዱ መለያ ቁጥር (ካለዎት)"
                : "Document Number or Reference (If available)"}
            </label>
            <input
              id="documentNumber"
              type="text"
              value={documentNumber}
              onChange={(e) => setDocumentNumber(e.target.value)}
              placeholder={
                idType === "UNHCR_REFUGEE_REGISTRATION"
                  ? "ምሳሌ፡ ETH-MEL-2026-9812"
                  : language === "am"
                    ? "የመለያ ቁጥሩን እዚህ ያስገቡ..."
                    : "Enter reference number..."
              }
              className="w-full h-11 px-3.5 rounded-lg border border-input bg-background text-sm focus:ring-2 focus:ring-primary focus:outline-none"
            />
          </div>
        </fieldset>

        {/* Buttons */}
        <div className="flex items-center justify-between pt-4 gap-3">
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={goToPreviousStep}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="size-4" />
            <span>{language === "am" ? "ወደ ኋላ ተመለስ" : "Back"}</span>
          </Button>

          <Button
            type="submit"
            size="lg"
            disabled={isLoading}
            className="h-12 px-8 font-bold flex items-center gap-2 shadow-md"
          >
            <span>{language === "am" ? "ቀጣይ ጥያቄ" : "Next Question"}</span>
            <ArrowRight className="size-4" />
          </Button>
        </div>
      </form>
    </div>
  );
}
