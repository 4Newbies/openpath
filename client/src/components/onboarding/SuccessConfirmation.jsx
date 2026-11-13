// ==============================================================================
// Success Confirmation & Learner ID Card
// Celebratory accessible screen with voice playback and advisor assignment
// ==============================================================================

import React, { useEffect } from "react";
import { useAccessibility } from "../../context/AccessibilityContext";
import { useOnboarding } from "../../context/OnboardingContext";
import { useVoice } from "../../context/VoiceContext";
import { Button } from "../ui/button";
import {
  CheckCircle2,
  Award,
  UserCheck,
  Phone,
  Printer,
  RotateCcw,
  Volume2,
  Sparkles,
  ShieldCheck,
} from "lucide-react";

export function SuccessConfirmation() {
  const { language, announce } = useAccessibility();
  const { registrationResult, restartFresh, recoveryCode } = useOnboarding();
  const { speakText, isPlayingAudio, stopAudio } = useVoice();

  const data = registrationResult || {};
  const studentId = data.studentIdNumber || "OP-ET-2026-1001";
  const advisor = data.assignedAdvisor || {
    name: "ሰላማዊት ታደሰ (Selamawit Tadesse)",
    role: "የተደራሽነት እና ማህበራዊ ድጋፍ አማካሪ",
    contactPhone: "+251 911 000 111",
  };
  const profile = data.profile || {};

  const spokenSuccessAmharic = `
    እንኳን ደስ አለዎት! ወደ ክፍት መንገድ (OpenPath) ምዝገባዎ በተሳካ ሁኔታ ተጠናቋል። 
    የተማሪ መታወቂያ ቁጥርዎ፡ ${studentId} ነው። 
    የተመደበልዎ የተደራሽነት አማካሪ፡ ${advisor.name} ሲሆኑ የስልክ አድራሻቸው ${advisor.contactPhone} ነው። 
    የትምህርት ጉዞዎን በቅርቡ እንጀምራለን።
  `.trim();

  useEffect(() => {
    announce(
      language === "am"
        ? "እንኳን ደስ አለዎት! ምዝገባዎ ተጠናቋል።"
        : "Congratulations! Your registration is complete.",
      true
    );
  }, [language, announce]);

  const handleReadSuccess = () => {
    if (isPlayingAudio) {
      stopAudio();
    } else {
      speakText(spokenSuccessAmharic);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 py-6 animate-in zoom-in-95 duration-300">
      {/* Top Banner */}
      <div className="text-center space-y-3">
        <div className="inline-flex items-center justify-center size-16 rounded-full bg-success/10 text-success border-2 border-success/30 shadow-sm">
          <CheckCircle2 className="size-10" />
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
          {language === "am"
            ? "እንኳን ወደ ክፍት መንገድ በደህና መጡ!"
            : "Welcome to OpenPath!"}
        </h1>
        <p className="text-sm text-muted-foreground max-w-lg mx-auto">
          {language === "am"
            ? "ምዝገባዎ በተሳካ ሁኔታ ተጠናቋል። ከስር የተዘጋጀውን የተማሪ ካርድዎን ይመልከቱ ወይም በድምፅ ያዳምጡ።"
            : "Your registration has been successfully verified. View or listen to your official learner card below."}
        </p>

        {/* Listen to Result Button */}
        <div className="pt-2">
          <Button
            type="button"
            onClick={handleReadSuccess}
            variant="outline"
            className="font-bold flex items-center gap-2 mx-auto border-primary/40 text-primary hover:bg-primary/10"
          >
            <Volume2 className="size-4" />
            <span>
              {isPlayingAudio
                ? language === "am" ? "ድምፁን አቁም" : "Stop Audio"
                : language === "am" ? "ማረጋገጫውን በድምፅ ያዳምጡ" : "Listen to Confirmation"}
            </span>
          </Button>
        </div>
      </div>

      {/* Official OpenPath Learner ID Card */}
      <div
        id="learner-card-print"
        className="p-6 sm:p-8 rounded-2xl border-4 border-primary bg-surface shadow-xl relative overflow-hidden"
      >
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border pb-4">
          <div className="flex items-center gap-3">
            <div className="size-12 rounded-xl bg-primary text-primary-foreground font-black text-2xl flex items-center justify-center shadow-md">
              OP
            </div>
            <div>
              <div className="font-extrabold text-xl tracking-tight">OpenPath Learner Card</div>
              <div className="text-xs text-muted-foreground">
                {language === "am" ? "አካታችና ተደራሽ የተማሪ መታወቂያ" : "Inclusive Accessible Student ID"}
              </div>
            </div>
          </div>

          <div className="text-left sm:text-right">
            <div className="text-xs text-muted-foreground">Student ID / የተማሪ መለያ</div>
            <div className="text-lg font-mono font-black text-primary">{studentId}</div>
          </div>
        </div>

        {/* Card Body */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 my-6">
          <div className="space-y-3">
            <div>
              <span className="text-xs text-muted-foreground block">
                {language === "am" ? "የተማሪው ሙሉ ስም" : "Learner Full Name"}
              </span>
              <span className="text-lg font-bold text-foreground block">
                {profile.fullNameAmharic || profile.fullNameEnglish || "ክፍት መንገድ ተማሪ"}
              </span>
              {profile.fullNameEnglish && (
                <span className="text-xs text-muted-foreground">{profile.fullNameEnglish}</span>
              )}
            </div>

            <div>
              <span className="text-xs text-muted-foreground block">
                {language === "am" ? "መኖሪያ አካባቢ" : "Location / Region"}
              </span>
              <span className="text-sm font-semibold text-foreground">
                {profile.currentRegion || "ኢትዮጵያ"}
              </span>
            </div>

            <div>
              <span className="text-xs text-muted-foreground block">
                {language === "am" ? "የትምህርት ዘርፍ" : "Enrolled Program"}
              </span>
              <span className="text-sm font-semibold text-foreground">
                {profile.primaryLearningGoal || "ዲጂታልና የሙያ ክህሎት"}
              </span>
            </div>
          </div>

          {/* Assigned Accessibility Advisor */}
          <div className="p-4 rounded-xl border-2 border-primary/20 bg-primary/5 space-y-2.5">
            <div className="flex items-center gap-2 text-xs font-bold text-primary">
              <UserCheck className="size-4" />
              <span>
                {language === "am" ? "የተመደበልዎ የተደራሽነት አማካሪ" : "Assigned Support Specialist"}
              </span>
            </div>
            <div className="font-bold text-sm text-foreground">{advisor.name}</div>
            <div className="text-xs text-muted-foreground">{advisor.role}</div>
            <div className="pt-2 flex items-center gap-2 text-xs font-mono font-bold text-primary">
              <Phone className="size-3.5" />
              <span>{advisor.contactPhone}</span>
            </div>
            <p className="text-[11px] text-muted-foreground pt-1">
              {language === "am"
                ? "አማካሪዎ በማንኛውም ጊዜ በስልክ ጥሪ ወይም በድምፅ መልዕክት ያገኝዎታል።"
                : "Your dedicated accessibility specialist will reach out by phone or voice message."}
            </p>
          </div>
        </div>

        {/* Card Footer */}
        <div className="pt-4 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="size-4 text-success" />
            <span>WCAG 2.2 AA Verified Enrollment</span>
          </div>
          <div className="font-mono">Recovery Code: {recoveryCode}</div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => window.print()}
          className="flex items-center gap-2"
        >
          <Printer className="size-4" />
          <span>{language === "am" ? "ካርዱን አትም / አስቀምጥ" : "Print / Save Card"}</span>
        </Button>

        <Button
          type="button"
          onClick={restartFresh}
          className="flex items-center gap-2 font-bold"
        >
          <RotateCcw className="size-4" />
          <span>{language === "am" ? "አዲስ ምዝገባ ጀምር" : "Start New Registration"}</span>
        </Button>
      </div>
    </div>
  );
}
