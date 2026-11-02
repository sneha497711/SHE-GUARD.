/**
 * server/routes/chatbotRoutes.js — AI Chatbot Assistant Routes (Module 9)
 */

const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const {
  sendMessage,
  getHistory,
  clearHistory,
  lookupNearby,
  getSuggestedPrompts,
} = require('../controllers/chatbotController');

// All chatbot endpoints require authentication
router.post('/message', authMiddleware, sendMessage);
router.get('/history', authMiddleware, getHistory);
router.delete('/history', authMiddleware, clearHistory);
router.post('/nearby', authMiddleware, lookupNearby);
router.get('/prompts', authMiddleware, getSuggestedPrompts);

module.exports = router;
