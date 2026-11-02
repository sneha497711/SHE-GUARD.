/**
 * js/motion.js — DeviceMotion shake & fall detection
 */

const SHAKE_THRESHOLD  = 18;   // m/s² delta between readings
const SHAKE_COUNT_REQ  = 3;    // consecutive shakes required
const SHAKE_WINDOW_MS  = 1500; // time window for counting shakes
const FALL_THRESHOLD   = 2;    // near-zero accel = freefall

let _motionCallback = null;
let _isMonitoring   = false;
let _lastAccel      = null;
let _shakeTimes     = [];

function sgStartMotionMonitor(onTrigger) {
  if (!window.DeviceMotionEvent) {
    sgLog('DeviceMotion not supported.', 'warning');
    document.getElementById('motionChip')?.classList.remove('chip-active');
    return false;
  }

  _motionCallback = onTrigger;
  _isMonitoring   = true;
  _shakeTimes     = [];
  _lastAccel      = null;

  window.addEventListener('devicemotion', _handleMotion, true);
  document.getElementById('motionChip')?.classList.add('chip-active');
  sgLog('Motion monitoring active.', 'success');
  return true;
}

function sgStopMotionMonitor() {
  window.removeEventListener('devicemotion', _handleMotion, true);
  _isMonitoring   = false;
  _motionCallback = null;
  document.getElementById('motionChip')?.classList.remove('chip-active');
}

function _handleMotion(event) {
  if (!_isMonitoring) return;

  const acc = event.accelerationIncludingGravity;
  if (!acc) return;

  const x = acc.x || 0;
  const y = acc.y || 0;
  const z = acc.z || 0;
  const total = Math.sqrt(x*x + y*y + z*z);
  const now   = Date.now();

  // Shake detection: compare delta from last reading
  if (_lastAccel) {
    const dx    = Math.abs(x - _lastAccel.x);
    const dy    = Math.abs(y - _lastAccel.y);
    const dz    = Math.abs(z - _lastAccel.z);
    const delta = Math.sqrt(dx*dx + dy*dy + dz*dz);

    if (delta > SHAKE_THRESHOLD) {
      _shakeTimes.push(now);
      _shakeTimes = _shakeTimes.filter(t => now - t < SHAKE_WINDOW_MS);

      if (_shakeTimes.length >= SHAKE_COUNT_REQ) {
        sgLog(`Shake detected! (${delta.toFixed(1)} m/s²)`, 'emergency');
        _shakeTimes = [];
        if (_motionCallback) _motionCallback('phone_shake');
        return;
      }
    }
  }

  // Freefall + impact detection
  if (total < FALL_THRESHOLD && total > 0) {
    _lastAccel = { x, y, z, wasFalling: true, fallTime: now };
    return;
  }
  if (_lastAccel?.wasFalling && total > 25 && (now - _lastAccel.fallTime) < 800) {
    sgLog(`Fall + impact detected!`, 'emergency');
    if (_motionCallback) _motionCallback('phone_fall');
    return;
  }

  _lastAccel = { x, y, z, wasFalling: false };
}
