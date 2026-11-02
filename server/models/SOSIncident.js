/**
 * server/models/SOSIncident.js — SOS Incident Model & History Tracker
 */

const { run, get, all } = require('../config/db');

class SOSIncident {
  /**
   * Create a new SOS Incident
   */
  static async create({
    userId,
    triggerSource = 'button',
    latitude = null,
    longitude = null,
    accuracy = null,
    smsStatus = 'PENDING',
    callStatus = 'PENDING',
    pushNotificationStatus = 'PENDING',
    liveLocationStatus = 'ACTIVE',
    notes = '',
  }) {
    const validTriggers = ['button', 'shake', 'voice', 'power_button', 'smartwatch', 'bluetooth'];
    const safeSource = validTriggers.includes(triggerSource.toLowerCase())
      ? triggerSource.toLowerCase()
      : 'button';

    const result = await run(
      `INSERT INTO sos_incidents (
        userId, triggerSource, status, latitude, longitude, accuracy,
        smsStatus, callStatus, pushNotificationStatus, liveLocationStatus, notes,
        triggeredAt, createdAt, updatedAt
      ) VALUES (?, ?, 'ACTIVE', ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [
        userId,
        safeSource,
        latitude !== undefined && latitude !== null ? parseFloat(latitude) : null,
        longitude !== undefined && longitude !== null ? parseFloat(longitude) : null,
        accuracy !== undefined && accuracy !== null ? parseFloat(accuracy) : null,
        smsStatus,
        callStatus,
        pushNotificationStatus,
        liveLocationStatus,
        notes,
      ]
    );

    return this.findByIdAndUserId(result.lastID, userId);
  }

  /**
   * Find single incident by ID and User ID
   */
  static async findByIdAndUserId(id, userId) {
    return get(
      'SELECT * FROM sos_incidents WHERE id = ? AND userId = ?',
      [id, userId]
    );
  }

  /**
   * Get currently active SOS incident for user (if any)
   */
  static async getActiveIncident(userId) {
    return get(
      `SELECT * FROM sos_incidents 
       WHERE userId = ? AND status = 'ACTIVE' 
       ORDER BY id DESC LIMIT 1`,
      [userId]
    );
  }

  /**
   * Update live location for an active incident
   */
  static async updateLocation(id, userId, latitude, longitude, accuracy = null) {
    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    const acc = accuracy !== null && accuracy !== undefined ? parseFloat(accuracy) : null;

    await run(
      `UPDATE sos_incidents 
       SET latitude = ?, longitude = ?, accuracy = ?, liveLocationStatus = 'STREAMING', updatedAt = CURRENT_TIMESTAMP 
       WHERE id = ? AND userId = ? AND status = 'ACTIVE'`,
      [lat, lng, acc, id, userId]
    );

    return this.findByIdAndUserId(id, userId);
  }

  /**
   * Update emergency action statuses (SMS, Call, Push)
   */
  static async updateActionStatus(id, userId, updates = {}) {
    const fields = [];
    const params = [];

    if (updates.smsStatus) {
      fields.push('smsStatus = ?');
      params.push(updates.smsStatus);
    }
    if (updates.callStatus) {
      fields.push('callStatus = ?');
      params.push(updates.callStatus);
    }
    if (updates.pushNotificationStatus) {
      fields.push('pushNotificationStatus = ?');
      params.push(updates.pushNotificationStatus);
    }
    if (updates.liveLocationStatus) {
      fields.push('liveLocationStatus = ?');
      params.push(updates.liveLocationStatus);
    }
    if (updates.notes) {
      fields.push('notes = ?');
      params.push(updates.notes);
    }

    if (fields.length === 0) return this.findByIdAndUserId(id, userId);

    fields.push('updatedAt = CURRENT_TIMESTAMP');
    params.push(id, userId);

    await run(
      `UPDATE sos_incidents SET ${fields.join(', ')} WHERE id = ? AND userId = ?`,
      params
    );

    return this.findByIdAndUserId(id, userId);
  }

  /**
   * Resolve an active SOS incident
   */
  static async resolve(id, userId, resolutionNote = 'Resolved by user') {
    await run(
      `UPDATE sos_incidents 
       SET status = 'RESOLVED', liveLocationStatus = 'STOPPED', notes = ?, resolvedAt = CURRENT_TIMESTAMP, updatedAt = CURRENT_TIMESTAMP 
       WHERE id = ? AND userId = ?`,
      [resolutionNote, id, userId]
    );

    return this.findByIdAndUserId(id, userId);
  }

  /**
   * Resolve any active incident for a user
   */
  static async resolveActive(userId, resolutionNote = 'Resolved by user') {
    await run(
      `UPDATE sos_incidents 
       SET status = 'RESOLVED', liveLocationStatus = 'STOPPED', notes = ?, resolvedAt = CURRENT_TIMESTAMP, updatedAt = CURRENT_TIMESTAMP 
       WHERE userId = ? AND status = 'ACTIVE'`,
      [resolutionNote, userId]
    );
  }

  /**
   * Get user SOS history with pagination
   */
  static async getHistory(userId, limit = 50, offset = 0) {
    return all(
      `SELECT * FROM sos_incidents 
       WHERE userId = ? 
       ORDER BY triggeredAt DESC, id DESC 
       LIMIT ? OFFSET ?`,
      [userId, parseInt(limit), parseInt(offset)]
    );
  }

  /**
   * Get total incident count for user
   */
  static async countByUser(userId) {
    const row = await get(
      'SELECT COUNT(*) as total FROM sos_incidents WHERE userId = ?',
      [userId]
    );
    return row ? row.total : 0;
  }
}

module.exports = SOSIncident;
