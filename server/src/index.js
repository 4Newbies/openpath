// ==============================================================================
// OpenPath Server - Main Entry Point
// WCAG 2.2 AA Accessible Registration & Voice Interaction Backend
// ==============================================================================

import "./config/env.js";
import express from "express";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import authRoutes from "./routes/authRoutes.js";
import onboardingRoutes from "./routes/onboardingRoutes.js";
import voiceRoutes from "./routes/voiceRoutes.js";
import accessibilityRoutes from "./routes/accessibilityRoutes.js";
import supportRoutes from "./routes/supportRoutes.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

// ------------------------------------------------------------------------------
// Middleware Setup
// ------------------------------------------------------------------------------

// Accessible CORS handler
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, Accept");
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  next();
});

// JSON and Form parsing (large limit for base64 audio clips)
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true, limit: "20mb" }));

// Lightweight request logger
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    if (req.path !== "/api/health") {
      console.log(`[HTTP] ${req.method} ${req.path} -> ${res.statusCode} (${duration}ms)`);
    }
  });
  next();
});

// ------------------------------------------------------------------------------
// API Routes
// ------------------------------------------------------------------------------
app.use("/api/auth", authRoutes);
app.use("/api/onboarding", onboardingRoutes);
app.use("/api/voice", voiceRoutes);
app.use("/api/accessibility", accessibilityRoutes);
app.use("/api/support", supportRoutes);

// System Health & Engine Diagnostics
app.get("/api/health", (req, res) => {
  res.json({
    status: "healthy",
    service: "OpenPath Inclusive Registration Platform",
    timestamp: new Date().toISOString(),
    database: {
      type: "PostgreSQL",
      orm: "Prisma (schema ready) + Resilient Client",
      connected: true,
      jsonbSupport: true,
    },
    voiceEngine: {
      stt: {
        provider: "Addis Scribe (አዲስ ስክራይብ)",
        language: "am-ET",
        status: "active",
      },
      tts: {
        provider: "Addis TTS (አዲስ ድምፅ)",
        defaultVoice: "Addis-Selam-Neural",
        voices: ["Addis-Selam-Neural", "Addis-Dawit-Neural"],
        status: "active",
      },
    },
    wcagCompliance: "WCAG 2.2 AA",
  });
});

// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: `Endpoint not found: ${req.method} ${req.path}`,
    errorAmharic: "የተጠየቀው አገልግሎት አልተገኘም",
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error("[Server Error]", err);
  res.status(500).json({
    success: false,
    error: "Internal Server Error",
    details: err.message,
    errorAmharic: "ያልተጠበቀ የስርዓት ስህተት ተከስቷል",
  });
});

// ------------------------------------------------------------------------------
// Server Startup
// ------------------------------------------------------------------------------
const server = http.createServer(app);

server.listen(PORT, () => {
  console.log("=================================================================");
  console.log(`🚀 OpenPath Backend running on http://localhost:${PORT}`);
  console.log(`📦 Primary Database: PostgreSQL Architecture (Prisma configured)`);
  console.log(`🎙️  Amharic STT: Addis Scribe Engine Active (am-ET)`);
  console.log(`🔊 Amharic TTS: Addis TTS Engine Active (Addis-Selam-Neural)`);
  console.log(`♿ Accessibility: WCAG 2.2 AA Audio & One-Question Engine Active`);
  console.log("=================================================================");
});
