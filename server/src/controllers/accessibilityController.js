// ==============================================================================
// Accessibility Controller - WCAG 2.2 AA Preferences Management
// ==============================================================================

import { db } from "../db/dbClient.js";

export const accessibilityController = {
  /**
   * Get user or session accessibility preferences
   */
  async getPreferences(req, res) {
    try {
      const { userId } = req.params;
      let prefs = await db.accessibilityPreferences.findByUserId(userId);
      if (!prefs) {
        prefs = await db.accessibilityPreferences.upsert(userId, {
          screenReaderActive: false,
          highContrastMode: "DEFAULT",
          fontSize: "NORMAL",
          voiceGuidanceEnabled: true,
          autoReadAloud: true,
          amharicVoiceModel: "AZURE_AMEHA",
          speechRate: 1.0,
        });
      }
      return res.json({ success: true, data: prefs });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  },

  /**
   * Update accessibility preferences
   */
  async updatePreferences(req, res) {
    try {
      const { userId } = req.params;
      const updates = req.body;
      const updated = await db.accessibilityPreferences.upsert(userId, updates);
      return res.json({
        success: true,
        message: "Accessibility preferences updated",
        messageAmharic: "የተደራሽነት ምርጫዎችዎ ተዘምነዋል።",
        data: updated,
      });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  },
};
