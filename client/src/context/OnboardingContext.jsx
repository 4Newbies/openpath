// ==============================================================================
// Onboarding Context - One-Question-At-A-Time State & Progress Management
// ==============================================================================

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { api } from "../services/api";
import { useAccessibility } from "./AccessibilityContext";
import { useVoice } from "./VoiceContext";

const OnboardingContext = createContext(null);

export function OnboardingProvider({ children }) {
  const { announce, autoReadAloud, language } = useAccessibility();
  const { speakText } = useVoice();

  const [sessionId, setSessionId] = useState(() => localStorage.getItem("openpath_session_id") || null);
  const [userId, setUserId] = useState(() => localStorage.getItem("openpath_user_id") || null);
  const [recoveryCode, setRecoveryCode] = useState(() => localStorage.getItem("openpath_recovery_code") || "");
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [totalSteps, setTotalSteps] = useState(6);
  const [stepsData, setStepsData] = useState([]);
  const [answers, setAnswers] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [registrationResult, setRegistrationResult] = useState(null);

  // Modals
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [isResumeModalOpen, setIsResumeModalOpen] = useState(false);
  const [isSupportModalOpen, setIsSupportModalOpen] = useState(false);

  // Initialize or fetch steps
  useEffect(() => {
    async function loadSteps() {
      try {
        const res = await api.getSteps();
        if (res.success && res.data?.steps) {
          setStepsData(res.data.steps);
          setTotalSteps(res.data.totalSteps || 6);
        }
      } catch (err) {
        console.error("Failed to load onboarding steps:", err);
      }
    }
    loadSteps();
  }, []);

  // Initialize a session if none exists
  useEffect(() => {
    async function initSession() {
      if (!sessionId) {
        setIsLoading(true);
        try {
          const res = await api.startSession(language === "am" ? "AMHARIC" : "ENGLISH", false);
          if (res.success && res.data) {
            setSessionId(res.data.sessionId);
            setUserId(res.data.userId);
            setRecoveryCode(res.data.recoveryCode);
            localStorage.setItem("openpath_session_id", res.data.sessionId);
            localStorage.setItem("openpath_user_id", res.data.userId);
            localStorage.setItem("openpath_recovery_code", res.data.recoveryCode);
          }
        } catch (err) {
          console.error("Session start error:", err);
        } finally {
          setIsLoading(false);
        }
      }
    }
    initSession();
  }, [sessionId, language]);

  // Read current question aloud when navigating steps if autoReadAloud is enabled
  useEffect(() => {
    if (stepsData.length > 0 && stepsData[currentStepIndex]) {
      const step = stepsData[currentStepIndex];
      const title = language === "am" ? step.titleAmharic : step.titleEnglish;
      const prompt = language === "am" ? step.promptAmharic : step.promptEnglish;

      announce(`ጥያቄ ${currentStepIndex + 1} ከ ${totalSteps}፡ ${title}`, true);

      if (autoReadAloud && !isCompleted) {
        const timer = setTimeout(() => {
          speakText(`${title}። ${prompt}`);
        }, 300);
        return () => clearTimeout(timer);
      }
    }
  }, [currentStepIndex, stepsData, autoReadAloud, language, isCompleted, totalSteps, announce, speakText]);

  /**
   * Save answer for current step and advance to next step
   */
  const saveCurrentStep = useCallback(
    async (stepKey, answerData, answeredViaVoice = false, transcribedText = null) => {
      setIsLoading(true);
      try {
        setAnswers((prev) => ({
          ...prev,
          [stepKey]: answerData,
        }));

        if (sessionId) {
          await api.saveStepAnswer({
            sessionId,
            stepIndex: currentStepIndex,
            stepKey,
            answerData,
            answeredViaVoice,
            transcribedText,
          });
        }

        if (currentStepIndex < totalSteps - 1) {
          setCurrentStepIndex((prev) => prev + 1);
          window.scrollTo({ top: 0, behavior: "smooth" });
        }
      } catch (err) {
        console.error("Failed to save step:", err);
        announce("ምላሹን ማስቀመጥ አልተቻለም። እባክዎ እንደገና ይሞክሩ።", true);
      } finally {
        setIsLoading(false);
      }
    },
    [sessionId, currentStepIndex, totalSteps, announce]
  );

  /**
   * Navigate backwards one step
   */
  const goToPreviousStep = useCallback(() => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex((prev) => prev - 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [currentStepIndex]);

  /**
   * Jump to specific step
   */
  const goToStep = useCallback(
    (index) => {
      if (index >= 0 && index < totalSteps) {
        setCurrentStepIndex(index);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    },
    [totalSteps]
  );

  /**
   * Resume session using 6-character recovery code
   */
  const resumeWithRecoveryCode = useCallback(
    async (code) => {
      setIsLoading(true);
      try {
        const res = await api.resumeSession(code);
        if (res.success && res.data) {
          setSessionId(res.data.sessionId);
          setUserId(res.data.userId);
          setRecoveryCode(res.data.recoveryCode);
          setCurrentStepIndex(res.data.currentStepIndex || 0);
          setIsCompleted(Boolean(res.data.isCompleted));

          // Populate answers
          const answersMap = {};
          if (res.data.answers) {
            res.data.answers.forEach((ans) => {
              answersMap[ans.stepKey] = ans.answerData;
            });
          }
          setAnswers(answersMap);

          localStorage.setItem("openpath_session_id", res.data.sessionId);
          localStorage.setItem("openpath_user_id", res.data.userId);
          localStorage.setItem("openpath_recovery_code", res.data.recoveryCode);

          announce(
            language === "am"
              ? "የቀድሞ የምዝገባ ክፍለ ጊዜዎ በተሳካ ሁኔታ ተመልሷል።"
              : "Previous session successfully restored."
          );
          setIsResumeModalOpen(false);
          return { success: true };
        } else {
          return { success: false, error: res.errorAmharic || res.error };
        }
      } catch (err) {
        return { success: false, error: err.message };
      } finally {
        setIsLoading(false);
      }
    },
    [language, announce]
  );

  /**
   * Finalize registration
   */
  const finalizeRegistration = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await api.completeOnboarding(sessionId);
      if (res.success && res.data) {
        setIsCompleted(true);
        setRegistrationResult(res.data);
        announce(
          language === "am"
            ? "እንኳን ደስ አለዎት! ምዝገባዎ ተጠናቋል። የተማሪ መታወቂያ ካርድዎ ተዘጋጅቷል።"
            : "Congratulations! Your registration is complete. Your student ID is ready.",
          true
        );
      }
    } catch (err) {
      console.error("Finalize registration error:", err);
      announce("ምዝገባን ማጠናቀቅ አልተቻለም።", true);
    } finally {
      setIsLoading(false);
    }
  }, [sessionId, language, announce]);

  /**
   * Reset / Start Fresh
   */
  const restartFresh = useCallback(() => {
    localStorage.removeItem("openpath_session_id");
    localStorage.removeItem("openpath_user_id");
    localStorage.removeItem("openpath_recovery_code");
    setSessionId(null);
    setUserId(null);
    setRecoveryCode("");
    setCurrentStepIndex(0);
    setAnswers({});
    setIsCompleted(false);
    setRegistrationResult(null);
    window.location.reload();
  }, []);

  return (
    <OnboardingContext.Provider
      value={{
        sessionId,
        userId,
        recoveryCode,
        currentStepIndex,
        totalSteps,
        stepsData,
        answers,
        setAnswers,
        isLoading,
        isCompleted,
        registrationResult,
        saveCurrentStep,
        goToPreviousStep,
        goToStep,
        resumeWithRecoveryCode,
        finalizeRegistration,
        restartFresh,
        isSaveModalOpen,
        setIsSaveModalOpen,
        isResumeModalOpen,
        setIsResumeModalOpen,
        isSupportModalOpen,
        setIsSupportModalOpen,
      }}
    >
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding() {
  const context = useContext(OnboardingContext);
  if (!context) {
    throw new Error("useOnboarding must be used within an OnboardingProvider");
  }
  return context;
}
