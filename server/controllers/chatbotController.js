/**
 * server/controllers/chatbotController.js — AI Chatbot Assistant Controller (Module 9)
 */

const Chat = require('../models/Chat');
const User = require('../models/User');
const { generateSafetyResponse, fetchNearbyPlacesFromOverpass } = require('../services/chatbotService');

// ── 1. SEND MESSAGE & GET AI SAFETY RESPONSE ─────────────
async function sendMessage(req, res) {
  try {
    const { message, latitude, longitude } = req.body;
    const userId = req.userId;

    if (!message || !message.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Message text cannot be empty.',
      });
    }

    const conv = await Chat.getOrCreateActiveConversation(userId);

    // Save User message
    await Chat.addMessage({
      conversationId: conv.id,
      userId,
      role: 'user',
      content: message.trim(),
      intent: 'USER_QUERY',
    });

    // Retrieve safe user context
    let userContext = {};
    try {
      const user = await User.findById(userId);
      if (user) {
        userContext = {
          name: user.fullName,
          bloodGroup: user.bloodGroup,
          hasEmergencyContact: !!user.emergencyContactName,
        };
      }
    } catch (e) {}

    // Generate AI Safety Assistant response
    const location = (latitude !== undefined && longitude !== undefined)
      ? { latitude: parseFloat(latitude), longitude: parseFloat(longitude) }
      : null;

    const safetyResult = await generateSafetyResponse({
      message: message.trim(),
      userContext,
      location,
    });

    // Save Assistant reply
    const assistantMsg = await Chat.addMessage({
      conversationId: conv.id,
      userId,
      role: 'assistant',
      content: safetyResult.content,
      intent: safetyResult.intent,
      structuredData: safetyResult.structuredData,
    });

    return res.status(200).json({
      success: true,
      message: assistantMsg.content,
      intent: assistantMsg.intent,
      structuredData: safetyResult.structuredData,
      quickActions: safetyResult.quickActions,
      messageId: assistantMsg.id,
      createdAt: assistantMsg.createdAt,
    });
  } catch (error) {
    console.error('[Chatbot SendMessage Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to process AI safety response. Please try again.',
      content: 'I encountered a brief connection issue. If you are in emergency danger, please call 112 or press Smart SOS immediately.',
    });
  }
}

// ── 2. GET USER CHAT HISTORY ─────────────────────────────
async function getHistory(req, res) {
  try {
    const userId = req.userId;
    const history = await Chat.getMessages(userId, 50);

    return res.status(200).json({
      success: true,
      conversationId: history.conversation.id,
      messages: history.messages,
    });
  } catch (error) {
    console.error('[Chatbot GetHistory Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve chat history.',
      messages: [],
    });
  }
}

// ── 3. CLEAR CHAT HISTORY ────────────────────────────────
async function clearHistory(req, res) {
  try {
    const userId = req.userId;
    await Chat.clearUserHistory(userId);

    return res.status(200).json({
      success: true,
      message: 'Chat history cleared successfully.',
    });
  } catch (error) {
    console.error('[Chatbot ClearHistory Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to clear chat history.',
    });
  }
}

// ── 4. DIRECT NEARBY PLACES LOOKUP (POLICE / HOSPITALS) ──
async function lookupNearby(req, res) {
  try {
    const { type = 'police', latitude = 28.6139, longitude = 77.2090, radius = 5000 } = req.body;
    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);

    let places = [];
    try {
      places = await fetchNearbyPlacesFromOverpass(lat, lng, type === 'hospital' ? 'hospital' : 'police', radius);
    } catch (e) {}

    return res.status(200).json({
      success: true,
      category: type.toUpperCase(),
      count: places.length,
      places,
    });
  } catch (error) {
    console.error('[Chatbot LookupNearby Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'Error looking up nearby emergency facilities.',
      places: [],
    });
  }
}

// ── 5. GET SUGGESTED PROMPTS ─────────────────────────────
function getSuggestedPrompts(req, res) {
  const prompts = [
    { label: '🚨 Emergency Help', query: 'I need emergency help right now!', category: 'EMERGENCY' },
    { label: '👮 Nearest Police Station', query: 'Find the nearest police station to my location', category: 'POLICE' },
    { label: '🏥 Nearest Hospital', query: 'Find the closest emergency hospital near me', category: 'HOSPITAL' },
    { label: '🩹 First Aid for Burns', query: 'How to give first aid for a burn?', category: 'FIRST_AID' },
    { label: '🩹 Severe Bleeding Aid', query: 'First aid for severe bleeding and cuts', category: 'FIRST_AID' },
    { label: '⚖️ How to file Zero FIR', query: 'What is a Zero FIR and how can I file one?', category: 'LEGAL' },
    { label: '⚖️ Workplace Harassment (POSH)', query: 'What are my legal rights regarding workplace harassment?', category: 'LEGAL' },
    { label: '🚶‍♀️ Walking Home Alone', query: 'I am walking home alone at night. What safety precautions should I take?', category: 'SAFETY' },
    { label: '🚗 Cab & Taxi Precautions', query: 'What safety steps should I follow when traveling in a cab?', category: 'SAFETY' },
  ];

  return res.status(200).json({
    success: true,
    prompts,
  });
}

module.exports = {
  sendMessage,
  getHistory,
  clearHistory,
  lookupNearby,
  getSuggestedPrompts,
};
