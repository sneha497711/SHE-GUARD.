/**
 * server/routes/safeRouteRoutes.js — Safe Route Recommendation Endpoints (Module 10)
 */

const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const {
  analyzeSafeRoute,
  getSafetyLayers,
  checkRouteDeviation,
  reportSafetyNode,
} = require('../controllers/safeRouteController');

// All Safe Route endpoints require authentication
router.post('/analyze', authMiddleware, analyzeSafeRoute);
router.get('/safety-layers', authMiddleware, getSafetyLayers);
router.post('/check-deviation', authMiddleware, checkRouteDeviation);
router.post('/report-node', authMiddleware, reportSafetyNode);

module.exports = router;
