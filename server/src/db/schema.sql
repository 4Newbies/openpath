-- ==============================================================================
-- OpenPath Database Initialization Script (PostgreSQL)
-- Architecture: Separated Auth, Profile, Accessibility, Voice, and Support
-- ==============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Users Table
CREATE TABLE IF NOT EXISTS "User" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "email" VARCHAR(255) UNIQUE,
    "phoneNumber" VARCHAR(50) UNIQUE,
    "primaryLanguage" VARCHAR(20) DEFAULT 'AMHARIC' NOT NULL,
    "role" VARCHAR(50) DEFAULT 'LEARNER' NOT NULL,
    "authType" VARCHAR(50) DEFAULT 'PROVISIONAL_SESSION' NOT NULL,
    "isActive" BOOLEAN DEFAULT TRUE NOT NULL,
    "isRefugeeStatus" BOOLEAN DEFAULT FALSE NOT NULL,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- 2. Accounts Table
CREATE TABLE IF NOT EXISTS "Account" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "userId" UUID NOT NULL REFERENCES "User"("id") ON DELETE CASCADE UNIQUE,
    "passwordHash" TEXT,
    "refugeeRecoveryCode" VARCHAR(20) UNIQUE,
    "provisionalToken" VARCHAR(255) UNIQUE,
    "lastLoginAt" TIMESTAMP WITH TIME ZONE,
    "failedLoginAttempts" INT DEFAULT 0,
    "lockedUntil" TIMESTAMP WITH TIME ZONE,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- 3. Learner Profiles Table
CREATE TABLE IF NOT EXISTS "LearnerProfile" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "userId" UUID NOT NULL REFERENCES "User"("id") ON DELETE CASCADE UNIQUE,
    "fullNameAmharic" VARCHAR(255),
    "fullNameEnglish" VARCHAR(255),
    "dateOfBirth" DATE,
    "ageRange" VARCHAR(50),
    "gender" VARCHAR(50),
    "currentRegion" VARCHAR(100),
    "currentLocation" VARCHAR(255),
    "educationLevel" VARCHAR(100) DEFAULT 'BASIC_LITERACY_NUMERACY',
    "readingComfortLevel" VARCHAR(50) DEFAULT 'moderate',
    "primaryLearningGoal" VARCHAR(255),
    "preferredContactMethod" VARCHAR(50) DEFAULT 'PHONE_CALL',
    "trustedContactName" VARCHAR(255),
    "trustedContactPhone" VARCHAR(50),
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- 4. Alternative Identification Table
CREATE TABLE IF NOT EXISTS "IdentificationDocument" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "userId" UUID NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
    "documentType" VARCHAR(100) DEFAULT 'PROVISIONAL_SELF_ATTESTATION' NOT NULL,
    "documentNumber" VARCHAR(100),
    "status" VARCHAR(50) DEFAULT 'PENDING' NOT NULL,
    "notes" TEXT,
    "isRefugeeDoc" BOOLEAN DEFAULT FALSE NOT NULL,
    "issuedBy" VARCHAR(255),
    "verifiedAt" TIMESTAMP WITH TIME ZONE,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- 5. Accessibility Preferences Table
CREATE TABLE IF NOT EXISTS "AccessibilityPreference" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "userId" UUID NOT NULL REFERENCES "User"("id") ON DELETE CASCADE UNIQUE,
    "screenReaderActive" BOOLEAN DEFAULT FALSE NOT NULL,
    "highContrastMode" VARCHAR(50) DEFAULT 'DEFAULT' NOT NULL,
    "fontSize" VARCHAR(50) DEFAULT 'NORMAL' NOT NULL,
    "reducedMotion" BOOLEAN DEFAULT FALSE NOT NULL,
    "highContrastCursor" BOOLEAN DEFAULT FALSE NOT NULL,
    "voiceGuidanceEnabled" BOOLEAN DEFAULT TRUE NOT NULL,
    "autoReadAloud" BOOLEAN DEFAULT TRUE NOT NULL,
    "amharicVoiceModel" VARCHAR(50) DEFAULT 'ADDIS_TTS_SELAM' NOT NULL,
    "speechRate" REAL DEFAULT 1.0 NOT NULL,
    "preferVoiceInput" BOOLEAN DEFAULT FALSE NOT NULL,
    "extendedTimeLimit" BOOLEAN DEFAULT TRUE NOT NULL,
    "largeClickTargets" BOOLEAN DEFAULT TRUE NOT NULL,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- 6. Onboarding Sessions Table
CREATE TABLE IF NOT EXISTS "OnboardingSession" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "userId" UUID NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
    "recoveryCode" VARCHAR(20) UNIQUE NOT NULL,
    "currentStepIndex" INT DEFAULT 0 NOT NULL,
    "totalSteps" INT DEFAULT 6 NOT NULL,
    "isCompleted" BOOLEAN DEFAULT FALSE NOT NULL,
    "completedAt" TIMESTAMP WITH TIME ZONE,
    "lastActiveAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- 7. Onboarding Answers Table (using JSONB for high flexibility & performance)
CREATE TABLE IF NOT EXISTS "OnboardingAnswer" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "sessionId" UUID NOT NULL REFERENCES "OnboardingSession"("id") ON DELETE CASCADE,
    "stepIndex" INT NOT NULL,
    "stepKey" VARCHAR(100) NOT NULL,
    "answerData" JSONB NOT NULL,
    "answeredViaVoice" BOOLEAN DEFAULT FALSE NOT NULL,
    "transcribedText" TEXT,
    "voiceConfidence" REAL,
    "audioDurationSecs" REAL,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "unique_session_step" UNIQUE ("sessionId", "stepKey")
);

-- JSONB index for querying specific fields inside onboarding responses
CREATE INDEX IF NOT EXISTS "idx_onboarding_answer_data_gin" ON "OnboardingAnswer" USING GIN ("answerData");

-- 8. Voice Interaction Log Table
CREATE TABLE IF NOT EXISTS "VoiceInteraction" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "sessionId" UUID REFERENCES "OnboardingSession"("id") ON DELETE SET NULL,
    "serviceType" VARCHAR(50) NOT NULL,
    "languageCode" VARCHAR(20) DEFAULT 'am-ET' NOT NULL,
    "inputText" TEXT,
    "outputText" TEXT,
    "status" VARCHAR(50) DEFAULT 'SUCCESS' NOT NULL,
    "latencyMs" INT,
    "confidenceScore" REAL,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- 9. Private Support Requests Table
CREATE TABLE IF NOT EXISTS "SupportRequest" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "userId" UUID REFERENCES "User"("id") ON DELETE SET NULL,
    "category" VARCHAR(100) DEFAULT 'DOCUMENT_VERIFICATION_HELP' NOT NULL,
    "message" TEXT NOT NULL,
    "hasVoiceNote" BOOLEAN DEFAULT FALSE NOT NULL,
    "voiceNoteUrl" TEXT,
    "contactPhone" VARCHAR(50),
    "status" VARCHAR(50) DEFAULT 'OPEN' NOT NULL,
    "isConfidential" BOOLEAN DEFAULT TRUE NOT NULL,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Performance & Accessibility Lookups Indexes
CREATE INDEX IF NOT EXISTS "idx_user_phone" ON "User"("phoneNumber");
CREATE INDEX IF NOT EXISTS "idx_user_email" ON "User"("email");
CREATE INDEX IF NOT EXISTS "idx_session_recovery" ON "OnboardingSession"("recoveryCode");
CREATE INDEX IF NOT EXISTS "idx_voice_created" ON "VoiceInteraction"("createdAt");
CREATE INDEX IF NOT EXISTS "idx_support_status" ON "SupportRequest"("status");
