// ==============================================================================
// Step 4: Educational Background & Learning Goals
// ==============================================================================

import React, { useState } from "react";
import { useAccessibility } from "../../context/AccessibilityContext";
import { useOnboarding } from "../../context/OnboardingContext";
import { useVoice } from "../../context/VoiceContext";
import { VoiceAssistantBar } from "../voice/VoiceAssistantBar";
import { Button } from "../ui/button";
import { BookOpen, GraduationCap, Mic, ArrowRight, ArrowLeft, Check, Sparkles } from "lucide-react";

export function Step4Education() {
  const { language, announce } = useAccessibility();
  const { saveCurrentStep, goToPreviousStep, stepsData, isLoading, answers } = useOnboarding();
  const { startRecording, isRecording, isProcessingSTT } = useVoice();
  const stepInfo = stepsData[3] || {};

  const saved = answers.education || {};

  const [educationLevel, setEducationLevel] = useState(saved.educationLevel || "BASIC_LITERACY_NUMERACY");
  const [readingComfortLevel, setReadingComfortLevel] = useState(saved.readingComfortLevel || "moderate");
  const [primaryLearningGoal, setPrimaryLearningGoal] = useState(
    saved.primaryLearningGoal || (language === "am" ? "የኮምፒውተርና ዲጂታል ክህሎት ማዳበር" : "Digital & Computer Literacy")
  );

  const handleVoiceGoal = () => {
    startRecording("primaryLearningGoal", "primaryLearningGoal", (text) => {
      setPrimaryLearningGoal(text);
      announce(`የመማር አላማዎ ተመዝግቧል፡ ${text}`);
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const payload = {
      educationLevel,
      readingComfortLevel,
      primaryLearningGoal,
    };
    saveCurrentStep("education", payload);
  };

  return (
    <div className="space-y-6">
      <VoiceAssistantBar
        questionTitle={language === "am" ? stepInfo.titleAmharic : stepInfo.titleEnglish}
        questionPrompt={language === "am" ? stepInfo.promptAmharic : stepInfo.promptEnglish}
        activeFieldHint="educationLevel"
      />

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Education Level Selection */}
        <fieldset className="p-4 sm:p-5 rounded-xl border border-border bg-surface space-y-4">
          <legend className="px-2 text-sm font-bold flex items-center gap-1.5 text-primary">
            <GraduationCap className="size-4" />
            {language === "am" ? "1. የትምህርት ደረጃዎን ይምረጡ" : "1. Select Education Level"}
          </legend>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {[
              {
                id: "NO_FORMAL_SCHOOLING",
                labelAmharic: "መደበኛ ትምህርት የሌለኝ",
                labelEnglish: "No Formal Schooling",
                descAmharic: "ለጀማሪዎች የተዘጋጀ የድምፅና የእይታ ትምህርት",
              },
              {
                id: "BASIC_LITERACY_NUMERACY",
                labelAmharic: "መሰረታዊ ማንበብና መጻፍ",
                labelEnglish: "Basic Literacy & Numeracy",
                descAmharic: "ፊደላትንና ቁጥሮችን ለይተው የሚያውቁ",
              },
              {
                id: "PRIMARY_SCHOOL",
                labelAmharic: "አንደኛ ደረጃ (1-8)",
                labelEnglish: "Primary School (Grades 1-8)",
                descAmharic: "የመጀመሪያ ደረጃ ትምህርት ያጠናቀቁ",
              },
              {
                id: "SECONDARY_SCHOOL",
                labelAmharic: "ሁለተኛ ደረጃ (9-12)",
                labelEnglish: "Secondary School (Grades 9-12)",
                descAmharic: "የሁለተኛ ደረጃ ትምህርት",
              },
              {
                id: "TECHNICAL_VOCATIONAL",
                labelAmharic: "የሙያና ቴክኒክ ስልጠና (TVET)",
                labelEnglish: "Technical & Vocational (TVET)",
                descAmharic: "የተግባርና የእጅ ሙያ ስልጠናዎች",
              },
              {
                id: "DIPLOMA_OR_HIGHER",
                labelAmharic: "ኮሌጅ ዲፕሎማ ወይም ዲግሪ",
                labelEnglish: "College Diploma or Degree",
                descAmharic: "የከፍተኛ ትምህርት ምሩቅ",
              },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setEducationLevel(item.id)}
                className={`p-3 rounded-lg text-left border-2 flex items-start justify-between transition-all ${
                  educationLevel === item.id
                    ? "border-primary bg-primary/10 shadow-sm ring-2 ring-primary/30 font-bold"
                    : "border-border hover:bg-muted"
                }`}
              >
                <div>
                  <div className="text-xs text-foreground font-bold">
                    {language === "am" ? item.labelAmharic : item.labelEnglish}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    {item.descAmharic}
                  </div>
                </div>
                {educationLevel === item.id && <Check className="size-4 text-primary shrink-0 ml-2" />}
              </button>
            ))}
          </div>
        </fieldset>

        {/* Reading Comfort & Assistance Needs */}
        <fieldset className="p-4 sm:p-5 rounded-xl border border-border bg-surface space-y-4">
          <legend className="px-2 text-sm font-bold flex items-center gap-1.5 text-primary">
            <BookOpen className="size-4" />
            {language === "am"
              ? "2. የንባብ ምቾት እና የድምፅ እገዛ ፍላጎት"
              : "2. Reading Comfort & Audio Assistance"}
          </legend>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              {
                id: "comfortable",
                labelAmharic: "ጽሑፍ በቀላሉ ማንበብ እችላለሁ",
                labelEnglish: "Comfortable Reading Text",
                descAmharic: "መደበኛ የጽሑፍ ትምህርቶች",
              },
              {
                id: "moderate",
                labelAmharic: "በድምፅ እገዛ ማንበብ እመርጣለሁ",
                labelEnglish: "Prefer Audio / Voice Help",
                descAmharic: "ጽሑፍና የአማርኛ ንባብ ተደምሮ",
              },
              {
                id: "voice_only",
                labelAmharic: "ሙሉ በሙሉ በድምፅ ብቻ",
                labelEnglish: "Voice & Audio Only",
                descAmharic: "የማንበብ ችግር ላለባቸው ሙሉ የድምፅ ትምህርት",
              },
            ].map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setReadingComfortLevel(option.id)}
                className={`p-3 rounded-lg text-left border-2 transition-all ${
                  readingComfortLevel === option.id
                    ? "border-primary bg-primary/10 shadow-sm ring-2 ring-primary/30 font-bold"
                    : "border-border hover:bg-muted"
                }`}
              >
                <div className="text-xs font-bold text-foreground">
                  {language === "am" ? option.labelAmharic : option.labelEnglish}
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  {option.descAmharic}
                </div>
              </button>
            ))}
          </div>
        </fieldset>

        {/* Primary Learning Goal with Addis Scribe Voice Input */}
        <div className="p-4 sm:p-5 rounded-xl border border-border bg-surface space-y-3">
          <div className="flex items-center justify-between">
            <label htmlFor="primaryGoal" className="text-xs font-bold text-foreground flex items-center gap-1.5">
              <Sparkles className="size-4 text-primary" />
              <span>
                {language === "am"
                  ? "3. በክፍት መንገድ መማር የሚፈልጉት ዋና አላማ (በድምፅ ይናገሩ)"
                  : "3. Primary Learning Goal (Speak or Type)"}
              </span>
            </label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleVoiceGoal}
              disabled={isRecording || isProcessingSTT}
              className="text-xs flex items-center gap-1.5 border-primary/40 hover:border-primary"
            >
              <Mic className="size-3.5 text-primary" />
              <span>{language === "am" ? "በድምፅ ተናገር" : "Speak Goal"}</span>
            </Button>
          </div>

          <textarea
            id="primaryGoal"
            rows={3}
            value={primaryLearningGoal}
            onChange={(e) => setPrimaryLearningGoal(e.target.value)}
            placeholder={
              language === "am"
                ? "ምሳሌ፡ የኮምፒውተር ክህሎት ተምሬ የራሴን ስራ መጀመር እፈልጋለሁ..."
                : "e.g. Learn digital skills to find employment..."
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
            <span>{language === "am" ? "ቀጣይ ጥያቄ" : "Next Question"}</span>
            <ArrowRight className="size-4" />
          </Button>
        </div>
      </form>
    </div>
  );
}
