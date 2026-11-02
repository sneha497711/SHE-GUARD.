/**
 * server/controllers/safeRouteController.js — Safe Route Recommendation Endpoints (Module 10)
 */

const SafeRouteService = require('../services/safeRouteService');
const SafetyLayer = require('../models/SafetyLayer');

// ── 1. ANALYZE & RECOMMEND SAFEST ROUTE ─────────────────
async function analyzeSafeRoute(req, res) {
  try {
    const { originLat, originLng, destLat, destLng, destName = 'Destination' } = req.body;

    if (originLat === undefined || originLng === undefined || destLat === undefined || destLng === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Origin (lat, lng) and Destination (lat, lng) coordinates are required.',
      });
    }

    const oLat = parseFloat(originLat);
    const oLng = parseFloat(originLng);
    const dLat = parseFloat(destLat);
    const dLng = parseFloat(destLng);

    if (isNaN(oLat) || isNaN(oLng) || isNaN(dLat) || isNaN(dLng)) {
      return res.status(400).json({
        success: false,
        message: 'Coordinates must be valid decimal numbers.',
      });
    }

    const analysisResult = await SafeRouteService.analyzeRoutes({
      originLat: oLat,
      originLng: oLng,
      destLat: dLat,
      destLng: dLng,
      destName,
    });

    return res.status(200).json(analysisResult);
  } catch (error) {
    console.error('[Safe Route Analysis Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to analyze safe routes.',
    });
  }
}

// ── 2. GET SAFETY MAP OVERLAY LAYERS ─────────────────────
async function getSafetyLayers(req, res) {
  try {
    const { type } = req.query;
    const nodes = await SafetyLayer.getAllNodes(type || null);

    return res.status(200).json({
      success: true,
      count: nodes.length,
      layers: {
        policePatrols: nodes.filter(n => n.nodeType === 'POLICE_PATROL'),
        cctvZones: nodes.filter(n => n.nodeType === 'CCTV'),
        lightingCorridors: nodes.filter(n => n.nodeType === 'LIGHTING'),
        crowdHubs: nodes.filter(n => n.nodeType === 'CROWD_HUB'),
        crimeHotspots: nodes.filter(n => n.nodeType === 'CRIME_HOTSPOT'),
      },
      allNodes: nodes,
    });
  } catch (error) {
    console.error('[Get Safety Layers Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve safety map layers.',
    });
  }
}

// ── 3. CHECK ROUTE DEVIATION DURING LIVE TRACKING ───────
async function checkRouteDeviation(req, res) {
  try {
    const { currentLat, currentLng, waypoints, thresholdMeters = 150 } = req.body;

    if (!currentLat || !currentLng || !Array.isArray(waypoints) || waypoints.length < 2) {
      return res.status(400).json({
        success: false,
        message: 'currentLat, currentLng, and waypoints array (min 2 points) are required.',
      });
    }

    const deviationResult = SafeRouteService.checkRouteDeviation(
      currentLat,
      currentLng,
      waypoints,
      thresholdMeters
    );

    return res.status(200).json({
      success: true,
      ...deviationResult,
    });
  } catch (error) {
    console.error('[Check Deviation Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'Error checking route deviation.',
    });
  }
}

// ── 4. REPORT SAFETY LANDMARK / HAZARD ────────────────────
async function reportSafetyNode(req, res) {
  try {
    const { nodeType, name, latitude, longitude, radiusMeters, safetyRating, description } = req.body;

    if (!nodeType || !name || latitude === undefined || longitude === undefined) {
      return res.status(400).json({
        success: false,
        message: 'nodeType, name, latitude, and longitude are required.',
      });
    }

    const newNode = await SafetyLayer.createNode({
      nodeType,
      name,
      latitude,
      longitude,
      radiusMeters: radiusMeters || 300,
      safetyRating: safetyRating || 80,
      description: description || '',
      source: 'USER_REPORTED',
    });

    return res.status(201).json({
      success: true,
      message: 'Safety landmark registered successfully.',
      node: newNode,
    });
  } catch (error) {
    console.error('[Report Safety Node Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to report safety landmark.',
    });
  }
}

module.exports = {
  analyzeSafeRoute,
  getSafetyLayers,
  checkRouteDeviation,
  reportSafetyNode,
};
