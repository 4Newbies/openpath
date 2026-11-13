// ==============================================================================
// Accessible Step Progress Indicator (WCAG 2.2 AA Criteria 1.3.1 & 3.2.4)
// ==============================================================================

import React from "react";
import { useAccessibility } from "../../context/AccessibilityContext";
import { useOnboarding } from "../../context/OnboardingContext";
import { Check } from "lucide-react";

export function StepProgress() {
  const { language } = useAccessibility();
  const { currentStepIndex, totalSteps, stepsData, goToStep } = useOnboarding();

  const currentStep = stepsData[currentStepIndex] || {};
  const currentTitle = language === "am" ? currentStep.titleAmharic : currentStep.titleEnglish;
  const progressPercent = Math.round(((currentStepIndex + 1) / totalSteps) * 100);

  return (
    <nav
      aria-label={language === "am" ? "የምዝገባ ደረጃዎች እና ሂደት" : "Onboarding progress"}
      className="mb-6 p-4 rounded-xl border border-border bg-surface shadow-sm"
    >
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mb-3">
        {/* Current Step Label */}
        <div>
          <span className="text-xs uppercase font-extrabold tracking-wider text-primary">
            {language === "am"
              ? `ጥያቄ ${currentStepIndex + 1} ከ ${totalSteps}`
              : `Question ${currentStepIndex + 1} of ${totalSteps}`}
          </span>
          <h2 className="text-base sm:text-lg font-bold text-foreground">
            {currentTitle || (language === "am" ? "ምዝገባ" : "Registration")}
          </h2>
        </div>

        {/* Progress Percentage Badge */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono font-bold px-2 py-1 rounded bg-primary/10 text-primary border border-primary/20">
            {progressPercent}% {language === "am" ? "ተጠናቋል" : "Completed"}
          </span>
        </div>
      </div>

      {/* Accessible Progress Bar */}
      <div
        role="progressbar"
        aria-valuenow={currentStepIndex + 1}
        aria-valuemin="1"
        aria-valuemax={totalSteps}
        aria-valuetext={`${language === "am" ? "ጥያቄ" : "Question"} ${currentStepIndex + 1} ${language === "am" ? "ከ" : "of"} ${totalSteps} - ${currentTitle}`}
        className="w-full h-3 rounded-full bg-surface-secondary border border-border overflow-hidden relative"
      >
        <div
          className="h-full bg-primary transition-all duration-300 rounded-full"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Step Bubbles (Clickable for Completed or Visited Steps) */}
      <ol className="flex items-center justify-between mt-3 gap-1 overflow-x-auto py-1">
        {Array.from({ length: totalSteps }).map((_, idx) => {
          const isCompleted = idx < currentStepIndex;
          const isCurrent = idx === currentStepIndex;
          const stepInfo = stepsData[idx] || {};
          const stepName = language === "am" ? stepInfo.titleAmharic : stepInfo.titleEnglish;

          return (
            <li key={idx} className="flex-1 min-w-[2.5rem]">
              <button
                type="button"
                disabled={idx > currentStepIndex}
                onClick={() => goToStep(idx)}
                title={`${idx + 1}. ${stepName || ""}`}
                aria-current={isCurrent ? "step" : undefined}
                className={`w-full py-1.5 px-1 rounded-md text-xs font-bold flex items-center justify-center gap-1 border transition-all ${
                  isCurrent
                    ? "border-primary bg-primary text-primary-foreground shadow-sm ring-2 ring-primary/40"
                    : isCompleted
                      ? "border-success bg-success/10 text-success hover:bg-success/20 cursor-pointer"
                      : "border-border text-muted-foreground opacity-50 cursor-not-allowed"
                }`}
              >
                {isCompleted ? <Check className="size-3.5 shrink-0" /> : idx + 1}
                <span className="hidden md:inline truncate text-[11px]">
                  {idx === 0
                    ? language === "am" ? "ተደራሽነት" : "Access"
                    : idx === 1
                      ? language === "am" ? "ማንነት" : "Identity"
                      : idx === 2
                        ? language === "am" ? "መገናኛ" : "Contact"
                        : idx === 3
                          ? language === "am" ? "ትምህርት" : "Education"
                          : idx === 4
                            ? language === "am" ? "ድጋፍ" : "Needs"
                            : language === "am" ? "ማጠቃለያ" : "Review"}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
