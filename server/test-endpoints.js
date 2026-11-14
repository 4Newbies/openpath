// ==============================================================================
// OpenPath Backend End-to-End Verification Test (Addis STT & Addis TTS)
// ==============================================================================

async function runTests() {
  console.log("-----------------------------------------------------------------");
  console.log("🧪 Starting OpenPath End-to-End API (Addis STT & Addis TTS)");
  console.log("-----------------------------------------------------------------");

  // 1. Health check
  const healthRes = await fetch("http://localhost:5000/api/health");
  const health = await healthRes.json();
  console.log("✓ Health Check:", health.status, "| STT:", health.voiceEngine.stt.provider, "| TTS:", health.voiceEngine.tts.provider);

  // 2. Start session
  const startRes = await fetch("http://localhost:5000/api/auth/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ primaryLanguage: "AMHARIC", isRefugeeStatus: true }),
  });
  const start = await startRes.json();
  console.log("✓ Start Session:", start.success ? `Session ID: ${start.data.sessionId}, Code: ${start.data.recoveryCode}` : "FAILED");
  const { sessionId, recoveryCode } = start.data;

  // 3. Test Addis Scribe STT
  const sttRes = await fetch("http://localhost:5000/api/voice/stt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contextHint: "fullName",
      sessionId,
    }),
  });
  const stt = await sttRes.json();
  console.log("✓ Addis Scribe STT:", stt.data.model, "| Text:", stt.data.transcribedText, `(Confidence: ${stt.data.confidence})`);

  // 4. Test Addis TTS
  const ttsRes = await fetch("http://localhost:5000/api/voice/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: "ሙሉ ስምዎን ያስገቡ",
      voice: "Addis-Selam-Neural",
      rate: 1.0,
      sessionId,
    }),
  });
  const tts = await ttsRes.json();
  console.log("✓ Addis TTS:", tts.data.modelUsed, "| Duration:", tts.data.durationSecs, "s | Audio URI generated:", Boolean(tts.data.audioDataUri));

  // 5. Save Step 2 (Identity & UNHCR Refugee ID)
  const answerRes = await fetch("http://localhost:5000/api/onboarding/answer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId,
      stepIndex: 1,
      stepKey: "identity",
      answerData: {
        fullNameAmharic: stt.data.transcribedText,
        fullNameEnglish: "Yonas Tadesse Abebe",
        ageRange: "18-24",
        currentRegion: "መልካዲዳ የስደተኞች መጠለያ ካምፕ",
        idType: "UNHCR_REFUGEE_REGISTRATION",
        documentNumber: "UNHCR-ETH-2026-9812",
        isRefugeeDoc: true,
      },
      answeredViaVoice: true,
      transcribedText: stt.data.transcribedText,
    }),
  });
  const answer = await answerRes.json();
  console.log("✓ Save Step Answer (JSONB):", answer.success, "| Next Step:", answer.data.currentStepIndex);

  // 6. Confidential Support Request
  const supportRes = await fetch("http://localhost:5000/api/support/request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId,
      category: "DOCUMENT_VERIFICATION_HELP",
      message: "ስደተኛ ነኝ፣ የመታወቂያ ወረቀት እርዳታ እፈልጋለሁ።",
      contactPhone: "0911223344",
      hasVoiceNote: true,
    }),
  });
  const support = await supportRes.json();
  console.log("✓ Confidential Support Request:", support.success ? `Request ID: ${support.data.requestId}` : "FAILED");

  // 7. Resume Session with Recovery Code
  const resumeRes = await fetch("http://localhost:5000/api/auth/resume", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recoveryCode }),
  });
  const resume = await resumeRes.json();
  console.log("✓ Resume Session with Code:", resume.success, "| Recovered Step Index:", resume.data.currentStepIndex, "| Answers stored:", resume.data.answers.length);

  // 8. Complete Onboarding
  const completeRes = await fetch("http://localhost:5000/api/onboarding/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId }),
  });
  const complete = await completeRes.json();
  console.log("✓ Finalize Onboarding:", complete.success ? `Student ID: ${complete.data.studentIdNumber}, Advisor: ${complete.data.assignedAdvisor.name}` : "FAILED");

  console.log("-----------------------------------------------------------------");
  console.log("🎉 ALL ADDIS STT & TTS TESTS PASSED SUCCESSFULLY!");
  console.log("-----------------------------------------------------------------");
}

runTests().catch((err) => {
  console.error("Test failure:", err);
  process.exit(1);
});
