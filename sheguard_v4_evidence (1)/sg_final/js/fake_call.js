/**
 * js/fake_call.js — SHE-GUARD Module 8: Fake Call Generator & Simulator
 */

let _activeFakeCallTimer = null;
let _scheduledCallData = null;
let _fakeCallAudioCtx = null;
let _ringtoneInterval = null;
let _callDurationTimer = null;
let _callDurationSeconds = 0;
let _customVoiceBlob = null;
let _customVoiceBase64 = null;
let _voiceMediaRecorder = null;
let _voiceAudioChunks = [];
let _isVoiceRecording = false;

// Preset Voice Dialogues
const FAKE_VOICE_PRESETS = {
  mom_checkin: "Hey sweetie! Where are you right now? Dinner is on the table and Dad is waiting outside in the car for you. Hurry home!",
  friend_pickup: "Hey! I am parked right outside your building with the car running. Come out right now, we need to leave!",
  boss_urgent: "Hi, sorry to call so late, but we have an urgent escalation on the project. Are you near your laptop? Please jump on the bridge immediately.",
  brother_location: "Haan I just reached the gate. I am standing near the front entrance. Come outside quickly, lets head back.",
};

// ── 1. WEB AUDIO RINGTONE SYNTHESIZER ────────────────────
function _getAudioContext() {
  if (!_fakeCallAudioCtx) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    _fakeCallAudioCtx = new AudioContext();
  }
  if (_fakeCallAudioCtx.state === 'suspended') {
    _fakeCallAudioCtx.resume();
  }
  return _fakeCallAudioCtx;
}

function sgPlayTone(freq, duration, type = 'sine', gainVal = 0.3) {
  try {
    const ctx = _getAudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);

    gain.gain.setValueAtTime(gainVal, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch (e) {
    console.warn('Audio tone error:', e);
  }
}

function sgStartRingtoneLoop(ringtoneType = 'marimba') {
  sgStopRingtone();
  const ctx = _getAudioContext();

  function playPattern() {
    if (ringtoneType === 'classic_bell') {
      // Classic dual-tone telephone bell
      for (let i = 0; i < 8; i++) {
        setTimeout(() => {
          sgPlayTone(750, 0.08, 'square', 0.2);
          sgPlayTone(850, 0.08, 'square', 0.2);
        }, i * 100);
      }
    } else if (ringtoneType === 'radar_electronic') {
      // Futuristic electronic radar chime
      [587.33, 880.0, 1174.66, 1760.0].forEach((freq, idx) => {
        setTimeout(() => sgPlayTone(freq, 0.25, 'triangle', 0.3), idx * 140);
      });
    } else if (ringtoneType === 'gentle_harp') {
      // Soothing harp arpeggio
      [523.25, 659.25, 783.99, 1046.5].forEach((freq, idx) => {
        setTimeout(() => sgPlayTone(freq, 0.5, 'sine', 0.25), idx * 180);
      });
    } else {
      // Default: Marimba iPhone chime
      const notes = [659.25, 659.25, 880.0, 783.99, 659.25, 587.33];
      const delays = [0, 140, 280, 440, 580, 720];
      notes.forEach((note, i) => {
        setTimeout(() => sgPlayTone(note, 0.22, 'triangle', 0.35), delays[i]);
      });
    }
  }

  playPattern();
  _ringtoneInterval = setInterval(playPattern, 2400);
}

function sgStopRingtone() {
  if (_ringtoneInterval) {
    clearInterval(_ringtoneInterval);
    _ringtoneInterval = null;
  }
}

function sgPreviewSelectedRingtone() {
  const ringtone = document.getElementById('fcRingtoneSelect')?.value || 'marimba';
  sgStartRingtoneLoop(ringtone);
  setTimeout(sgStopRingtone, 2800);
  if (typeof showToast === 'function') showToast(`Playing ringtone preview (${ringtone}) ♪`);
}

// ── 2. VOICE SYNTHESIS & RECORDING ───────────────────────
function sgPlayVoiceDialogue(voiceType, customData = null) {
  if (customData) {
    try {
      const audio = new Audio(customData);
      audio.play().catch(e => console.warn('Custom voice playback failed:', e));
      return;
    } catch (e) {}
  }

  const text = FAKE_VOICE_PRESETS[voiceType] || FAKE_VOICE_PRESETS.mom_checkin;
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 1.1;

    // Try finding an English female/natural voice
    const voices = window.speechSynthesis.getVoices();
    const naturalVoice = voices.find(v => v.lang.startsWith('en') && (v.name.includes('Female') || v.name.includes('Google') || v.name.includes('Natural')));
    if (naturalVoice) utterance.voice = naturalVoice;

    window.speechSynthesis.speak(utterance);
  }
}

function sgStopVoicePlayback() {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}

// Custom Voice Microphone Recording
async function sgToggleCustomVoiceRecord() {
  const btn = document.getElementById('btnRecordVoice');
  const statusTxt = document.getElementById('voiceRecordStatus');

  if (!_isVoiceRecording) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      _voiceAudioChunks = [];
      _voiceMediaRecorder = new MediaRecorder(stream);

      _voiceMediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) _voiceAudioChunks.push(e.data);
      };

      _voiceMediaRecorder.onstop = async () => {
        _customVoiceBlob = new Blob(_voiceAudioChunks, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.readAsDataURL(_customVoiceBlob);
        reader.onloadend = () => {
          _customVoiceBase64 = reader.result;
          if (statusTxt) statusTxt.textContent = 'Custom Voice Saved ✓ (Ready for call)';
          const previewBtn = document.getElementById('btnPreviewVoice');
          if (previewBtn) previewBtn.classList.remove('hidden');
          if (typeof showToast === 'function') showToast('Custom voice message recorded ✓', 'success');
        };
      };

      _voiceMediaRecorder.start();
      _isVoiceRecording = true;
      if (btn) btn.innerHTML = '<i class="fas fa-stop text-rose"></i> Stop Recording';
      if (statusTxt) statusTxt.textContent = 'Recording custom voice… Speak now!';
    } catch (e) {
      if (typeof showToast === 'function') showToast('Microphone access denied: ' + e.message, 'error');
    }
  } else {
    if (_voiceMediaRecorder && _voiceMediaRecorder.state === 'recording') {
      _voiceMediaRecorder.stop();
      _voiceMediaRecorder.stream.getTracks().forEach(t => t.stop());
    }
    _isVoiceRecording = false;
    if (btn) btn.innerHTML = '<i class="fas fa-microphone"></i> Re-record Voice';
  }
}

function sgPreviewCustomVoice() {
  if (_customVoiceBase64) {
    const audio = new Audio(_customVoiceBase64);
    audio.play();
  } else {
    const voiceType = document.getElementById('fcVoiceSelect')?.value || 'mom_checkin';
    sgPlayVoiceDialogue(voiceType);
  }
}

// ── 3. SCHEDULE FAKE CALL ────────────────────────────────
async function sgScheduleFakeCall() {
  const callerName = document.getElementById('fcCallerNameInput')?.value.trim() || 'Mom';
  const callerNumber = document.getElementById('fcCallerNumberInput')?.value.trim() || '+91 98765 43210';
  const callerAvatar = document.getElementById('fcCallerAvatarSelect')?.value || '👩';
  const ringtone = document.getElementById('fcRingtoneSelect')?.value || 'marimba';
  const voiceType = document.getElementById('fcVoiceSelect')?.value || 'mom_checkin';
  const delayType = document.getElementById('fcDelaySelect')?.value || '0';

  let delaySeconds = parseInt(delayType);
  if (delayType === 'custom') {
    const customMin = parseInt(document.getElementById('fcCustomMin')?.value || 0);
    const customSec = parseInt(document.getElementById('fcCustomSec')?.value || 0);
    delaySeconds = customMin * 60 + customSec;
  }

  const callConfig = {
    callerName,
    callerNumber,
    callerAvatar,
    ringtone,
    voiceType,
    customVoiceData: _customVoiceBase64 || '',
    delaySeconds,
    status: 'SCHEDULED',
  };

  const token = typeof _getAuthToken === 'function' ? _getAuthToken() : (localStorage.getItem('sg_auth_token') || localStorage.getItem('sg_token'));

  // Save to backend if authenticated
  let savedId = Date.now();
  if (token) {
    try {
      const res = await fetch(typeof _getApiUrl === 'function' ? _getApiUrl('/api/fake-calls') : '/api/fake-calls', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(callConfig)
      });
      const data = await res.json();
      if (data.success && data.fakeCall) {
        savedId = data.fakeCall.id;
      }
    } catch (e) {
      console.warn('Backend fake call save error, running locally:', e.message);
    }
  }

  callConfig.id = savedId;
  _scheduledCallData = callConfig;

  if (delaySeconds === 0) {
    // Immediate Trigger
    sgTriggerIncomingCall(callConfig);
  } else {
    // Scheduled Countdown
    _startScheduleCountdown(callConfig, delaySeconds);
    if (typeof showToast === 'function') {
      showToast(`Fake call from "${callerName}" scheduled in ${delaySeconds} seconds ✓`, 'success');
    }
    sgLoadFakeCallHistory();
  }
}

function _startScheduleCountdown(callConfig, secondsRemaining) {
  if (_activeFakeCallTimer) clearInterval(_activeFakeCallTimer);

  const countdownPanel = document.getElementById('fakeCallCountdownPanel');
  const timerEl = document.getElementById('fcCountdownRemaining');
  const nameEl = document.getElementById('fcCountdownCaller');

  if (countdownPanel) countdownPanel.classList.remove('hidden');
  if (nameEl) nameEl.textContent = callConfig.callerName;

  let remaining = secondsRemaining;

  function tick() {
    if (remaining <= 0) {
      clearInterval(_activeFakeCallTimer);
      _activeFakeCallTimer = null;
      if (countdownPanel) countdownPanel.classList.add('hidden');
      sgTriggerIncomingCall(callConfig);
      return;
    }

    const mins = Math.floor(remaining / 60);
    const secs = remaining % 60;
    if (timerEl) timerEl.textContent = `${mins > 0 ? mins + 'm ' : ''}${secs}s`;
    remaining--;
  }

  tick();
  _activeFakeCallTimer = setInterval(tick, 1000);
}

function sgCancelScheduledCall() {
  if (_activeFakeCallTimer) {
    clearInterval(_activeFakeCallTimer);
    _activeFakeCallTimer = null;
  }

  document.getElementById('fakeCallCountdownPanel')?.classList.add('hidden');

  if (_scheduledCallData && _scheduledCallData.id) {
    _updateBackendCallStatus(_scheduledCallData.id, 'CANCELLED');
  }

  _scheduledCallData = null;
  if (typeof showToast === 'function') showToast('Scheduled fake call cancelled');
  sgLoadFakeCallHistory();
}

// ── 4. INCOMING & CONNECTED CALL UI LIFECYCLE ────────────
let _ringingTimeoutTimer = null;

function sgTriggerIncomingCall(config) {
  _scheduledCallData = config;

  // Set Incoming Call UI text
  const avatarEl = document.getElementById('fcIncomingAvatar');
  const nameEl = document.getElementById('fcIncomingName');
  const numEl = document.getElementById('fcIncomingNumber');

  if (avatarEl) avatarEl.textContent = config.callerAvatar || '👩';
  if (nameEl) nameEl.textContent = config.callerName || 'Mom';
  if (numEl) numEl.textContent = config.callerNumber || '+91 98765 43210';

  // Show incoming call overlay
  const incomingModal = document.getElementById('fakeCallIncomingModal');
  if (incomingModal) incomingModal.classList.remove('hidden');

  // Start sound loop
  sgStartRingtoneLoop(config.ringtone || 'marimba');

  // Set 45s ringing timeout
  if (_ringingTimeoutTimer) clearTimeout(_ringingTimeoutTimer);
  _ringingTimeoutTimer = setTimeout(() => {
    sgDeclineFakeCall('MISSED');
  }, 45000);

  // Update backend status to RINGING
  if (config.id) _updateBackendCallStatus(config.id, 'RINGING');
}

function sgAcceptFakeCall() {
  sgStopRingtone();
  if (_ringingTimeoutTimer) clearTimeout(_ringingTimeoutTimer);

  document.getElementById('fakeCallIncomingModal')?.classList.add('hidden');

  // Setup Connected Call Screen
  const config = _scheduledCallData || { callerName: 'Mom', callerAvatar: '👩' };
  const avatarEl = document.getElementById('fcConnectedAvatar');
  const nameEl = document.getElementById('fcConnectedName');
  const timerEl = document.getElementById('fcConnectedDuration');

  if (avatarEl) avatarEl.textContent = config.callerAvatar || '👩';
  if (nameEl) nameEl.textContent = config.callerName || 'Mom';
  if (timerEl) timerEl.textContent = '00:00';

  document.getElementById('fakeCallConnectedModal')?.classList.remove('hidden');

  // Start active call duration counter
  _callDurationSeconds = 0;
  if (_callDurationTimer) clearInterval(_callDurationTimer);
  _callDurationTimer = setInterval(() => {
    _callDurationSeconds++;
    const m = String(Math.floor(_callDurationSeconds / 60)).padStart(2, '0');
    const s = String(_callDurationSeconds % 60).padStart(2, '0');
    if (timerEl) timerEl.textContent = `${m}:${s}`;
  }, 1000);

  // Play voice message
  sgPlayVoiceDialogue(config.voiceType || 'mom_checkin', config.customVoiceData);

  // Update backend status to ANSWERED
  if (config.id) _updateBackendCallStatus(config.id, 'ANSWERED');
}

function sgDeclineFakeCall(status = 'REJECTED') {
  sgStopRingtone();
  if (_ringingTimeoutTimer) clearTimeout(_ringingTimeoutTimer);

  document.getElementById('fakeCallIncomingModal')?.classList.add('hidden');

  if (_scheduledCallData && _scheduledCallData.id) {
    _updateBackendCallStatus(_scheduledCallData.id, status);
  }

  if (typeof showToast === 'function') {
    showToast(status === 'MISSED' ? 'Fake call missed' : 'Fake call declined');
  }

  _scheduledCallData = null;
  sgLoadFakeCallHistory();
}

function sgEndConnectedFakeCall() {
  if (_callDurationTimer) {
    clearInterval(_callDurationTimer);
    _callDurationTimer = null;
  }

  sgStopVoicePlayback();
  document.getElementById('fakeCallConnectedModal')?.classList.add('hidden');

  if (_scheduledCallData && _scheduledCallData.id) {
    _updateBackendCallStatus(_scheduledCallData.id, 'COMPLETED');
  }

  if (typeof showToast === 'function') {
    showToast(`Fake call ended (${_callDurationSeconds}s) ✓`, 'info');
  }

  _scheduledCallData = null;
  sgLoadFakeCallHistory();
}

// ── 5. BACKEND SYNC & HISTORY ────────────────────────────
async function _updateBackendCallStatus(id, status) {
  const token = typeof _getAuthToken === 'function' ? _getAuthToken() : (localStorage.getItem('sg_auth_token') || localStorage.getItem('sg_token'));
  if (!token) return;

  try {
    await fetch(typeof _getApiUrl === 'function' ? _getApiUrl(`/api/fake-calls/${id}/status`) : `/api/fake-calls/${id}/status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ status })
    });
  } catch (e) {}
}

async function sgLoadFakeCallHistory() {
  const token = typeof _getAuthToken === 'function' ? _getAuthToken() : (localStorage.getItem('sg_auth_token') || localStorage.getItem('sg_token'));
  const container = document.getElementById('fakeCallHistoryList');
  if (!container || !token) return;

  try {
    const res = await fetch(typeof _getApiUrl === 'function' ? _getApiUrl('/api/fake-calls') : '/api/fake-calls', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (data.success && data.fakeCalls) {
      if (data.fakeCalls.length === 0) {
        container.innerHTML = `<div class="empty-state-sm"><i class="fas fa-clock-rotate-left"></i> No fake calls logged yet</div>`;
        return;
      }

      container.innerHTML = data.fakeCalls.slice(0, 5).map(c => `
        <div class="fc-history-item">
          <div class="fch-avatar">${c.callerAvatar || '👩'}</div>
          <div class="fch-info">
            <strong>${c.callerName}</strong>
            <span>${new Date(c.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} &nbsp;·&nbsp; ${c.ringtone}</span>
          </div>
          <span class="fch-badge ${c.status.toLowerCase()}">${c.status}</span>
        </div>
      `).join('');
    }
  } catch (e) {}
}

// ── 6. QUICK CALLER & DELAY SHORTCUTS ────────────────────
function sgSetCallerPreset(name, phone, avatar, voiceKey) {
  const nameInput = document.getElementById('fcCallerNameInput');
  const phoneInput = document.getElementById('fcCallerNumberInput');
  const avatarSelect = document.getElementById('fcCallerAvatarSelect');
  const voiceSelect = document.getElementById('fcVoiceSelect');

  if (nameInput) nameInput.value = name;
  if (phoneInput) phoneInput.value = phone;
  if (avatarSelect) avatarSelect.value = avatar;
  if (voiceSelect) voiceSelect.value = voiceKey;

  // Highlight active pill
  document.querySelectorAll('.caller-preset-pill').forEach(btn => btn.classList.remove('active'));
  if (typeof showToast === 'function') showToast(`Caller profile set to "${name}" ✓`);
}

function sgQuickTriggerDelay(seconds) {
  const delaySelect = document.getElementById('fcDelaySelect');
  if (delaySelect) {
    delaySelect.value = String(seconds);
    const customRow = document.getElementById('fcCustomDelayRow');
    if (customRow) customRow.classList.add('hidden');
  }
  sgScheduleFakeCall();
}

function sgOnDelayChange(selectEl) {
  const customRow = document.getElementById('fcCustomDelayRow');
  if (!customRow) return;
  if (selectEl.value === 'custom') {
    customRow.classList.remove('hidden');
  } else {
    customRow.classList.add('hidden');
  }
}

function sgInitFakeCall() {
  sgLoadFakeCallHistory();
}
