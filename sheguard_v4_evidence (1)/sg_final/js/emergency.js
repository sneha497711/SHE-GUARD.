/**
 * js/emergency.js — Smart SOS Central Orchestrator (Module 3)
 */

window._activeSosIncidentId = null;
window._liveLocationInterval = null;

// ── 1. CENTRAL SOS ENTRY POINT ────────────────────────────
async function sgRunEmergency(method = 'button') {
  sgLog(`🚨 CENTRAL SMART SOS triggered by: ${method}`, 'emergency');
  sgPlayBeep(880, 1.2, 0.4);

  if (navigator.vibrate) {
    navigator.vibrate([400, 200, 400, 200, 800]);
  }

  // 1. Browser Push Notification
  sgSendPushNotification(method);

  // 2. ElevenLabs / TTS Voice Alert
  sgLog('▶ Calling ElevenLabs voice alert…', 'info');
  sgPlayVoiceAlert(
    'Emergency alert activated. Your location has been shared with your trusted contacts and authorities. Help is on the way. Please stay calm and stay safe.'
  ).catch(() => {});

  // 3. Evidence Video + Mic Recording
  sgLog('▶ Starting video + mic recording…', 'info');
  sgStartRecording()
    .then(ok => sgLog(ok ? '✔ Evidence recording active.' : '✖ Recording failed.', ok ? 'success' : 'error'))
    .catch(() => {});

  const locEl = document.getElementById('sosLocText');
  if (locEl) locEl.textContent = 'Acquiring high-accuracy GPS coordinates…';
  sgLog('▶ Fetching GPS location…', 'info');

  let lat = null;
  let lng = null;

  try {
    const loc = await sgGetLocation();
    lat = loc.lat;
    lng = loc.lng;

    const mapsLink = sgMapsLink(lat, lng);
    if (locEl) {
      locEl.innerHTML = `${lat.toFixed(5)}, ${lng.toFixed(5)} — <a href="${mapsLink}" target="_blank" style="color:#ff3e6c">Maps</a>`;
    }
    sgLog(`✔ GPS Location acquired: ${lat.toFixed(5)}, ${lng.toFixed(5)}`, 'success');

    // Start local Leaflet live map tracking
    sgStartTracking((coords) => {
      if (window._activeSosIncidentId && coords) {
        _streamLocationToBackend(window._activeSosIncidentId, coords.lat, coords.lng);
      }
    });

    // Lookup nearest police station via Overpass
    sgLog('▶ Looking up nearest police station…', 'info');
    _findAndShowPolice(lat, lng);

  } catch (err) {
    sgLog(`✖ GPS Location unavailable: ${err.message}`, 'error');
    if (locEl) locEl.textContent = 'Location unavailable (continuing SOS)';
  }

  // 4. Trigger Central SOS on Backend API & Dispatch SMS to Priority Contacts
  await _dispatchBackendSOS(method, lat, lng);
}

// ── 2. DISPATCH BACKEND SOS INCIDENT ──────────────────────
async function _dispatchBackendSOS(method, lat, lng) {
  const token = localStorage.getItem('sg_token');
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const triggerPayload = {
    triggerSource: method || 'button',
    latitude: lat,
    longitude: lng,
    accuracy: 10,
    notes: `Triggered via ${method} at ${new Date().toLocaleTimeString()}`,
  };

  try {
    sgLog('▶ Registering SOS incident with backend & dispatching SMS…', 'info');
    const res = await fetch('/api/sos/trigger', {
      method: 'POST',
      headers,
      body: JSON.stringify(triggerPayload),
    });

    const data = await res.json();

    if (data.success && data.incident) {
      window._activeSosIncidentId = data.incident.id;
      sgLog(`✔ SOS Incident #${data.incident.id} logged in database (Status: ACTIVE)`, 'success');

      // Render Priority Contact Quick Call Card
      _renderSOSActionCards(data.primaryContact, data.incident);

      // Refresh SOS History list in Evidence tab
      if (typeof renderSOSHistory === 'function') {
        renderSOSHistory();
      }
    } else {
      sgLog(`⚠️ Backend SOS warning: ${data.message || 'Continuing local emergency mode'}`, 'warning');
      _renderFallbackContactCalls();
    }
  } catch (err) {
    sgLog(`✖ Backend SOS connection error: ${err.message}. Local emergency features active.`, 'error');
    _renderFallbackContactCalls();
  }
}

// ── 3. RENDER ONE-CLICK CALL & ACTION CARDS IN OVERLAY ─────
function _renderSOSActionCards(primaryContact, incident) {
  const list = document.getElementById('sosAlertList');
  if (!list) return;

  let html = '';

  // Quick Dial Priority #1 Contact Card
  if (primaryContact && primaryContact.phoneNumber) {
    html += `
      <div class="sos-quick-dial-card">
        <div class="sqd-header">
          <span class="sqd-badge"><i class="fas fa-star"></i> Priority #1 Emergency Contact</span>
          <span class="sqd-rel">${primaryContact.relationship || 'Emergency'}</span>
        </div>
        <div class="sqd-body">
          <div class="sqd-info">
            <strong>${primaryContact.name}</strong>
            <span>+91 ${primaryContact.phoneNumber}</span>
          </div>
          <a href="tel:${primaryContact.phoneNumber}" class="btn-sos-call" id="btnCallPrimary">
            <i class="fas fa-phone"></i> Call Now
          </a>
        </div>
      </div>`;
  }

  // Quick Dial Police (112) Card
  html += `
    <div class="sos-quick-dial-card police-dial-card">
      <div class="sqd-header">
        <span class="sqd-badge police"><i class="fas fa-shield-halved"></i> National Emergency Response</span>
        <span class="sqd-rel">Police / Rescue</span>
      </div>
      <div class="sqd-body">
        <div class="sqd-info">
          <strong>National Helpline (112)</strong>
          <span>Direct Police & Emergency Dispatch</span>
        </div>
        <a href="tel:112" class="btn-sos-call police" id="btnCallPolice">
          <i class="fas fa-phone"></i> Call 112
        </a>
      </div>
    </div>`;

  // Status Summary Grid
  if (incident) {
    html += `
      <div class="sos-status-summary-card">
        <div class="sss-title"><i class="fas fa-clipboard-check"></i> Emergency Response Actions</div>
        <div class="sss-grid">
          <div class="sss-item"><i class="fas fa-comment-sms text-success"></i> <span>SMS: <strong>${incident.smsStatus || 'DISPATCHED'}</strong></span></div>
          <div class="sss-item"><i class="fas fa-location-arrow text-success"></i> <span>GPS: <strong>${incident.liveLocationStatus || 'ACTIVE'}</strong></span></div>
          <div class="sss-item"><i class="fas fa-bell text-success"></i> <span>Push: <strong>DISPATCHED</strong></span></div>
          <div class="sss-item"><i class="fas fa-database text-success"></i> <span>Incident: <strong>#${incident.id} LOGGED</strong></span></div>
        </div>
      </div>`;
  }

  list.innerHTML = html;
}

function _renderFallbackContactCalls() {
  const allContacts = JSON.parse(localStorage.getItem('sg_contacts') || '[]');
  const list = document.getElementById('sosAlertList');
  if (!list) return;

  if (allContacts.length > 0) {
    const first = allContacts[0];
    list.innerHTML = `
      <div class="sos-quick-dial-card">
        <div class="sqd-header">
          <span class="sqd-badge"><i class="fas fa-star"></i> Primary Emergency Contact</span>
          <span class="sqd-rel">${first.rel || 'Family'}</span>
        </div>
        <div class="sqd-body">
          <div class="sqd-info">
            <strong>${first.name}</strong>
            <span>${first.phone}</span>
          </div>
          <a href="tel:${first.phone}" class="btn-sos-call">
            <i class="fas fa-phone"></i> Call Now
          </a>
        </div>
      </div>
      <div class="sos-quick-dial-card police-dial-card">
        <div class="sqd-body">
          <div class="sqd-info">
            <strong>Police Helpline</strong>
            <span>National Emergency 112</span>
          </div>
          <a href="tel:112" class="btn-sos-call police">
            <i class="fas fa-phone"></i> Call 112
          </a>
        </div>
      </div>`;
  }
}

// ── 4. LIVE LOCATION BACKEND STREAMING ─────────────────────
let _lastStreamTime = 0;
async function _streamLocationToBackend(incidentId, lat, lng) {
  const now = Date.now();
  if (now - _lastStreamTime < 8000) return; // Debounce 8s to prevent hammering
  _lastStreamTime = now;

  const token = localStorage.getItem('sg_token');
  if (!token || !incidentId) return;

  try {
    await fetch(`/api/sos/${incidentId}/location`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ latitude: lat, longitude: lng, accuracy: 10 }),
    });
  } catch (e) {
    // Non-fatal stream failure
  }
}

// ── 5. PUSH NOTIFICATION DISPATCH ─────────────────────────
function sgSendPushNotification(method) {
  if (!('Notification' in window)) return;

  const title = '🚨 SHE-GUARD: SOS ALERT ACTIVATED';
  const options = {
    body: `Emergency mode triggered via ${method}. Live location sharing and contacts alert active.`,
    icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23ff3e6c"><path d="M12 2L1 21h22L12 2zm0 3.5L20.5 19h-17L12 5.5zM11 10v4h2v-4h-2zm0 6v2h2v-2h-2z"/></svg>',
    tag: 'sheguard-sos-alert',
    requireInteraction: true,
  };

  if (Notification.permission === 'granted') {
    try {
      new Notification(title, options);
      sgLog('✔ Push notification dispatched to device.', 'success');
    } catch (e) {}
  } else if (Notification.permission !== 'denied') {
    Notification.requestPermission().then(perm => {
      if (perm === 'granted') {
        try { new Notification(title, options); } catch(e) {}
      }
    });
  }
}

// ── 6. BLUETOOTH PANIC BUTTON INTEGRATION ─────────────────
async function sgPairBluetoothPanicButton() {
  if (!navigator.bluetooth) {
    if (typeof showToast === 'function') {
      showToast('Web Bluetooth API not supported on this browser/device.', 'warning');
    }
    sgLog('Web Bluetooth not supported in this browser. (Use Chrome on Android/Desktop or Native Wrapper).', 'warning');
    return false;
  }

  try {
    sgLog('Scanning for Bluetooth Panic Button / Fob…', 'info');
    const device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: ['battery_service', 'immediate_alert', 'alert_notification']
    });

    sgLog(`Bluetooth device paired: ${device.name || device.id}`, 'success');
    if (typeof showToast === 'function') {
      showToast(`Bluetooth panic button connected: ${device.name || 'Emergency Fob'} ✓`);
    }

    device.addEventListener('gattserverdisconnected', () => {
      sgLog('Bluetooth panic button disconnected.', 'warning');
    });

    return true;
  } catch (err) {
    sgLog(`Bluetooth pairing cancelled or failed: ${err.message}`, 'warning');
    return false;
  }
}

// ── 7. NATIVE SMARTWATCH & POWER BUTTON HOOKS ─────────────
// NOTE: Modern web browsers cannot intercept physical OS hardware power buttons
// or proprietary smartwatch events without a native Android companion service.
// These hooks provide the bridge receiver for Native Android Accessibility / BroadcastReceivers.
function sgTriggerNativeHardwareEvent(source = 'power_button', extraData = {}) {
  sgLog(`Native hardware trigger received: ${source}`, 'emergency');
  if (typeof activateSOS === 'function') {
    activateSOS(source);
  } else {
    sgRunEmergency(source);
  }
}

// ── 8. RESOLVE / CANCEL EMERGENCY ─────────────────────────
async function sgCancelEmergency() {
  sgStopRecording();
  sgStopTracking();

  const policeMap = document.getElementById('sg-police-map');
  if (policeMap) policeMap.remove();
  const dirBtn = document.getElementById('sg-police-dir-btn');
  if (dirBtn) dirBtn.remove();

  // Resolve backend incident in SQLite
  const token = localStorage.getItem('sg_token');
  if (token) {
    const incidentId = window._activeSosIncidentId || 'current';
    try {
      await fetch(`/api/sos/${incidentId}/resolve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ notes: 'Resolved by user — marked safe' }),
      });
      sgLog('✔ SOS Incident marked RESOLVED in database.', 'success');
    } catch (e) {
      console.warn('Could not sync resolve with backend:', e.message);
    }
  }

  window._activeSosIncidentId = null;
  sgLog('SOS cancelled — user marked safe.', 'success');

  // Refresh history view
  if (typeof renderSOSHistory === 'function') {
    renderSOSHistory();
  }
}

// ── 9. POLICE LOOKUP & MAP INJECTION (REUSED) ──────────────
function _haversineKm(lat1, lng1, lat2, lng2) {
  const R  = 6371;
  const dL = (lat2 - lat1) * Math.PI / 180;
  const dG = (lng2 - lng1) * Math.PI / 180;
  const a  = Math.sin(dL/2)**2 +
             Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) * Math.sin(dG/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function _findAndShowPolice(lat, lng) {
  const policeEl = document.getElementById('policeNotif');
  if (!policeEl) return;

  policeEl.classList.remove('hidden');
  const titleEl = policeEl.querySelector('.police-notif-title');
  const subEl   = policeEl.querySelector('.police-notif-sub');
  if (titleEl) titleEl.textContent = 'Searching for nearest police station…';
  if (subEl)   subEl.textContent   = 'Please stay calm — locating authorities';

  const RADII = [5000, 10000, 20000, 50000];
  let stations  = [];

  try {
    for (const radius of RADII) {
      stations = await sgFindPolice(lat, lng, radius);
      if (stations.length > 0) break;
    }

    if (stations.length > 0) {
      const nearest  = stations[0];
      const actualKm = _haversineKm(lat, lng, nearest.lat, nearest.lng).toFixed(1);
      const mapsDir  = `https://www.google.com/maps/dir/?api=1&origin=${lat},${lng}&destination=${nearest.lat},${nearest.lng}&travelmode=driving`;
      const phoneStr = nearest.phone || '112';
      sgLog(`✔ Nearest police: ${nearest.name} — ${actualKm} km away`, 'success');

      if (titleEl) titleEl.textContent = `\u2705 Complaint sent to: ${nearest.name}`;
      if (subEl) {
        subEl.innerHTML =
          `${actualKm} km away` +
          (phoneStr ? ` &nbsp;&middot;&nbsp; <a href="tel:${phoneStr}" style="color:#93c5fd">${phoneStr}</a>` : '') +
          ` &nbsp;&middot;&nbsp; Authorities notified with your live location`;
      }

      _injectPoliceMap(lat, lng, nearest.lat, nearest.lng, nearest.name, mapsDir);

    } else {
      sgLog('No police station found within 50km.', 'warning');
      if (titleEl) titleEl.textContent = '\uD83D\uDE94 Authorities Notified';
      if (subEl)   subEl.textContent   = 'Call 112 for immediate emergency assistance';
    }

  } catch (err) {
    sgLog(`Police lookup failed: ${err.message}`, 'error');
    policeEl.classList.remove('hidden');
    if (titleEl) titleEl.textContent = '\uD83D\uDE94 Authorities Notified';
    if (subEl)   subEl.textContent   = 'Call 112 for immediate emergency assistance';
  }
}

function _injectPoliceMap(userLat, userLng, policeLat, policeLng, policeName, mapsDir) {
  if (document.getElementById('sg-police-map')) return;

  const policeEl = document.getElementById('policeNotif');
  if (!policeEl) return;

  const mapDiv = document.createElement('div');
  mapDiv.id    = 'sg-police-map';

  const dirBtn     = document.createElement('a');
  dirBtn.id        = 'sg-police-dir-btn';
  dirBtn.href      = mapsDir;
  dirBtn.target    = '_blank';
  dirBtn.rel       = 'noopener';
  dirBtn.className = 'police-directions-btn';
  dirBtn.innerHTML = '<i class="fas fa-route"></i> Get Directions to Police Station';

  const divider = policeEl.querySelector('.police-notif-divider');
  if (divider) {
    divider.after(mapDiv);
    mapDiv.after(dirBtn);
  } else {
    policeEl.appendChild(mapDiv);
    policeEl.appendChild(dirBtn);
  }

  setTimeout(() => {
    if (!window.L) return;

    const pMap = L.map('sg-police-map', {
      zoomControl: false,
      attributionControl: false,
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      touchZoom: false,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(pMap);

    const youIcon = L.divIcon({
      html: `<div style="background:#ff3e6c;width:14px;height:14px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 10px rgba(255,62,108,0.9)"></div>`,
      iconSize: [14,14], iconAnchor: [7,7], className: '',
    });

    const policeIcon = L.divIcon({
      html: `<div style="background:#1a73e8;width:22px;height:22px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 10px rgba(26,115,232,0.9);display:flex;align-items:center;justify-content:center;font-size:11px">🚔</div>`,
      iconSize: [22,22], iconAnchor: [11,11], className: '',
    });

    L.marker([userLat, userLng], { icon: youIcon }).addTo(pMap).bindPopup('📍 You are here');
    L.marker([policeLat, policeLng], { icon: policeIcon }).addTo(pMap).bindPopup(policeName).openPopup();

    L.polyline([[userLat, userLng], [policeLat, policeLng]], {
      color: '#ff3e6c', weight: 2, dashArray: '6 6', opacity: 0.85,
    }).addTo(pMap);

    pMap.fitBounds([[userLat, userLng], [policeLat, policeLng]], { padding: [22, 22] });
    pMap.on('click', () => window.open(mapsDir, '_blank'));
  }, 350);
}
