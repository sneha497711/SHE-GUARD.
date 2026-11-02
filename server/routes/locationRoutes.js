/**
 * server/routes/locationRoutes.js — Live GPS Tracking, Geofencing, and Routing Endpoints
 */

const express = require('express');
const router = express.Router();
const locationController = require('../controllers/locationController');
const authMiddleware = require('../middleware/authMiddleware');

// All location and geofence endpoints require authentication
router.use(authMiddleware);

// Live GPS Tracking & Controls
router.post('/update', locationController.updateLocation);
router.get('/current', locationController.getCurrentLocation);
router.post('/start', locationController.startTracking);
router.post('/stop', locationController.stopTracking);
router.post('/share/toggle', locationController.toggleSharing);

// Family Member Tracking
router.get('/family', locationController.getFamilyLocations);

// Route Visualization & ETA
router.post('/route', locationController.calculateRoute);

// Geofencing / Safe Zones (support both /api/geofences and /api/location/geofences)
router.get(['/geofences', '/'], (req, res, next) => {
  if (req.path === '/current' || req.path === '/family' || req.path === '/route') return next();
  return locationController.getGeofences(req, res);
});
router.post(['/geofences', '/'], (req, res, next) => {
  if (req.path === '/update' || req.path === '/start' || req.path === '/stop' || req.path === '/route' || req.path === '/share/toggle') return next();
  return locationController.createGeofence(req, res);
});
router.put(['/geofences/:id', '/:id'], locationController.updateGeofence);
router.delete(['/geofences/:id', '/:id'], locationController.deleteGeofence);

module.exports = router;
