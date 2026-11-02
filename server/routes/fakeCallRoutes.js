/**
 * server/routes/fakeCallRoutes.js — Fake Call Generator Routes (Module 8)
 */

const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const {
  getVoiceTemplates,
  createFakeCall,
  getFakeCalls,
  getFakeCallById,
  updateFakeCall,
  updateFakeCallStatus,
  deleteFakeCall,
} = require('../controllers/fakeCallController');

// All fake call endpoints require authentication
router.get('/templates', authMiddleware, getVoiceTemplates);
router.get('/templates/voices', authMiddleware, getVoiceTemplates);
router.post('/', authMiddleware, createFakeCall);
router.get('/', authMiddleware, getFakeCalls);
router.get('/:id', authMiddleware, getFakeCallById);
router.put('/:id', authMiddleware, updateFakeCall);
router.post('/:id/status', authMiddleware, updateFakeCallStatus);
router.delete('/:id', authMiddleware, deleteFakeCall);

module.exports = router;
