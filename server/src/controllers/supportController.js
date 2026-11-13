// ==============================================================================
// Support Controller - Confidential Learner Assistance
// Handles confidential requests, refugee document inquiries, and voice notes
// ==============================================================================

import { db } from "../db/dbClient.js";

export const supportController = {
  /**
   * Submit a private assistance request
   * POST /api/support/request
   */
  async submitRequest(req, res) {
    try {
      const {
        userId,
        category = "DOCUMENT_VERIFICATION_HELP",
        message,
        contactPhone,
        hasVoiceNote = false,
        voiceNoteAudio = null,
      } = req.body || {};

      if (!message && !voiceNoteAudio) {
        return res.status(400).json({
          success: false,
          error: "A text message or voice note is required",
          errorAmharic: "እባክዎ የመልዕክት ጽሑፍ ወይም የድምፅ መልዕክት ያቅርቡ",
        });
      }

      const request = await db.supportRequests.create({
        userId,
        category,
        message: message || "የድምፅ እርዳታ ጥያቄ (Voice note request)",
        contactPhone,
        hasVoiceNote: Boolean(hasVoiceNote || voiceNoteAudio),
        voiceNoteUrl: voiceNoteAudio ? "stored_in_secure_vault" : null,
        isConfidential: true,
      });

      return res.status(201).json({
        success: true,
        message: "Your confidential support request has been submitted to an accessibility advisor.",
        messageAmharic: "የሚስጥር እርዳታ ጥያቄዎ በተሳካ ሁኔታ ለተደራሽነት አማካሪ ደርሷል። በቅርቡ በስልክ ወይም በድምፅ ጥሪ እናገኝዎታለን።",
        data: {
          requestId: request.id,
          status: request.status,
          createdAt: request.createdAt,
        },
      });
    } catch (err) {
      console.error("[Support Controller] Submit error:", err);
      return res.status(500).json({
        success: false,
        error: "Failed to submit support request",
        errorAmharic: "የእርዳታ ጥያቄውን ማቅረብ አልተቻለም። እባክዎ እንደገና ይሞክሩ።",
      });
    }
  },
};
