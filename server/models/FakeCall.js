/**
 * server/models/FakeCall.js — Fake Call Data Model (Module 8)
 */

const { run, get, all } = require('../config/db');

class FakeCall {
  /**
   * Schedule or register a new fake call
   */
  static async create(userId, {
    callerName = 'Mom',
    callerNumber = '+91 98765 43210',
    callerAvatar = '👩',
    ringtone = 'marimba',
    voiceType = 'mom_checkin',
    customVoiceData = '',
    delaySeconds = 0,
    status = 'SCHEDULED',
  }) {
    const scheduledAt = new Date(Date.now() + (parseInt(delaySeconds) || 0) * 1000).toISOString();

    const result = await run(
      `INSERT INTO fake_calls (userId, callerName, callerNumber, callerAvatar, ringtone, voiceType, customVoiceData, delaySeconds, status, scheduledAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, callerName, callerNumber, callerAvatar, ringtone, voiceType, customVoiceData, delaySeconds, status, scheduledAt]
    );

    return this.getById(result.lastID, userId);
  }

  /**
   * Get all fake calls for a user
   */
  static async getByUser(userId, status = null) {
    if (status) {
      return all(
        `SELECT id, userId, callerName, callerNumber, callerAvatar, ringtone, voiceType, delaySeconds, status, scheduledAt, triggeredAt, completedAt, createdAt
         FROM fake_calls
         WHERE userId = ? AND status = ?
         ORDER BY id DESC`,
        [userId, status]
      );
    }

    return all(
      `SELECT id, userId, callerName, callerNumber, callerAvatar, ringtone, voiceType, delaySeconds, status, scheduledAt, triggeredAt, completedAt, createdAt
       FROM fake_calls
       WHERE userId = ?
       ORDER BY id DESC`,
      [userId]
    );
  }

  /**
   * Get single fake call by ID with user ownership check
   */
  static async getById(id, userId) {
    return get(
      `SELECT * FROM fake_calls WHERE id = ? AND userId = ?`,
      [id, userId]
    );
  }

  /**
   * Update fake call configuration
   */
  static async update(id, userId, {
    callerName,
    callerNumber,
    callerAvatar,
    ringtone,
    voiceType,
    customVoiceData,
    delaySeconds,
  }) {
    const existing = await this.getById(id, userId);
    if (!existing) return null;

    const scheduledAt = delaySeconds !== undefined
      ? new Date(Date.now() + (parseInt(delaySeconds) || 0) * 1000).toISOString()
      : existing.scheduledAt;

    await run(
      `UPDATE fake_calls
       SET callerName = COALESCE(?, callerName),
           callerNumber = COALESCE(?, callerNumber),
           callerAvatar = COALESCE(?, callerAvatar),
           ringtone = COALESCE(?, ringtone),
           voiceType = COALESCE(?, voiceType),
           customVoiceData = COALESCE(?, customVoiceData),
           delaySeconds = COALESCE(?, delaySeconds),
           scheduledAt = ?,
           updatedAt = CURRENT_TIMESTAMP
       WHERE id = ? AND userId = ?`,
      [
        callerName,
        callerNumber,
        callerAvatar,
        ringtone,
        voiceType,
        customVoiceData,
        delaySeconds,
        scheduledAt,
        id,
        userId,
      ]
    );

    return this.getById(id, userId);
  }

  /**
   * Update fake call status (e.g. RINGING, ANSWERED, COMPLETED, CANCELLED, REJECTED, MISSED)
   */
  static async updateStatus(id, userId, status) {
    const existing = await this.getById(id, userId);
    if (!existing) return null;

    let triggeredAt = existing.triggeredAt;
    let completedAt = existing.completedAt;

    if (status === 'RINGING' && !triggeredAt) {
      triggeredAt = new Date().toISOString();
    } else if (['COMPLETED', 'CANCELLED', 'REJECTED', 'MISSED'].includes(status)) {
      completedAt = new Date().toISOString();
    }

    await run(
      `UPDATE fake_calls
       SET status = ?,
           triggeredAt = COALESCE(?, triggeredAt),
           completedAt = COALESCE(?, completedAt),
           updatedAt = CURRENT_TIMESTAMP
       WHERE id = ? AND userId = ?`,
      [status, triggeredAt, completedAt, id, userId]
    );

    return this.getById(id, userId);
  }

  /**
   * Delete fake call record
   */
  static async delete(id, userId) {
    const existing = await this.getById(id, userId);
    if (!existing) return false;

    await run(`DELETE FROM fake_calls WHERE id = ? AND userId = ?`, [id, userId]);
    return true;
  }
}

module.exports = FakeCall;
