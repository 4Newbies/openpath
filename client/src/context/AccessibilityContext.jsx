// ==============================================================================
// Accessibility Context - WCAG 2.2 AA High Contrast, Font Scaling & ARIA Logs
// ==============================================================================

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";

const AccessibilityContext = createContext(null);

export const FONT_SIZES = {
  normal: { label: "መደበኛ (Normal)", scale: "text-base", htmlSize: "16px" },
  large: { label: "ትልቅ (Large)", scale: "text-lg", htmlSize: "19px" },
  extraLarge: { label: "በጣም ትልቅ (Extra Large)", scale: "text-xl", htmlSize: "22px" },
  maximum: { label: "ከፍተኛ (Maximum)", scale: "text-2xl", htmlSize: "26px" },
};

export const CONTRAST_MODES = {
  default: { label: "መደበኛ (Default Light/Dark)", id: "default" },
  highContrastDark: { label: "ከፍተኛ ንፅፅር - ጥቁር (High Contrast Dark)", id: "contrast-high-dark" },
  highContrastLight: { label: "ከፍተኛ ንፅፅር - ነጭ (High Contrast Light)", id: "contrast-high-light" },
  yellowOnBlack: { label: "ቢጫ በጥቁር ላይ (Yellow on Black - Low Vision)", id: "contrast-yellow-black" },
};

export function AccessibilityProvider({ children }) {
  // Accessibility state
  const [language, setLanguage] = useState(() => localStorage.getItem("openpath_lang") || "am"); // "am" | "en"
  const [contrastMode, setContrastMode] = useState(() => localStorage.getItem("openpath_contrast") || "default");
  const [fontSize, setFontSize] = useState(() => localStorage.getItem("openpath_fontSize") || "normal");
  const [screenReaderMode, setScreenReaderMode] = useState(() => localStorage.getItem("openpath_screenReader") === "true");
  const [autoReadAloud, setAutoReadAloud] = useState(() => localStorage.getItem("openpath_autoRead") !== "false");
  const [speechRate, setSpeechRate] = useState(() => Number(localStorage.getItem("openpath_speechRate")) || 1.0);
  const [voiceModel, setVoiceModel] = useState(() => localStorage.getItem("openpath_voiceModel") || "Addis-Selam-Neural"); // Addis-Selam-Neural | Addis-Dawit-Neural

  // ARIA Live Announcements
  const [politeAnnouncement, setPoliteAnnouncement] = useState("");
  const [assertiveAnnouncement, setAssertiveAnnouncement] = useState("");
  const [announcementHistory, setAnnouncementHistory] = useState([]);
  const [isDiagnosticOpen, setIsDiagnosticOpen] = useState(false);

  // Announce to screen reader
  const announce = useCallback((message, isAssertive = false) => {
    if (!message) return;
    const item = {
      id: Date.now(),
      message,
      type: isAssertive ? "assertive" : "polite",
      timestamp: new Date().toLocaleTimeString(),
    };

    if (isAssertive) {
      setAssertiveAnnouncement("");
      setTimeout(() => setAssertiveAnnouncement(message), 50);
    } else {
      setPoliteAnnouncement("");
      setTimeout(() => setPoliteAnnouncement(message), 50);
    }

    setAnnouncementHistory((prev) => [item, ...prev.slice(0, 49)]);
  }, []);

  // Sync HTML font size and contrast classes
  useEffect(() => {
    const root = document.documentElement;
    root.style.fontSize = FONT_SIZES[fontSize]?.htmlSize || "16px";
    localStorage.setItem("openpath_fontSize", fontSize);
  }, [fontSize]);

  useEffect(() => {
    const root = document.documentElement;
    // Remove all contrast classes
    Object.values(CONTRAST_MODES).forEach((mode) => {
      if (mode.id !== "default") {
        root.classList.remove(mode.id);
      }
    });

    if (contrastMode !== "default") {
      root.classList.add(contrastMode);
    }
    localStorage.setItem("openpath_contrast", contrastMode);
  }, [contrastMode]);

  useEffect(() => {
    localStorage.setItem("openpath_lang", language);
  }, [language]);

  useEffect(() => {
    localStorage.setItem("openpath_screenReader", screenReaderMode);
  }, [screenReaderMode]);

  useEffect(() => {
    localStorage.setItem("openpath_autoRead", autoReadAloud);
  }, [autoReadAloud]);

  useEffect(() => {
    localStorage.setItem("openpath_speechRate", speechRate);
  }, [speechRate]);

  useEffect(() => {
    localStorage.setItem("openpath_voiceModel", voiceModel);
  }, [voiceModel]);

  // Global accessibility shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't intercept if user is typing in form inputs, unless using Alt modifier
      if (e.altKey) {
        if (e.key.toLowerCase() === "l") {
          e.preventDefault();
          setLanguage((prev) => {
            const next = prev === "am" ? "en" : "am";
            announce(next === "am" ? "ቋንቋ ወደ አማርኛ ተቀይሯል" : "Language switched to English");
            return next;
          });
        }
        if (e.key.toLowerCase() === "t") {
          e.preventDefault();
          setIsDiagnosticOpen((prev) => !prev);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [announce]);

  return (
    <AccessibilityContext.Provider
      value={{
        language,
        setLanguage,
        contrastMode,
        setContrastMode,
        fontSize,
        setFontSize,
        screenReaderMode,
        setScreenReaderMode,
        autoReadAloud,
        setAutoReadAloud,
        speechRate,
        setSpeechRate,
        voiceModel,
        setVoiceModel,
        politeAnnouncement,
        assertiveAnnouncement,
        announcementHistory,
        announce,
        isDiagnosticOpen,
        setIsDiagnosticOpen,
      }}
    >
      {children}
    </AccessibilityContext.Provider>
  );
}

export function useAccessibility() {
  const context = useContext(AccessibilityContext);
  if (!context) {
    throw new Error("useAccessibility must be used within an AccessibilityProvider");
  }
  return context;
}
