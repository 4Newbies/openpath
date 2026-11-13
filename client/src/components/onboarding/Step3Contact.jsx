// ==============================================================================
// Step 3: Safe Contact & Communication Methods
// ==============================================================================

import React, { useState } from "react";
import { useAccessibility } from "../../context/AccessibilityContext";
import { useOnboarding } from "../../context/OnboardingContext";
import { useVoice } from "../../context/VoiceContext";
import { VoiceAssistantBar } from "../voice/VoiceAssistantBar";
import { Button } from "../ui/button";
import { Phone, MessageSquare, Send, Users, ArrowRight, ArrowLeft, Mic } from "lucide-react";

export function Step3Contact() {
  const { language, announce } = useAccessibility();
  const { saveCurrentStep, goToPreviousStep, stepsData, isLoading, answers } = useOnboarding();
  const { startRecording, isRecording, isProcessingSTT } = useVoice();
  const stepInfo = stepsData[2] || {};

  const saved = answers.contact || {};

  const [phoneNumber, setPhoneNumber] = useState(saved.phoneNumber || "");
  const [preferredContactMethod, setPreferredContactMethod] = useState(saved.preferredContactMethod || "PHONE_CALL");
  const [telegramHandle, setTelegramHandle] = useState(saved.telegramHandle || "");
  const [trustedContactName, setTrustedContactName] = useState(saved.trustedContactName || "");
  const [trustedContactPhone, setTrustedContactPhone] = useState(saved.trustedContactPhone || "");

  const handleVoicePhone = () => {
    startRecording("phoneNumber", "preferredContactMethod", (text) => {
      // Extract numbers or text
      setPhoneNumber(text);
      announce(`ስልክ ቁጥር ተመዝግቧል፡ ${text}`);
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!phoneNumber.trim() && !telegramHandle.trim() && !trustedContactPhone.trim()) {
      announce(
        language === "am"
          ? "እባክዎ ቢያንስ አንድ የመገናኛ ስልክ ቁጥር ወይም የቴሌግራም መለያ ያስገቡ"
          : "Please provide at least one phone number, Telegram handle, or advocate contact",
        true
      );
      return;
    }

    const payload = {
      phoneNumber: phoneNumber.trim(),
      preferredContactMethod,
      telegramHandle: telegramHandle.trim(),
      trustedContactName: trustedContactName.trim(),
      trustedContactPhone: trustedContactPhone.trim(),
    };

    saveCurrentStep("contact", payload);
  };

  return (
    <div className="space-y-6">
      <VoiceAssistantBar
        questionTitle={language === "am" ? stepInfo.titleAmharic : stepInfo.titleEnglish}
        questionPrompt={language === "am" ? stepInfo.promptAmharic : stepInfo.promptEnglish}
        activeFieldHint="preferredContactMethod"
      />

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Preferred Communication Method */}
        <fieldset className="p-4 sm:p-5 rounded-xl border border-border bg-surface space-y-4">
          <legend className="px-2 text-sm font-bold flex items-center gap-1.5 text-primary">
            <Phone className="size-4" />
            {language === "am" ? "ተመራጭ የመገናኛ ዘዴ ይምረጡ" : "Choose Preferred Contact Channel"}
          </legend>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              {
                id: "PHONE_CALL",
                icon: Phone,
                titleAmharic: "የቀጥታ ስልክ ጥሪ (የድምፅ)",
                titleEnglish: "Direct Phone Call",
                descAmharic: "ለማየት ወይም ለማንበብ ችግር ላለባቸው ተማሪዎች እጅግ ምቹ",
              },
              {
                id: "SMS",
                icon: MessageSquare,
                titleAmharic: "አጭር የጽሑፍ መልዕክት (SMS)",
                titleEnglish: "SMS Text Message",
                descAmharic: "ፈጣን እና ኢንተርኔት የማይፈልግ መልዕክት",
              },
              {
                id: "TELEGRAM",
                icon: Send,
                titleAmharic: "ቴሌግራም (Telegram)",
                titleEnglish: "Telegram Bot & Messages",
                descAmharic: "የድምፅ ፋይሎችን እና መረጃዎችን በቀላሉ ለመቀበል",
              },
              {
                id: "COMMUNITY_LIAISON",
                icon: Users,
                titleAmharic: "የማህበረሰብ ወይም የታማኝ ሰው ተወካይ",
                titleEnglish: "Community Liaison / Family Advocate",
                descAmharic: "የግል ስልክ ለሌላቸው ወይም በቤተሰብ እርዳታ ለሚማሩ",
              },
            ].map((channel) => {
              const Icon = channel.icon;
              const isSelected = preferredContactMethod === channel.id;
              return (
                <button
                  key={channel.id}
                  type="button"
                  onClick={() => setPreferredContactMethod(channel.id)}
                  className={`p-4 rounded-xl text-left border-2 flex items-start gap-3 transition-all ${
                    isSelected
                      ? "border-primary bg-primary/10 shadow-sm ring-2 ring-primary/30"
                      : "border-border hover:bg-muted"
                  }`}
                >
                  <Icon className={`size-5 mt-0.5 shrink-0 ${isSelected ? "text-primary" : "text-muted-foreground"}`} />
                  <div>
                    <div className="font-bold text-sm text-foreground">
                      {language === "am" ? channel.titleAmharic : channel.titleEnglish}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {channel.descAmharic}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </fieldset>

        {/* Contact Inputs */}
        <div className="p-4 sm:p-5 rounded-xl border border-border bg-surface space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="phoneNumber" className="block text-xs font-semibold text-foreground">
              {language === "am" ? "የስልክ ቁጥርዎ *" : "Phone Number *"}
            </label>
            <div className="flex gap-2">
              <input
                id="phoneNumber"
                type="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="0911000000 ወይም +251 9..."
                className="flex-1 h-11 px-3.5 rounded-lg border border-input bg-background text-sm font-mono focus:ring-2 focus:ring-primary focus:outline-none"
              />
              <Button
                type="button"
                variant="outline"
                onClick={handleVoicePhone}
                disabled={isRecording || isProcessingSTT}
                className="h-11 px-3 text-xs flex items-center gap-1.5 border-primary/40 hover:border-primary"
                aria-label="ስልክ ቁጥርን በድምፅ ይናገሩ"
              >
                <Mic className="size-4 text-primary" />
                <span className="hidden sm:inline">{language === "am" ? "በድምፅ" : "Voice"}</span>
              </Button>
            </div>
          </div>

          {preferredContactMethod === "TELEGRAM" && (
            <div className="space-y-1.5 animate-in fade-in duration-200">
              <label htmlFor="telegramHandle" className="block text-xs font-semibold text-foreground">
                {language === "am" ? "የቴሌግራም መለያ (Telegram Username)" : "Telegram Username"}
              </label>
              <input
                id="telegramHandle"
                type="text"
                value={telegramHandle}
                onChange={(e) => setTelegramHandle(e.target.value)}
                placeholder="@username"
                className="w-full h-11 px-3.5 rounded-lg border border-input bg-background text-sm focus:ring-2 focus:ring-primary focus:outline-none"
              />
            </div>
          )}

          {/* Trusted Family / Community Advocate Option */}
          <div className="pt-3 border-t border-border space-y-3">
            <div className="flex items-center gap-2">
              <Users className="size-4 text-primary" />
              <h4 className="text-xs font-bold text-foreground">
                {language === "am"
                  ? "ታማኝ የቤተሰብ አባል ወይም ማህበረሰብ ተወካይ (አማራጭ)"
                  : "Trusted Family or Community Advocate (Optional)"}
              </h4>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                type="text"
                value={trustedContactName}
                onChange={(e) => setTrustedContactName(e.target.value)}
                placeholder={language === "am" ? "የተወካዩ ስም (ምሳሌ፡ አስቴር አበበ)" : "Advocate name"}
                className="h-11 px-3.5 rounded-lg border border-input bg-background text-sm focus:ring-2 focus:ring-primary focus:outline-none"
              />
              <input
                type="tel"
                value={trustedContactPhone}
                onChange={(e) => setTrustedContactPhone(e.target.value)}
                placeholder={language === "am" ? "የተወካዩ ስልክ ቁጥር" : "Advocate phone number"}
                className="h-11 px-3.5 rounded-lg border border-input bg-background text-sm font-mono focus:ring-2 focus:ring-primary focus:outline-none"
              />
            </div>
          </div>
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
