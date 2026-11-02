/**
 * server/models/Geofence.js — Safe Zone & Geofencing Model
 */

const { run, get, all } = require('../config/db');

class Geofence {
  static haversineDistanceMeters(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Earth radius in meters
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }

  static async findByUserId(userId) {
    return all(
      'SELECT * FROM geofences WHERE userId = ? ORDER BY id DESC',
      [userId]
    );
  }

  static async findByIdAndUserId(id, userId) {
    return get(
      'SELECT * FROM geofences WHERE id = ? AND userId = ?',
      [id, userId]
    );
  }

  static async create({
    userId,
    name,
    latitude,
    longitude,
    radius = 500,
    isActive = 1,
  }) {
    const safeRadius = Math.max(50, Math.min(parseInt(radius) || 500, 10000));
    const result = await run(
      `INSERT INTO geofences (userId, name, latitude, longitude, radius, isActive, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [
        userId,
        name.trim(),
        parseFloat(latitude),
        parseFloat(longitude),
        safeRadius,
        isActive ? 1 : 0,
      ]
    );

    return this.findByIdAndUserId(result.lastID, userId);
  }

  static async update(id, userId, {
    name,
    latitude,
    longitude,
    radius,
    isActive,
  }) {
    const existing = await this.findByIdAndUserId(id, userId);
    if (!existing) return null;

    const updatedName = name !== undefined ? name.trim() : existing.name;
    const updatedLat = latitude !== undefined ? parseFloat(latitude) : existing.latitude;
    const updatedLng = longitude !== undefined ? parseFloat(longitude) : existing.longitude;
    const updatedRadius = radius !== undefined ? Math.max(50, Math.min(parseInt(radius) || 500, 10000)) : existing.radius;
    const updatedActive = isActive !== undefined ? (isActive ? 1 : 0) : existing.isActive;

    await run(
      `UPDATE geofences 
       SET name = ?, latitude = ?, longitude = ?, radius = ?, isActive = ?, updatedAt = CURRENT_TIMESTAMP
       WHERE id = ? AND userId = ?`,
      [updatedName, updatedLat, updatedLng, updatedRadius, updatedActive, id, userId]
    );

    return this.findByIdAndUserId(id, userId);
  }

  static async delete(id, userId) {
    const result = await run(
      'DELETE FROM geofences WHERE id = ? AND userId = ?',
      [id, userId]
    );
    return result.changes > 0;
  }

  /**
   * Evaluate a user's current GPS point against all active geofences
   */
  static async checkGeofenceStatus(userId, currentLat, currentLng) {
    const geofences = await all(
      'SELECT * FROM geofences WHERE userId = ? AND isActive = 1',
      [userId]
    );

    const results = geofences.map(gf => {
      const distanceMeters = this.haversineDistanceMeters(
        currentLat,
        currentLng,
        gf.latitude,
        gf.longitude
      );

      const isInside = distanceMeters <= gf.radius;

      return {
        id: gf.id,
        name: gf.name,
        radius: gf.radius,
        distanceMeters: Math.round(distanceMeters),
        isInside,
        status: isInside ? 'INSIDE_SAFE_ZONE' : 'OUTSIDE_SAFE_ZONE',
      };
    });

    return results;
  }
}

module.exports = Geofence;
