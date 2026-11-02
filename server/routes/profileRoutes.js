/**
 * server/routes/profileRoutes.js — Profile, Medical, and Emergency Endpoints
 */

const express = require('express');
const router = express.Router();
const profileController = require('../controllers/profileController');
const authMiddleware = require('../middleware/authMiddleware');

// All profile endpoints require authentication
router.use(authMiddleware);

// Personal profile
router.get('/', profileController.getProfile);
router.put('/', profileController.updateProfile);

// Medical Information
router.get('/medical', profileController.getMedical);
router.put('/medical', profileController.updateMedical);

// Emergency Details
router.get('/emergency', profileController.getEmergency);
router.put('/emergency', profileController.updateEmergency);

module.exports = router;
