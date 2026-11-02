/**
 * server/models/Location.js — Live Location & Family Location Sharing Model
 */

const { run, get, all } = require('../config/db');

class Location {
  /**
   * Insert or update user's live GPS coordinates
   */
  static async updateLiveLocation(userId, {
    latitude,
    longitude,
    accuracy = 10,
    isTracking = 1,
    isSharing = 1,
  }) {
    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    const acc = parseFloat(accuracy) || 10;

    await run(
      `INSERT INTO user_live_locations (userId, latitude, longitude, accuracy, isTracking, isSharing, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(userId) DO UPDATE SET
         latitude = excluded.latitude,
         longitude = excluded.longitude,
         accuracy = excluded.accuracy,
         isTracking = excluded.isTracking,
         isSharing = excluded.isSharing,
         updatedAt = CURRENT_TIMESTAMP`,
      [userId, lat, lng, acc, isTracking ? 1 : 0, isSharing ? 1 : 0]
    );

    return this.getCurrentLocation(userId);
  }

  /**
   * Get user's current live location record
   */
  static async getCurrentLocation(userId) {
    return get(
      'SELECT * FROM user_live_locations WHERE userId = ?',
      [userId]
    );
  }

  /**
   * Start or resume live tracking
   */
  static async startTracking(userId) {
    await run(
      `UPDATE user_live_locations SET isTracking = 1, updatedAt = CURRENT_TIMESTAMP WHERE userId = ?`,
      [userId]
    );
    return this.getCurrentLocation(userId);
  }

  /**
   * Stop active live tracking
   */
  static async stopTracking(userId) {
    await run(
      `UPDATE user_live_locations SET isTracking = 0, updatedAt = CURRENT_TIMESTAMP WHERE userId = ?`,
      [userId]
    );
    return this.getCurrentLocation(userId);
  }

  /**
   * Toggle location sharing permission
   */
  static async toggleSharing(userId, isSharing) {
    const shareVal = isSharing ? 1 : 0;
    await run(
      `INSERT INTO user_live_locations (userId, latitude, longitude, accuracy, isTracking, isSharing, updatedAt)
       VALUES (?, 0, 0, 10, 0, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(userId) DO UPDATE SET
         isSharing = ?,
         updatedAt = CURRENT_TIMESTAMP`,
      [userId, shareVal, shareVal]
    );
    return this.getCurrentLocation(userId);
  }

  /**
   * Get authorized family members who are sharing live location with this user
   * Queries emergency contacts and users sharing live location
   */
  static async getFamilyLiveLocations(userId) {
    // 1. Get user's contacts
    const contacts = await all(
      `SELECT ec.id, ec.name, ec.phoneNumber, ec.relationship, ec.contactGroup, ec.priority,
              ull.latitude, ull.longitude, ull.accuracy, ull.isTracking, ull.isSharing, ull.updatedAt,
              u.id as familyUserId
       FROM emergency_contacts ec
       LEFT JOIN users u ON (
         REPLACE(REPLACE(u.mobileNumber, ' ', ''), '-', '') = REPLACE(REPLACE(ec.phoneNumber, ' ', ''), '-', '')
         OR SUBSTR(REPLACE(REPLACE(u.mobileNumber, ' ', ''), '-', ''), -10) = SUBSTR(REPLACE(REPLACE(ec.phoneNumber, ' ', ''), '-', ''), -10)
       )
       LEFT JOIN user_live_locations ull ON (ull.userId = u.id AND ull.isSharing = 1)
       WHERE ec.userId = ?
       ORDER BY ec.priority ASC, ec.id ASC`,
      [userId]
    );

    const now = Date.now();

    return contacts.map(c => {
      let status = 'OFFLINE';
      let lastSeenText = 'Offline';

      if (c.updatedAt && c.latitude && c.longitude && c.isSharing) {
        // SQLite CURRENT_TIMESTAMP is in UTC 'YYYY-MM-DD HH:MM:SS'
        const utcStr = c.updatedAt.includes('T') ? c.updatedAt : c.updatedAt.replace(' ', 'T') + 'Z';
        const updateTime = new Date(utcStr).getTime();
        const diffMinutes = (now - updateTime) / (1000 * 60);

        if (diffMinutes < 3 && c.isTracking) {
          status = 'LIVE';
          lastSeenText = 'Live now';
        } else if (diffMinutes < 15) {
          status = 'RECENT';
          lastSeenText = `${Math.round(diffMinutes)} min ago`;
        } else {
          status = 'OFFLINE';
          lastSeenText = new Date(utcStr).toLocaleTimeString();
        }
      }

      return {
        id: c.id,
        name: c.name,
        phoneNumber: c.phoneNumber,
        relationship: c.relationship || 'Family',
        group: c.contactGroup || 'Family',
        priority: c.priority,
        status,
        lastSeenText,
        latitude: status !== 'OFFLINE' ? c.latitude : null,
        longitude: status !== 'OFFLINE' ? c.longitude : null,
        accuracy: c.accuracy || null,
        updatedAt: c.updatedAt || null,
        isRegistered: !!c.familyUserId,
      };
    });
  }
}

module.exports = Location;
