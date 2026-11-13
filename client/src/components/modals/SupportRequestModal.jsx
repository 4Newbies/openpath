// ==============================================================================
// Private Support Request Modal - Confidential Help with Voice Notes
// ==============================================================================

import React, { useState } from "react";
import { useAccessibility } from "../../context/AccessibilityContext";
import { useOnboarding } from "../../context/OnboardingContext";
import { useVoice } from "../../context/VoiceContext";
import { api } from "../../services/api";
import { Button } from "../ui/button";
import {
  HelpCircle,
  X,
  Mic,
  MicOff,
  CheckCircle2,
  Loader2,
  ShieldAlert,
  Send,
  FileQuestion,
  Headphones,
} from "lucide-react";

export function SupportRequestModal() {
  const { language, announce } = useAccessibility();
  const { isSupportModalOpen, setIsSupportModalOpen, userId, sessionId } = useOnboarding();
  const { startRecording, stopRecording, isRecording, isProcessingSTT } = useVoice();

  const [category, setCategory] = useState("DOCUMENT_VERIFICATION_HELP");
  const [message, setMessage] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [isVoiceNoteRecorded, setIsVoiceNoteRecorded] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmittedSuccess, setIsSubmittedSuccess] = useState(false);

  if (!isSupportModalOpen) return null;

  const handleRecordVoiceNote = () => {
    if (isRecording) {
      stopRecording();
      setIsVoiceNoteRecorded(true);
      announce(language === "am" ? "የድምፅ መልዕክት ተቀርጿል" : "Voice note recorded");
    } else {
      startRecording("support_voice_note", "support", (text) => {
        setMessage((prev) => (prev ? `${prev}\n${text}` : text));
        setIsVoiceNoteRecorded(true);
      });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!message.trim() && !isVoiceNoteRecorded) {
      announce(
        language === "am"
          ? "እባክዎ የመልዕክት ጽሑፍ ወይም የድምፅ ማስታወሻ ያቅርቡ"
          : "Please provide a message or record a voice note",
        true
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await api.submitSupportRequest({
        userId,
        sessionId,
        category,
        message,
        contactPhone,
        hasVoiceNote: isVoiceNoteRecorded,
      });

      if (res.success) {
        setIsSubmittedSuccess(true);
        announce(
          language === "am"
            ? "የሚስጥር እርዳታ ጥያቄዎ ደርሷል። በቅርቡ እናገኝዎታለን።"
            : "Support request submitted. An advisor will contact you soon."
        );
      }
    } catch (err) {
      console.error("Support submission failed:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="support-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
    >
      <div className="w-full max-w-lg p-6 rounded-2xl border-2 border-destructive/60 bg-surface shadow-2xl space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b border-border">
          <div className="flex items-center gap-2 text-destructive font-bold">
            <HelpCircle className="size-5" />
            <h3 id="support-modal-title" className="text-base font-bold text-foreground">
              {language === "am" ? "የግልና ሚስጥራዊ የእርዳታ ጥያቄ" : "Confidential Support Request"}
            </h3>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setIsSupportModalOpen(false);
              setIsSubmittedSuccess(false);
            }}
            aria-label="ዝጋ"
          >
            <X className="size-4" />
          </Button>
        </div>

        {isSubmittedSuccess ? (
          <div className="text-center py-6 space-y-3">
            <div className="size-14 rounded-full bg-success/10 text-success flex items-center justify-center mx-auto">
              <CheckCircle2 className="size-8" />
            </div>
            <h4 className="text-lg font-bold">
              {language === "am" ? "ጥያቄዎ ደርሶናል!" : "Request Received!"}
            </h4>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              {language === "am"
                ? "የተደራሽነት አማካሪያችን መረጃዎን በሚስጥር ተመልክቶ በስልክ ወይም በድምፅ ጥሪ ያገኝዎታል።"
                : "An OpenPath accessibility advisor will review your request confidentially and reach out."}
            </p>
            <Button
              className="mt-4 font-bold"
              onClick={() => {
                setIsSupportModalOpen(false);
                setIsSubmittedSuccess(false);
              }}
            >
              {language === "am" ? "ወደ ምዝገባው ተመለስ" : "Return to Registration"}
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="text-xs text-muted-foreground">
              {language === "am"
                ? "ሰነድ በማግኘት፣ በንባብ፣ በድምፅ ወይም በሌላ የተደራሽነት እንቅፋት ምክንያት እርዳታ ከፈለጉ በቀጥታ ለአማካሪ መልዕክት ይላኩ፡"
                : "Need help with identification papers, reading, Amharic voice assistance, or physical barriers? Submit a confidential request directly to our counselors:"}
            </p>

            {/* Category */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-foreground">
                {language === "am" ? "የእርዳታው አይነት" : "Assistance Category"}
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full h-11 px-3 rounded-lg border border-input bg-background text-xs focus:ring-2 focus:ring-primary focus:outline-none"
              >
                <option value="DOCUMENT_VERIFICATION_HELP">
                  {language === "am"
                    ? "የስደተኞች ወይም የመታወቂያ ሰነድ እርዳታ (Refugee ID Assistance)"
                    : "Refugee / Alternative ID Documentation Help"}
                </option>
                <option value="AMHARIC_VOICE_ASSISTANCE">
                  {language === "am"
                    ? "የአማርኛ ድምፅና የንግግር እገዛ (Amharic Voice Assistance)"
                    : "Amharic Voice & Audio Support"}
                </option>
                <option value="READING_ASSISTANCE">
                  {language === "am"
                    ? "የንባብ ችግር እገዛ (Reading / Literacy Support)"
                    : "Reading Difficulties & Audio Guidance"}
                </option>
                <option value="CONFIDENTIAL_COUNSELOR_REQUEST">
                  {language === "am"
                    ? "ከግል አማካሪ ጋር በስልክ ለመነጋገር (Counselor Phone Callback)"
                    : "Request Direct Advisor Phone Callback"}
                </option>
              </select>
            </div>

            {/* Message Area with Voice Note recording */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="supportMessage" className="text-xs font-bold text-foreground">
                  {language === "am" ? "መልዕክትዎ (በጽሑፍ ወይም በድምፅ)" : "Your Message or Voice Note"}
                </label>
                <Button
                  type="button"
                  variant={isRecording ? "destructive" : "outline"}
                  size="sm"
                  onClick={handleRecordVoiceNote}
                  disabled={isProcessingSTT}
                  className="text-xs flex items-center gap-1.5 border-destructive/40"
                >
                  {isRecording ? <MicOff className="size-3.5" /> : <Mic className="size-3.5 text-destructive" />}
                  <span>
                    {isRecording
                      ? language === "am" ? "መቅረጽ አቁም" : "Stop Recording"
                      : language === "am" ? "የድምፅ መልዕክት ቅረጽ" : "Record Voice Note"}
                  </span>
                </Button>
              </div>

              <textarea
                id="supportMessage"
                rows={3}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={
                  language === "am"
                    ? "የሚያጋጥምዎትን ችግር እዚህ ይግለጹ ወይም 'የድምፅ መልዕክት ቅረጽ' የሚለውን ይጫኑ..."
                    : "Describe what you need help with, or record a voice message..."
                }
                className="w-full p-3 rounded-lg border border-input bg-background text-xs focus:ring-2 focus:ring-primary focus:outline-none"
              />
              {isVoiceNoteRecorded && (
                <div className="text-[11px] text-success font-semibold flex items-center gap-1">
                  <CheckCircle2 className="size-3.5" />
                  <span>
                    {language === "am"
                      ? "የድምፅ መልዕክት ተያይዟል (Addis Scribe የተረጎመው ጽሑፍ)"
                      : "Voice note transcribed & attached to request"}
                  </span>
                </div>
              )}
            </div>

            {/* Callback Phone */}
            <div className="space-y-1.5">
              <label htmlFor="supportPhone" className="block text-xs font-bold text-foreground">
                {language === "am" ? "እርስዎን የምናገኝበት ስልክ ቁጥር" : "Callback Phone Number"}
              </label>
              <input
                id="supportPhone"
                type="tel"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                placeholder="09..."
                className="w-full h-11 px-3 rounded-lg border border-input bg-background text-xs font-mono focus:ring-2 focus:ring-primary focus:outline-none"
              />
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsSupportModalOpen(false)}
              >
                {language === "am" ? "ሰርዝ" : "Cancel"}
              </Button>

              <Button
                type="submit"
                disabled={isSubmitting}
                className="font-bold flex items-center gap-1.5 bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    <span>{language === "am" ? "በመላክ ላይ..." : "Sending..."}</span>
                  </>
                ) : (
                  <>
                    <Send className="size-4" />
                    <span>{language === "am" ? "ጥያቄውን ላክ" : "Submit Request"}</span>
                  </>
                )}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
