// ==============================================================================
// Screen Reader Announcer & Skip Link (WCAG 2.2 AA Criteria 2.4.1 & 4.1.3)
// ==============================================================================

import React from "react";
import { useAccessibility } from "../../context/AccessibilityContext";

export function ScreenReaderAnnouncer() {
  const { politeAnnouncement, assertiveAnnouncement, language } = useAccessibility();

  return (
    <>
      {/* Skip to Main Content Link for Keyboard and Screen Reader Users */}
      <a
        href="#main-question-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-3 focus:bg-primary focus:text-primary-foreground focus:rounded-md focus:shadow-xl focus:font-bold focus:outline-none focus:ring-4 focus:ring-focus"
      >
        {language === "am" ? "ወደ ዋናው የጥያቄ ይዘት ዝለል (Skip to main question)" : "Skip to main question content"}
      </a>

      {/* ARIA Live Regions */}
      <div
        id="openpath-polite-announcer"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {politeAnnouncement}
      </div>

      <div
        id="openpath-assertive-announcer"
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
        className="sr-only"
      >
        {assertiveAnnouncement}
      </div>
    </>
  );
}
