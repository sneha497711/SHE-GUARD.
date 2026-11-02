/**
 * server/models/SafetyLayer.js — Safety Nodes Spatial Data Access (Module 10)
 */

const { run, get, all } = require('../config/db');

class SafetyLayer {
  /**
   * Seed default safety landmarks if the table is empty
   */
  static async seedDefaultsIfEmpty() {
    const countRow = await get(`SELECT COUNT(*) as count FROM safety_nodes`);
    if (countRow && countRow.count > 0) return;

    const defaultNodes = [
      // Police Patrols
      { type: 'POLICE_PATROL', name: 'Central Police Station & 24/7 Patrol Post', lat: 28.6145, lng: 77.2095, radius: 600, rating: 98, desc: 'Active 24/7 PCR Van & Women Help Desk' },
      { type: 'POLICE_PATROL', name: 'City Rapid Police Patrol Post', lat: 28.6220, lng: 77.2180, radius: 500, rating: 95, desc: 'Constant police presence & rapid response post' },
      
      // CCTV Monitored Zones
      { type: 'CCTV', name: 'City Surveillance Safe Corridor CCTV #104', lat: 28.6180, lng: 77.2120, radius: 400, rating: 90, desc: 'High-definition 360° Smart City surveillance cameras' },
      { type: 'CCTV', name: 'Main Boulevard CCTV Grid #208', lat: 28.6250, lng: 77.2200, radius: 450, rating: 92, desc: 'Government monitored safe route camera stream' },
      
      // Well-lit Corridors & Smart Street Lighting
      { type: 'LIGHTING', name: 'Grand Avenue High-Illumination LED Corridor', lat: 28.6170, lng: 77.2140, radius: 550, rating: 95, desc: 'Continuous 100-lux smart LED street illumination with no dark spots' },
      { type: 'LIGHTING', name: 'Commercial Hub Well-Lit Parkway', lat: 28.6230, lng: 77.2230, radius: 500, rating: 88, desc: 'High visibility road with pedestrian walkways' },
      
      // Crowded Safe Hubs
      { type: 'CROWD_HUB', name: 'Commercial Market & Public Square', lat: 28.6200, lng: 77.2150, radius: 400, rating: 85, desc: 'Active commercial area with heavy civilian presence & open shops' },
      { type: 'CROWD_HUB', name: 'Civic Center & Public Square', lat: 28.6260, lng: 77.2190, radius: 350, rating: 82, desc: 'Well-populated pedestrian zone' },
      
      // High-Risk / Crime Hotspots (for avoidance scoring)
      { type: 'CRIME_HOTSPOT', name: 'Isolated Industrial Alley (Low Light)', lat: 28.6110, lng: 77.2010, radius: 350, rating: 25, desc: 'Historical incident reports & broken street lighting' },
    ];

    for (const n of defaultNodes) {
      await run(
        `INSERT INTO safety_nodes (nodeType, name, latitude, longitude, radiusMeters, safetyRating, description)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [n.type, n.name, n.lat, n.lng, n.radius, n.rating, n.desc]
      );
    }
  }

  /**
   * Get all active safety nodes in bounding box or radius
   */
  static async getSafetyNodesInArea(minLat, maxLat, minLng, maxLng) {
    await this.seedDefaultsIfEmpty();
    return all(
      `SELECT * FROM safety_nodes 
       WHERE isActive = 1 
         AND latitude BETWEEN ? AND ? 
         AND longitude BETWEEN ? AND ?`,
      [minLat, maxLat, minLng, maxLng]
    );
  }

  /**
   * Get all active safety nodes
   */
  static async getAllNodes(type = null) {
    await this.seedDefaultsIfEmpty();
    if (type) {
      return all(`SELECT * FROM safety_nodes WHERE isActive = 1 AND nodeType = ? ORDER BY id ASC`, [type]);
    }
    return all(`SELECT * FROM safety_nodes WHERE isActive = 1 ORDER BY nodeType ASC, id ASC`);
  }

  /**
   * Add a new safety node
   */
  static async createNode({ nodeType, name, latitude, longitude, radiusMeters = 300, safetyRating = 80, description = '', source = 'USER_REPORTED' }) {
    const res = await run(
      `INSERT INTO safety_nodes (nodeType, name, latitude, longitude, radiusMeters, safetyRating, description, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [nodeType, name, parseFloat(latitude), parseFloat(longitude), parseFloat(radiusMeters), parseFloat(safetyRating), description, source]
    );
    return get(`SELECT * FROM safety_nodes WHERE id = ?`, [res.lastID]);
  }
}

module.exports = SafetyLayer;
