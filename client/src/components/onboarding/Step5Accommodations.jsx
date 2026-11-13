// ==============================================================================
// Step 5: Accessibility Accommodations & Special Needs
// ==============================================================================

import React, { useState } from "react";
import { useAccessibility } from "../../context/AccessibilityContext";
import { useOnboarding } from "../../context/OnboardingContext";
import { useVoice } from "../../context/VoiceContext";
import { VoiceAssistantBar } from "../voice/VoiceAssistantBar";
import { Button } from "../ui/button";
import { Eye, Hand, Volume2, Brain, Mic, ArrowRight, ArrowLeft, Check, Sparkles } from "lucide-react";

export function Step5Accommodations() {
  const { language, announce } = useAccessibility();
  const { saveCurrentStep, goToPreviousStep, stepsData, isLoading, answers } = useOnboarding();
  const { startRecording, isRecording, isProcessingSTT } = useVoice();
  const stepInfo = stepsData[4] || {};

  const saved = answers.accommodations || {};

  const [visualAccommodations, setVisualAccommodations] = useState(
    saved.visualAccommodations || ["screen_reader_friendly", "high_contrast"]
  );
  const [motorAccommodations, setMotorAccommodations] = useState(
    saved.motorAccommodations || ["voice_commands"]
  );
  const [readingAccommodations, setReadingAccommodations] = useState(
    saved.readingAccommodations || ["amharic_read_aloud"]
  );
  const [preferVoiceInput, setPreferVoiceInput] = useState(
    saved.preferVoiceInput !== undefined ? saved.preferVoiceInput : true
  );
  const [specialAccommodationNotes, setSpecialAccommodationNotes] = useState(
    saved.specialAccommodationNotes || ""
  );

  const toggleItem = (list, setList, item) => {
    if (list.includes(item)) {
      setList(list.filter((x) => x !== item));
    } else {
      setList([...list, item]);
    }
  };

  const handleVoiceNotes = () => {
    startRecording("accommodations", "accommodations", (text) => {
      setSpecialAccommodationNotes(text);
      announce(`የተደራሽነት ማስታወሻዎ ተመዝግቧል፡ ${text}`);
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const payload = {
      visualAccommodations,
      motorAccommodations,
      readingAccommodations,
      preferVoiceInput,
      specialAccommodationNotes,
    };
    saveCurrentStep("accommodations", payload);
  };

  return (
    <div className="space-y-6">
      <VoiceAssistantBar
        questionTitle={language === "am" ? stepInfo.titleAmharic : stepInfo.titleEnglish}
        questionPrompt={language === "am" ? stepInfo.promptAmharic : stepInfo.promptEnglish}
        activeFieldHint="accommodations"
      />

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Visual Accommodations */}
        <fieldset className="p-4 sm:p-5 rounded-xl border border-border bg-surface space-y-3">
          <legend className="px-2 text-sm font-bold flex items-center gap-1.5 text-primary">
            <Eye className="size-4" />
            {language === "am"
              ? "የማየት ድጋፍ እና የስክሪን አንባቢ (Visual & Screen Reader Support)"
              : "Visual & Screen Reader Support"}
          </legend>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {[
              { id: "screen_reader_friendly", label: "ለስክሪን አንባቢ (NVDA/JAWS) የተመቻቸ ቅርጸት", labelEn: "Screen Reader Optimizations" },
              { id: "high_contrast", label: "ከፍተኛ የቀለም ንፅፅር እና ትላልቅ ፊደላት", labelEn: "High-Contrast & Large Fonts" },
              { id: "audio_descriptions", label: "የስዕሎችና ቪዲዮዎች ሙሉ የድምፅ ማብራሪያ", labelEn: "Detailed Audio Descriptions" },
              { id: "braille_ready", label: "የብሬይል (Braille) ዝግጁ ሰነዶች", labelEn: "Braille-Ready Materials" },
            ].map((opt) => {
              const isChecked = visualAccommodations.includes(opt.id);
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => toggleItem(visualAccommodations, setVisualAccommodations, opt.id)}
                  className={`p-3 rounded-lg text-left text-xs font-semibold border-2 flex items-center justify-between transition-all ${
                    isChecked
                      ? "border-primary bg-primary/10 text-primary ring-2 ring-primary/30"
                      : "border-border hover:bg-muted"
                  }`}
                  aria-pressed={isChecked}
                >
                  <span>{language === "am" ? opt.label : opt.labelEn}</span>
                  {isChecked && <Check className="size-4 text-primary shrink-0" />}
                </button>
              );
            })}
          </div>
        </fieldset>

        {/* Motor & Physical Accommodations */}
        <fieldset className="p-4 sm:p-5 rounded-xl border border-border bg-surface space-y-3">
          <legend className="px-2 text-sm font-bold flex items-center gap-1.5 text-primary">
            <Hand className="size-4" />
            {language === "am"
              ? "የእንቅስቃሴና አካላዊ ድጋፍ (Motor & Physical Accommodations)"
              : "Motor & Physical Accommodations"}
          </legend>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {[
              { id: "voice_commands", label: "ሙሉ የድምፅ ትዕዛዞችና በድምፅ የመመለስ እድል", labelEn: "Voice-First Interaction" },
              { id: "keyboard_only", label: "ማውዝ ሳይጠቀሙ በኪቦርድ ብቻ የመጠቀም ድጋፍ", labelEn: "Keyboard-Only Navigation" },
              { id: "extended_time", label: "ያልተገደበ የፈተናና የትምህርት ጊዜ", labelEn: "Extended / Flexible Time" },
              { id: "large_clickable_targets", label: "ትላልቅ እና በቀላሉ የሚነኩ አዝራሮች", labelEn: "Large Clickable Targets" },
            ].map((opt) => {
              const isChecked = motorAccommodations.includes(opt.id);
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => toggleItem(motorAccommodations, setMotorAccommodations, opt.id)}
                  className={`p-3 rounded-lg text-left text-xs font-semibold border-2 flex items-center justify-between transition-all ${
                    isChecked
                      ? "border-primary bg-primary/10 text-primary ring-2 ring-primary/30"
                      : "border-border hover:bg-muted"
                  }`}
                  aria-pressed={isChecked}
                >
                  <span>{language === "am" ? opt.label : opt.labelEn}</span>
                  {isChecked && <Check className="size-4 text-primary shrink-0" />}
                </button>
              );
            })}
          </div>
        </fieldset>

        {/* Reading & Cognitive Support */}
        <fieldset className="p-4 sm:p-5 rounded-xl border border-border bg-surface space-y-3">
          <legend className="px-2 text-sm font-bold flex items-center gap-1.5 text-primary">
            <Brain className="size-4" />
            {language === "am"
              ? "የንባብ እና የግንዛቤ ድጋፍ (Reading & Cognitive Assistance)"
              : "Reading & Cognitive Assistance"}
          </legend>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {[
              { id: "amharic_read_aloud", label: "ሁሉንም ትምህርቶች በአማርኛ ድምፅ ማንበብ", labelEn: "Amharic Audio for All Content" },
              { id: "step_by_step_pacing", label: "በአንድ ጊዜ አንድ ጥያቄና እርምጃ ብቻ ማሳየት", labelEn: "One Concept at a Time" },
              { id: "simplified_language", label: "ቀለል ያሉ ቃላትና ማጠቃለያዎች", labelEn: "Plain Language & Summaries" },
              { id: "human_mentor_support", label: "የቀጥታ የተደራሽነት አማካሪ እገዛ", labelEn: "Human Accessibility Mentor" },
            ].map((opt) => {
              const isChecked = readingAccommodations.includes(opt.id);
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => toggleItem(readingAccommodations, setReadingAccommodations, opt.id)}
                  className={`p-3 rounded-lg text-left text-xs font-semibold border-2 flex items-center justify-between transition-all ${
                    isChecked
                      ? "border-primary bg-primary/10 text-primary ring-2 ring-primary/30"
                      : "border-border hover:bg-muted"
                  }`}
                  aria-pressed={isChecked}
                >
                  <span>{language === "am" ? opt.label : opt.labelEn}</span>
                  {isChecked && <Check className="size-4 text-primary shrink-0" />}
                </button>
              );
            })}
          </div>
        </fieldset>

        {/* Additional Voice Note / Details */}
        <div className="p-4 sm:p-5 rounded-xl border border-border bg-surface space-y-3">
          <div className="flex items-center justify-between">
            <label htmlFor="notes" className="text-xs font-bold text-foreground">
              {language === "am"
                ? "ተጨማሪ ልዩ ፍላጎት ወይም የተደራሽነት ማስታወሻ (በድምፅ ይናገሩ)"
                : "Additional Accessibility Notes (Speak or Type)"}
            </label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleVoiceNotes}
              disabled={isRecording || isProcessingSTT}
              className="text-xs flex items-center gap-1.5 border-primary/40 hover:border-primary"
            >
              <Mic className="size-3.5 text-primary" />
              <span>{language === "am" ? "በድምፅ ተናገር" : "Speak Notes"}</span>
            </Button>
          </div>
          <textarea
            id="notes"
            rows={3}
            value={specialAccommodationNotes}
            onChange={(e) => setSpecialAccommodationNotes(e.target.value)}
            placeholder={
              language === "am"
                ? "ለምሳሌ፡ ረዳት ያስፈልገኛል፣ ወይም የድምፅ ፍጥነቱ ቀርፋፋ እንዲሆን እፈልጋለሁ..."
                : "e.g. I require a dedicated tutor callback, or slower voice audio..."
            }
            className="w-full p-3 rounded-lg border border-input bg-background text-sm focus:ring-2 focus:ring-primary focus:outline-none"
          />
        </div>

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
            <span>{language === "am" ? "ወደ ማጠቃለያ ሂድ" : "Proceed to Review"}</span>
            <ArrowRight className="size-4" />
          </Button>
        </div>
      </form>
    </div>
  );
}
