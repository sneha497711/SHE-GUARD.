/**
 * server/models/Chat.js — Chat Conversation & Message Data Access (Module 9)
 */

const { run, get, all } = require('../config/db');

class Chat {
  /**
   * Get active conversation for user or create one
   */
  static async getOrCreateActiveConversation(userId) {
    let conv = await get(
      `SELECT * FROM chat_conversations WHERE userId = ? ORDER BY updatedAt DESC LIMIT 1`,
      [userId]
    );

    if (!conv) {
      const res = await run(
        `INSERT INTO chat_conversations (userId, title) VALUES (?, ?)`,
        [userId, 'SheGuard Safety Assistant']
      );
      conv = await get(`SELECT * FROM chat_conversations WHERE id = ?`, [res.lastID]);
    }

    return conv;
  }

  /**
   * Add a new message to conversation
   */
  static async addMessage({ conversationId, userId, role, content, intent = 'GENERAL', structuredData = null }) {
    const dataStr = structuredData ? (typeof structuredData === 'string' ? structuredData : JSON.stringify(structuredData)) : '';
    
    const res = await run(
      `INSERT INTO chat_messages (conversationId, userId, role, content, intent, structuredData)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [conversationId, userId, role, content, intent, dataStr]
    );

    await run(
      `UPDATE chat_conversations SET updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
      [conversationId]
    );

    return get(`SELECT * FROM chat_messages WHERE id = ?`, [res.lastID]);
  }

  /**
   * Get messages for user conversation (with strict userId isolation)
   */
  static async getMessages(userId, limit = 50) {
    const conv = await this.getOrCreateActiveConversation(userId);
    const messages = await all(
      `SELECT * FROM chat_messages 
       WHERE conversationId = ? AND userId = ? 
       ORDER BY createdAt ASC LIMIT ?`,
      [conv.id, userId, limit]
    );

    return {
      conversation: conv,
      messages: messages.map(m => {
        let parsedData = null;
        if (m.structuredData) {
          try {
            parsedData = JSON.parse(m.structuredData);
          } catch (e) {
            parsedData = m.structuredData;
          }
        }
        return {
          id: m.id,
          conversationId: m.conversationId,
          role: m.role,
          content: m.content,
          intent: m.intent,
          structuredData: parsedData,
          createdAt: m.createdAt,
        };
      }),
    };
  }

  /**
   * Clear user's chat history
   */
  static async clearUserHistory(userId) {
    const conv = await get(
      `SELECT id FROM chat_conversations WHERE userId = ?`,
      [userId]
    );

    if (conv) {
      await run(`DELETE FROM chat_messages WHERE conversationId = ? AND userId = ?`, [conv.id, userId]);
      await run(`DELETE FROM chat_conversations WHERE id = ? AND userId = ?`, [conv.id, userId]);
    }

    return { success: true };
  }
}

module.exports = Chat;
