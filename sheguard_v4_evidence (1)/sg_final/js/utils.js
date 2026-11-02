/**
 * js/utils.js — Shared Utilities (no ES module imports)
 */

function sgLog(message, type = 'info') {
  const now  = new Date();
  const time = now.toTimeString().split(' ')[0];
  const styles = {
    info:      'color:#00aaff',
    success:   'color:#00ff88',
    warning:   'color:#ffaa00',
    error:     'color:#ff2244',
    emergency: 'color:#ff2244;font-weight:bold',
  };
  console.log(`%c[SHE-GUARD ${time}] ${message}`, styles[type] || styles.info);

  const logList = document.getElementById('voiceLogList');
  if (logList && type !== 'info') {
    const empty = logList.querySelector('.log-empty');
    if (empty) empty.remove();
    const li = document.createElement('li');
    li.textContent = `${time} [${type}] ${message.slice(0, 60)}`;
    logList.insertBefore(li, logList.firstChild);
    while (logList.children.length > 8) logList.removeChild(logList.lastChild);
  }
}

function sgTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function sgEscapeHtml(str) {
  const d = document.createElement('div');
  d.appendChild(document.createTextNode(String(str ?? '')));
  return d.innerHTML;
}

function sgPlayBeep(freq = 880, duration = 0.5, volume = 0.3) {
  try {
    const ctx  = new (window.AudioContext || window.webkitAudioContext)();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'square';
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch (e) {
    console.warn('Beep failed:', e);
  }
}
