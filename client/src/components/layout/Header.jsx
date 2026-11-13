// ==============================================================================
// Accessible Header Component - OpenPath Navigation & Accessibility Controls
// ==============================================================================

import React, { useState } from "react";
import { useAccessibility } from "../../context/AccessibilityContext";
import { useOnboarding } from "../../context/OnboardingContext";
import { Button } from "../ui/button";
import {
  Globe,
  Settings,
  HelpCircle,
  Save,
  FolderOpen,
  Volume2,
  FileCode,
  Shield,
} from "lucide-react";

export function Header({ onToggleAccessibilityDrawer }) {
  const { language, setLanguage, setIsDiagnosticOpen, isDiagnosticOpen } = useAccessibility();
  const { setIsSaveModalOpen, setIsResumeModalOpen, setIsSupportModalOpen } = useOnboarding();

  const toggleLanguage = () => {
    setLanguage((prev) => (prev === "am" ? "en" : "am"));
  };

  return (
    <header className="border-b border-border bg-surface sticky top-0 z-40 transition-colors shadow-sm">
      <div className="max-w-5xl mx-auto px-4 py-3 sm:px-6 flex flex-wrap items-center justify-between gap-3">
        {/* Brand & Mission Badge */}
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center size-10 rounded-lg bg-primary text-primary-foreground font-black text-xl shadow-md">
            OP
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-lg sm:text-xl tracking-tight">OpenPath</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 font-medium">
                {language === "am" ? "አካታች ምዝገባ" : "Inclusive Registration"}
              </span>
            </div>
            <p className="text-xs text-muted-foreground hidden sm:block">
              {language === "am"
                ? "ተደራሽ፣ የድምፅ እገዛ ያለው እና ለሁሉም ክፍት የሆነ የመማሪያ መድረክ"
                : "WCAG 2.2 AA Accessible & Voice-Assisted Platform"}
            </p>
          </div>
        </div>

        {/* Global Action Toolbar */}
        <div className="flex items-center flex-wrap gap-2">
          {/* Save & Resume Later */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsSaveModalOpen(true)}
            className="flex items-center gap-1.5"
            aria-label={language === "am" ? "የምዝገባ እድገትን አስቀምጥ" : "Save onboarding progress"}
          >
            <Save className="size-4" />
            <span className="hidden md:inline">
              {language === "am" ? "አስቀምጥ" : "Save Progress"}
            </span>
          </Button>

          {/* Resume Previous Session */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsResumeModalOpen(true)}
            className="flex items-center gap-1.5"
            aria-label={language === "am" ? "የቀድሞ ክፍለ ጊዜን ቀጥል" : "Resume session"}
          >
            <FolderOpen className="size-4" />
            <span className="hidden md:inline">
              {language === "am" ? "ቀጥል" : "Resume"}
            </span>
          </Button>

          {/* Language Switcher */}
          <Button
            variant="outline"
            size="sm"
            onClick={toggleLanguage}
            className="font-medium flex items-center gap-1.5 border-primary/40"
            aria-label={language === "am" ? "Switch language to English (Alt+L)" : "ቋንቋ ወደ አማርኛ ቀይር (Alt+L)"}
          >
            <Globe className="size-4 text-primary" />
            <span>{language === "am" ? "English" : "አማርኛ"}</span>
          </Button>

          {/* Accessibility Settings Toggle */}
          <Button
            variant="outline"
            size="sm"
            onClick={onToggleAccessibilityDrawer}
            className="flex items-center gap-1.5"
            aria-label={language === "am" ? "የተደራሽነት ማስተካከያ (Alt+A)" : "Accessibility Preferences (Alt+A)"}
          >
            <Settings className="size-4" />
            <span className="hidden sm:inline">
              {language === "am" ? "ተደራሽነት" : "Accessibility"}
            </span>
          </Button>

          {/* Screen Reader Diagnostic Log */}
          <Button
            variant={isDiagnosticOpen ? "default" : "outline"}
            size="sm"
            onClick={() => setIsDiagnosticOpen((prev) => !prev)}
            className="flex items-center gap-1.5"
            title="Screen Reader Inspector (Alt+T)"
            aria-label="WCAG 2.2 AA Screen reader audit log"
          >
            <FileCode className="size-4" />
            <span className="hidden lg:inline">WCAG Audit</span>
          </Button>

          {/* Private Support Button */}
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setIsSupportModalOpen(true)}
            className="flex items-center gap-1.5 font-medium shadow-sm"
            aria-label={language === "am" ? "የግል እርዳታ ይጠይቁ (Alt+H)" : "Request private support (Alt+H)"}
          >
            <HelpCircle className="size-4" />
            <span>{language === "am" ? "እርዳታ" : "Need Help"}</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
