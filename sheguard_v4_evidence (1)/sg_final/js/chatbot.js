/**
 * js/chatbot.js — SHE-GUARD Module 9: AI Safety Assistant & Chatbot Manager
 */

let _chatSpeechRecognition = null;
let _isChatVoiceListening = false;
let _chatMessagesCache = [];

function _getChatAuthToken() {
  return typeof _getAuthToken === 'function' ? _getAuthToken() : (localStorage.getItem('sg_auth_token') || localStorage.getItem('sg_token'));
}

function _getChatApiUrl(path) {
  return typeof _getApiUrl === 'function' ? _getApiUrl(path) : path;
}

// ── 1. SEND USER MESSAGE ─────────────────────────────────
async function sgSendChatMessage(customText = null) {
  const input = document.getElementById('chatInput');
  const sendBtn = document.getElementById('chatSendBtn');
  const text = customText || (input ? input.value.trim() : '');

  if (!text) return;

  if (input) {
    input.value = '';
    input.style.height = 'auto';
  }

  // 1. Render User Bubble immediately
  _appendChatMessageToUI({
    role: 'user',
    content: text,
    createdAt: new Date().toISOString(),
  });

  // 2. Show Typing Indicator
  _showChatTypingIndicator();

  // 3. Resolve live GPS location if permitted
  let lat = undefined;
  let lng = undefined;
  try {
    if (typeof sgGetLocation === 'function') {
      const loc = await sgGetLocation();
      lat = loc.lat;
      lng = loc.lng;
    } else if (typeof _cachedLat !== 'undefined' && _cachedLat) {
      lat = _cachedLat;
      lng = _cachedLng;
    }
  } catch (e) {}

  // 4. Send request to Backend
  const token = _getChatAuthToken();
  try {
    const res = await fetch(_getChatApiUrl('/api/chat/message'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        message: text,
        latitude: lat,
        longitude: lng,
      }),
    });

    _hideChatTypingIndicator();

    const data = await res.json();
    if (data.success) {
      _appendChatMessageToUI({
        role: 'assistant',
        content: data.message,
        intent: data.intent,
        structuredData: data.structuredData,
        quickActions: data.quickActions,
        createdAt: data.createdAt || new Date().toISOString(),
      });
    } else {
      _appendChatMessageToUI({
        role: 'assistant',
        content: data.content || 'I encountered a temporary issue. For emergency assistance, please call 112 or press the Smart SOS button.',
        intent: 'EMERGENCY',
      });
    }
  } catch (err) {
    _hideChatTypingIndicator();
    _appendChatMessageToUI({
      role: 'assistant',
      content: 'Connection error. If you are in immediate danger, dial 112 or trigger Smart SOS immediately.',
      intent: 'EMERGENCY',
    });
  }
}

function sgSendQuickPrompt(query) {
  sgSendChatMessage(query);
}

// ── 2. MESSAGE UI RENDERING ──────────────────────────────
function _appendChatMessageToUI(msg) {
  const container = document.getElementById('chatMessagesThread');
  if (!container) return;

  const isUser = msg.role === 'user';
  const msgEl = document.createElement('div');
  msgEl.className = `chat-msg-wrap ${isUser ? 'user' : 'assistant'}`;

  // Formatted HTML content
  const formattedContent = _formatChatMarkdown(msg.content);

  // Build Structured Card HTML if available
  let structuredHtml = '';
  if (msg.structuredData) {
    if (msg.structuredData.type === 'PLACES_LIST' && Array.isArray(msg.structuredData.places)) {
      structuredHtml = `
        <div class="chat-places-card-deck">
          ${msg.structuredData.places.map((p, idx) => `
            <div class="chat-place-card">
              <div class="cpc-header">
                <strong>${idx + 1}. ${p.name}</strong>
                <span class="cpc-dist"><i class="fas fa-location-arrow"></i> ${p.distanceKm} km</span>
              </div>
              <div class="cpc-address"><i class="fas fa-map-pin"></i> ${p.address}</div>
              <div class="cpc-actions">
                <a href="${p.mapsUrl}" target="_blank" class="btn-cpc view" rel="noopener">
                  <i class="fas fa-map"></i> View on Map
                </a>
                <a href="tel:${p.phone.split('/')[0].trim()}" class="btn-cpc call">
                  <i class="fas fa-phone"></i> Call (${p.phone.split('/')[0].trim()})
                </a>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    } else if (msg.structuredData.type === 'EMERGENCY_ALERT') {
      structuredHtml = `
        <div class="chat-emergency-banner">
          <div class="ceb-title"><i class="fas fa-siren-on"></i> Emergency Safety Controls</div>
          <div class="ceb-actions">
            <button class="btn-chat-sos" onclick="sgTriggerChatAction('TRIGGER_SOS')">
              <i class="fas fa-shield-heart"></i> Activate Smart SOS Now
            </button>
            <a href="tel:112" class="btn-chat-call112">
              <i class="fas fa-phone"></i> Call 112 (Police)
            </a>
          </div>
        </div>
      `;
    }
  }

  // Build Quick Action Buttons
  let actionsHtml = '';
  if (msg.quickActions && Array.isArray(msg.quickActions) && msg.quickActions.length > 0) {
    actionsHtml = `
      <div class="chat-quick-actions-bar">
        ${msg.quickActions.map(act => `
          <button class="chat-action-btn ${act.variant || 'outline'}" onclick="sgTriggerChatAction('${act.action}')">
            ${act.label}
          </button>
        `).join('')}
      </div>
    `;
  }

  const timeStr = msg.createdAt
    ? new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  msgEl.innerHTML = `
    <div class="chat-avatar">${isUser ? '👤' : '🛡️'}</div>
    <div class="chat-bubble-container">
      <div class="chat-bubble">
        <div class="chat-text">${formattedContent}</div>
        ${structuredHtml}
        ${actionsHtml}
      </div>
      <span class="chat-timestamp">${timeStr}</span>
    </div>
  `;

  container.appendChild(msgEl);
  _scrollChatToBottom();
}

function _formatChatMarkdown(text) {
  if (!text) return '';
  let html = text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/^• (.*?)$/gm, '<li class="chat-li">$1</li>')
    .replace(/^\d+\. (.*?)$/gm, '<li class="chat-li num">$1</li>')
    .replace(/\n\n/g, '<br/><br/>')
    .replace(/\n/g, '<br/>');

  return html;
}

function _showChatTypingIndicator() {
  const container = document.getElementById('chatMessagesThread');
  if (!container) return;

  const existing = document.getElementById('chatTypingIndicator');
  if (existing) existing.remove();

  const typingEl = document.createElement('div');
  typingEl.id = 'chatTypingIndicator';
  typingEl.className = 'chat-msg-wrap assistant typing';
  typingEl.innerHTML = `
    <div class="chat-avatar">🛡️</div>
    <div class="chat-bubble typing-bubble">
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
    </div>
  `;
  container.appendChild(typingEl);
  _scrollChatToBottom();
}

function _hideChatTypingIndicator() {
  const existing = document.getElementById('chatTypingIndicator');
  if (existing) existing.remove();
}

function _scrollChatToBottom() {
  const container = document.getElementById('chatMessagesThread');
  if (container) {
    container.scrollTop = container.scrollHeight;
  }
}

// ── 3. CHAT ACTIONS DISPATCHER ───────────────────────────
function sgTriggerChatAction(action, payload = null) {
  switch (action) {
    case 'TRIGGER_SOS':
      if (typeof activateSOS === 'function') {
        activateSOS('hold');
        if (typeof showToast === 'function') showToast('🚨 Smart SOS Activated from Chatbot!', 'error');
      }
      break;

    case 'FIND_POLICE':
      sgSendChatMessage('Find the nearest verified police station to me');
      break;

    case 'FIND_HOSPITAL':
      sgSendChatMessage('Find the closest emergency hospital near me');
      break;

    case 'SHOW_FIRST_AID':
      sgSendChatMessage('Give me emergency first aid procedures');
      break;

    case 'OPEN_SAFE_ROUTE':
      if (typeof switchTab === 'function') {
        const tabBtn = document.querySelector(".tab[onclick*='safe-route']");
        switchTab('safe-route', tabBtn);
      }
      break;

    case 'OPEN_FAKE_CALL':
      if (typeof switchTab === 'function') {
        const tabBtn = document.querySelector(".tab[onclick*='fake-call']");
        switchTab('fake-call', tabBtn);
      }
      break;

    case 'CALL_112':
      window.location.href = 'tel:112';
      break;

    case 'CALL_108':
      window.location.href = 'tel:108';
      break;

    case 'CALL_NCW':
      window.location.href = 'tel:7827170170';
      break;

    default:
      console.log('Chat action triggered:', action, payload);
      break;
  }
}

// ── 4. CHAT HISTORY & PERSISTENCE ────────────────────────
async function sgLoadChatHistory() {
  const token = _getChatAuthToken();
  const container = document.getElementById('chatMessagesThread');
  if (!container || !token) return;

  try {
    const res = await fetch(_getChatApiUrl('/api/chat/history'), {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (data.success && Array.isArray(data.messages)) {
      container.innerHTML = '';
      if (data.messages.length === 0) {
        _renderWelcomeMessage();
        return;
      }
      data.messages.forEach(m => _appendChatMessageToUI(m));
    } else {
      _renderWelcomeMessage();
    }
  } catch (e) {
    _renderWelcomeMessage();
  }
}

function _renderWelcomeMessage() {
  const container = document.getElementById('chatMessagesThread');
  if (!container) return;
  container.innerHTML = '';
  _appendChatMessageToUI({
    role: 'assistant',
    content: `👋 **Welcome to SHE-GUARD AI Safety Assistant!**\n\nI am here to guide and protect you 24/7. Ask me about:\n\n• 🚨 **Immediate Emergency & SOS**\n• 👮 **Nearby Police Station Lookup**\n• 🏥 **Emergency Hospital Navigation**\n• 🩹 **First Aid Guidance**\n• ⚖️ **Women's Legal Rights & Zero FIR**\n• 🛡️ **Safe Walking & Travel Precautions**`,
    quickActions: [
      { label: '🚨 Emergency Help', action: 'TRIGGER_SOS', variant: 'danger' },
      { label: '👮 Find Police', action: 'FIND_POLICE', variant: 'primary' },
      { label: '🏥 Find Hospital', action: 'FIND_HOSPITAL', variant: 'primary' },
    ],
  });
}

async function sgClearChatHistory() {
  const token = _getChatAuthToken();
  if (!token) return;

  try {
    await fetch(_getChatApiUrl('/api/chat/history'), {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const container = document.getElementById('chatMessagesThread');
    if (container) container.innerHTML = '';
    _renderWelcomeMessage();
    if (typeof showToast === 'function') showToast('Chat history cleared ✓');
  } catch (e) {}
}

// ── 5. VOICE INPUT (SPEECH-TO-TEXT) ──────────────────────
function sgToggleChatVoiceInput() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const btn = document.getElementById('chatVoiceBtn');

  if (!SpeechRecognition) {
    if (typeof showToast === 'function') showToast('Speech recognition not supported in this browser', 'warning');
    return;
  }

  if (!_isChatVoiceListening) {
    try {
      _chatSpeechRecognition = new SpeechRecognition();
      _chatSpeechRecognition.continuous = false;
      _chatSpeechRecognition.interimResults = false;
      _chatSpeechRecognition.lang = 'en-US';

      _chatSpeechRecognition.onstart = () => {
        _isChatVoiceListening = true;
        if (btn) btn.classList.add('recording');
        if (typeof showToast === 'function') showToast('Listening… Speak your safety query');
      };

      _chatSpeechRecognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        const input = document.getElementById('chatInput');
        if (input) {
          input.value = transcript;
          sgSendChatMessage(transcript);
        }
      };

      _chatSpeechRecognition.onerror = (e) => {
        console.warn('Speech recognition error:', e.error);
        _isChatVoiceListening = false;
        if (btn) btn.classList.remove('recording');
      };

      _chatSpeechRecognition.onend = () => {
        _isChatVoiceListening = false;
        if (btn) btn.classList.remove('recording');
      };

      _chatSpeechRecognition.start();
    } catch (e) {
      _isChatVoiceListening = false;
      if (btn) btn.classList.remove('recording');
    }
  } else {
    if (_chatSpeechRecognition) _chatSpeechRecognition.stop();
    _isChatVoiceListening = false;
    if (btn) btn.classList.remove('recording');
  }
}

// ── 6. INITIALIZATION ────────────────────────────────────
function sgInitChatbot() {
  sgLoadChatHistory();
}
