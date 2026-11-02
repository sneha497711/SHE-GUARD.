/**
 * js/voice.js — ElevenLabs Voice Alert + Web Speech API recognition
 *

 * Voice ID: JBFqnCBsd6RMkjVDRZzb
 * Model: eleven_multilingual_v2
 */


const SG_ELEVENLABS_VOICE  = 'JBFqnCBsd6RMkjVDRZzb';
const SG_ELEVENLABS_MODEL  = 'eleven_multilingual_v2';

// ── Play ElevenLabs TTS (with browser TTS fallback) ──
async function sgPlayVoiceAlert(text) {
  sgLog('Playing voice alert…', 'info');

  // Try ElevenLabs first
  try {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${SG_ELEVENLABS_VOICE}`,
      {
        method: 'POST',
        headers: {
          'xi-api-key':   SG_ELEVENLABS_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          model_id: SG_ELEVENLABS_MODEL,
          output_format: 'mp3_44100_128',
          voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        }),
      }
    );

    if (!res.ok) throw new Error(`ElevenLabs HTTP ${res.status}`);

    const blob  = await res.blob();
    const url   = URL.createObjectURL(blob);
    const audio = new Audio(url);
    await audio.play();
    sgLog('ElevenLabs voice alert played.', 'success');
    return;
  } catch (err) {
    sgLog(`ElevenLabs failed (${err.message}) — using browser TTS.`, 'warning');
  }

  // Browser TTS fallback
  if (window.speechSynthesis) {
    const utter  = new SpeechSynthesisUtterance(text);
    utter.lang   = 'en-IN';
    utter.rate   = 0.9;
    utter.volume = 1.0;
    window.speechSynthesis.speak(utter);
    sgLog('Browser TTS voice alert played.', 'success');
  }
}

// ── Continuous speech recognition (keyword detection) ─
let _recognition   = null;
let _shouldRestart = false;
let _voiceRunning  = false;
let _onVoiceResult = null;
let _restartTimer  = null;

function sgStartVoiceRecognition(onResult) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    sgLog('Speech recognition not supported.', 'warning');
    _updateVoiceChip(false, 'Not supported');
    return false;
  }

  _onVoiceResult = onResult;
  _shouldRestart = true;
  _startRecognitionInstance();
  return true;
}

function _startRecognitionInstance() {
  if (_recognition) {
    try { _recognition.stop(); } catch(e) {}
    _recognition = null;
  }

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  _recognition = new SR();
  _recognition.continuous     = true;
  _recognition.interimResults = true;
  _recognition.lang           = 'en-IN';
  _recognition.maxAlternatives = 3;

  _recognition.onstart = () => {
    _voiceRunning = true;
    _updateVoiceChip(true);
    sgLog('Voice recognition active.', 'success');
  };

  _recognition.onresult = (event) => {
    const transcripts = [];
    for (let i = event.resultIndex; i < event.results.length; i++) {
      for (let a = 0; a < event.results[i].length; a++) {
        transcripts.push(event.results[i][a].transcript.toLowerCase().trim());
      }
    }
    if (transcripts.length > 0 && typeof _onVoiceResult === 'function') {
      _onVoiceResult(transcripts);
    }
    // Log to voice tab
    const joined = transcripts[0] || '';
    if (joined) {
      const ul = document.getElementById('voiceLogList');
      if (ul) {
        ul.querySelector('.log-empty')?.remove();
        const li = document.createElement('li');
        li.textContent = `${new Date().toLocaleTimeString()} — "${joined.slice(0, 50)}"`;
        ul.insertBefore(li, ul.firstChild);
        if (ul.children.length > 6) ul.removeChild(ul.lastChild);
      }
      // Log to Evidence tab
      if (typeof sgLogVoiceEvidence === 'function') {
        const kw = (typeof keyword !== 'undefined') ? keyword : 'help me';
        const triggered = joined.includes(kw.toLowerCase());
        sgLogVoiceEvidence(joined.slice(0, 80), triggered);
      }
    }
  };

  _recognition.onerror = (event) => {
    _voiceRunning = false;
    const ignorable = ['no-speech', 'audio-capture', 'aborted'];
    if (!ignorable.includes(event.error)) {
      sgLog(`Speech error: ${event.error}`, 'warning');
    }
    _updateVoiceChip(false, 'Reconnecting…');
    if (_shouldRestart) {
      if (_restartTimer) clearTimeout(_restartTimer);
      _restartTimer = setTimeout(() => {
        if (_shouldRestart) _startRecognitionInstance();
      }, 800);
    }
  };

  _recognition.onend = () => {
    _voiceRunning = false;
    _updateVoiceChip(false, 'Reconnecting…');
    if (_shouldRestart) {
      if (_restartTimer) clearTimeout(_restartTimer);
      _restartTimer = setTimeout(() => {
        if (_shouldRestart) _startRecognitionInstance();
      }, 500);
    }
  };

  try {
    _recognition.start();
  } catch (e) {
    sgLog(`Voice start error: ${e.message}`, 'error');
  }
}

function sgStopVoiceRecognition() {
  _shouldRestart = false;
  _voiceRunning  = false;
  if (_restartTimer) { clearTimeout(_restartTimer); _restartTimer = null; }
  if (_recognition) {
    _recognition.onend = null;
    try { _recognition.stop(); } catch(e) {}
    _recognition = null;
  }
  _updateVoiceChip(false, 'Voice: Off');
  document.getElementById('voiceIconWrap')?.classList.remove('listening');
  document.getElementById('voiceRipple')?.classList.remove('active');
}

function _updateVoiceChip(active, customText) {
  const chip = document.getElementById('voiceChip');
  const text = document.getElementById('voiceChipText');
  if (chip) chip.classList.toggle('chip-active', active);
  if (text) {
    const kw = (typeof keyword !== 'undefined') ? keyword : 'help me';
    text.textContent = customText || (active ? `"${kw}" — Listening` : 'Voice: Reconnecting…');
  }
  const wrap   = document.getElementById('voiceIconWrap');
  const ripple = document.getElementById('voiceRipple');
  if (active) {
    wrap?.classList.add('listening');
    ripple?.classList.add('active');
    const statusMsg = document.getElementById('voiceStatusMsg');
    const kw = (typeof keyword !== 'undefined') ? keyword : 'help me';
    if (statusMsg) statusMsg.textContent = `Listening for "${kw}"…`;
  } else {
    wrap?.classList.remove('listening');
    ripple?.classList.remove('active');
  }
}
