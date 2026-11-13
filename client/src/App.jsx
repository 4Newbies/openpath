import React, { useState } from "react";
import { AccessibilityProvider, useAccessibility } from "./context/AccessibilityContext";
import { VoiceProvider } from "./context/VoiceContext";
import { OnboardingProvider, useOnboarding } from "./context/OnboardingContext";

import { Header } from "./components/layout/Header";
import { AccessibilityBar } from "./components/layout/AccessibilityBar";
import { ScreenReaderAnnouncer } from "./components/layout/ScreenReaderAnnouncer";
import { StepProgress } from "./components/onboarding/StepProgress";

import { Step1LanguageAccess } from "./components/onboarding/Step1LanguageAccess";
import { Step2Identification } from "./components/onboarding/Step2Identification";
import { Step3Contact } from "./components/onboarding/Step3Contact";
import { Step4Education } from "./components/onboarding/Step4Education";
import { Step5Accommodations } from "./components/onboarding/Step5Accommodations";
import { Step6Review } from "./components/onboarding/Step6Review";
import { SuccessConfirmation } from "./components/onboarding/SuccessConfirmation";

import { SaveProgressModal } from "./components/modals/SaveProgressModal";
import { ResumeModal } from "./components/modals/ResumeModal";
import { SupportRequestModal } from "./components/modals/SupportRequestModal";
import { ScreenReaderTesterModal } from "./components/modals/ScreenReaderTesterModal";

function OnboardingWizardContent() {
  const { language } = useAccessibility();
  const { currentStepIndex, isCompleted } = useOnboarding();
  const [isAccessDrawerOpen, setIsAccessDrawerOpen] = useState(false);

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground transition-colors">
      {/* WCAG Screen Reader Announcer & Skip Link */}
      <ScreenReaderAnnouncer />

      {/* Main Header */}
      <Header onToggleAccessibilityDrawer={() => setIsAccessDrawerOpen((prev) => !prev)} />

      {/* Accessible Preference Settings Drawer */}
      <AccessibilityBar
        isOpen={isAccessDrawerOpen}
        onClose={() => setIsAccessDrawerOpen(false)}
      />

      {/* Primary Semantic Container */}
      <main
        id="main-question-content"
        tabIndex="-1"
        className="flex-1 max-w-4xl w-full mx-auto px-4 py-6 sm:px-6 outline-none"
      >
        {isCompleted ? (
          <SuccessConfirmation />
        ) : (
          <div className="space-y-6">
            {/* Step Progress & Breadcrumbs */}
            <StepProgress />

            {/* Active One-Question-At-A-Time Step Card */}
            <section
              aria-label={
                language === "am"
                  ? `የምዝገባ ደረጃ ${currentStepIndex + 1}`
                  : `Onboarding Step ${currentStepIndex + 1}`
              }
              className="p-4 sm:p-8 rounded-2xl border-2 border-border bg-card shadow-sm transition-all"
            >
              {currentStepIndex === 0 && <Step1LanguageAccess />}
              {currentStepIndex === 1 && <Step2Identification />}
              {currentStepIndex === 2 && <Step3Contact />}
              {currentStepIndex === 3 && <Step4Education />}
              {currentStepIndex === 4 && <Step5Accommodations />}
              {currentStepIndex === 5 && <Step6Review />}
            </section>
          </div>
        )}
      </main>

      {/* Accessible Footer with Keyboard Shortcuts Legend */}
      <footer className="border-t border-border bg-surface py-6 px-4 text-xs text-muted-foreground mt-auto">
        <div className="max-w-4xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="text-center md:text-left space-y-1">
            <div className="font-bold text-foreground">
              OpenPath Inclusive Education Initiative
            </div>
            <p>
              {language === "am"
                ? "ለሁሉም የተዘጋጀ፡ ለማየት እክል ላለባቸው፣ ለስደተኞች፣ እና ለአማርኛ ተናጋሪዎች።"
                : "Designed for blind, visually impaired, refugees, and Amharic voice-assisted learners."}
            </p>
          </div>

          {/* Quick Keyboard Shortcuts Legend */}
          <div
            aria-label="Keyboard Shortcuts Legend"
            className="flex flex-wrap items-center justify-center gap-2 font-mono text-[11px]"
          >
            <span className="px-1.5 py-0.5 rounded bg-surface-secondary border border-border">
              <kbd>Alt+R</kbd> Listen
            </span>
            <span className="px-1.5 py-0.5 rounded bg-surface-secondary border border-border">
              <kbd>Alt+V</kbd> Voice
            </span>
            <span className="px-1.5 py-0.5 rounded bg-surface-secondary border border-border">
              <kbd>Alt+S</kbd> Save
            </span>
            <span className="px-1.5 py-0.5 rounded bg-surface-secondary border border-border">
              <kbd>Alt+H</kbd> Help
            </span>
            <span className="px-1.5 py-0.5 rounded bg-surface-secondary border border-border">
              <kbd>Alt+L</kbd> Lang
            </span>
          </div>
        </div>
      </footer>

      {/* Modals */}
      <SaveProgressModal />
      <ResumeModal />
      <SupportRequestModal />
      <ScreenReaderTesterModal />
    </div>
  );
}

export function App() {
  return (
    <AccessibilityProvider>
      <VoiceProvider>
        <OnboardingProvider>
          <OnboardingWizardContent />
        </OnboardingProvider>
      </VoiceProvider>
    </AccessibilityProvider>
  );
}

export default App;
