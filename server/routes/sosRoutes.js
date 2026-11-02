/**
 * server/routes/sosRoutes.js — Smart SOS Endpoints
 */

const express = require('express');
const router = express.Router();
const sosController = require('../controllers/sosController');
const authMiddleware = require('../middleware/authMiddleware');

// All SOS endpoints require authentication
router.use(authMiddleware);

// Core SOS Lifecycle Endpoints
router.post('/trigger', sosController.triggerSOS);
router.get('/status', sosController.getSOSStatus);
router.post('/resolve', sosController.resolveSOS);
router.post('/:id/resolve', sosController.resolveSOS);
router.post('/location', sosController.updateSOSLocation);
router.post('/:id/location', sosController.updateSOSLocation);
router.get('/history', sosController.getSOSHistory);

// External trigger endpoint (Smartwatch / Bluetooth GATT bridge / Companion app)
router.post('/external-trigger', sosController.receiveExternalTrigger);

module.exports = router;
