/**
 * js/location.js — Live GPS Tracking, Routing, Geofencing & Family Location Sharing (Module 4)
 */

let _cachedLat = null;
let _cachedLng = null;
let _cachedAccuracy = 10;
let _watchId = null;
let _leafletMap = null;
let _userMarker = null;
let _destMarker = null;
let _routePolyline = null;
let _geofenceCircles = [];
let _familyMarkers = [];

let _isTrackingActive = false;
let _activeDestination = null;
let _activeRouteMode = 'route_safe'; // 'route_safe' or 'route_direct'
let _currentRouteData = null;
let _userGeofences = [];
let _geofenceStateMap = {}; // { [geofenceId]: boolean (wasInside) }

function _getAuthToken() {
  return localStorage.getItem('sg_auth_token') || localStorage.getItem('sg_token');
}

function _getApiUrl(path) {
  const base = (typeof API_BASE_URL !== 'undefined')
    ? API_BASE_URL
    : ((window.location.protocol === 'file:' || window.location.port === '5500' || window.location.port === '3000') ? 'http://localhost:5000' : window.location.origin);
  return `${base}${path.startsWith('/') ? path : '/' + path}`;
}

// ── 1. GET CURRENT GPS POSITION ──────────────────────────
function sgGetLocation() {
  return new Promise((resolve, reject) => {
    if (_cachedLat !== null && _cachedLng !== null) {
      return resolve({ lat: _cachedLat, lng: _cachedLng, accuracy: _cachedAccuracy });
    }
    if (!navigator.geolocation) {
      return reject(new Error('Geolocation not supported on this device'));
    }
    navigator.geolocation.getCurrentPosition(
      pos => {
        _cachedLat = pos.coords.latitude;
        _cachedLng = pos.coords.longitude;
        _cachedAccuracy = pos.coords.accuracy || 10;
        sgLog(`GPS Location acquired: ${_cachedLat.toFixed(5)}, ${_cachedLng.toFixed(5)} (±${Math.round(_cachedAccuracy)}m)`, 'success');
        resolve({ lat: _cachedLat, lng: _cachedLng, accuracy: _cachedAccuracy });
      },
      err => {
        sgLog(`GPS Location error: ${err.message}`, 'error');
        reject(err);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  });
}

function sgMapsLink(lat, lng) {
  return `https://maps.google.com/?q=${lat},${lng}`;
}

// ── 2. INITIALIZE LEAFLET INTERACTIVE MAP ────────────────
function sgInitMap(lat, lng) {
  const overlay = document.getElementById('mapOverlay');
  if (overlay) overlay.classList.add('hidden');

  let mapDiv = document.getElementById('sg-leaflet-map');
  if (!mapDiv) {
    const placeholder = document.querySelector('.map-placeholder');
    if (!placeholder) return;
    mapDiv = document.createElement('div');
    mapDiv.id = 'sg-leaflet-map';
    mapDiv.style.cssText = 'width:100%;height:100%;min-height:300px;border-radius:14px;z-index:1;';
    placeholder.appendChild(mapDiv);
  }

  if (_leafletMap) {
    _leafletMap.setView([lat, lng], 15);
    if (_userMarker) _userMarker.setLatLng([lat, lng]);
    return;
  }

  _leafletMap = L.map('sg-leaflet-map', { zoomControl: true }).setView([lat, lng], 15);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19,
  }).addTo(_leafletMap);

  // User Marker (Pink glowing dot)
  const userIcon = L.divIcon({
    html: `<div style="background:#ff3e6c;width:20px;height:20px;border-radius:50%;border:3px solid #fff;box-shadow:0 0 14px rgba(255,62,108,0.9);display:flex;align-items:center;justify-content:center;color:#fff;font-size:9px;">●</div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
    className: '',
  });

  _userMarker = L.marker([lat, lng], { icon: userIcon }).addTo(_leafletMap);
  _userMarker.bindPopup('<strong>📍 You are here</strong><br/>Live GPS active').openPopup();

  // Draw any active geofences onto the map
  _drawGeofencesOnMap();

  sgLog('Interactive Leaflet map ready.', 'success');
}

// ── 3. REAL-TIME LIVE GPS TRACKING ───────────────────────
function sgStartTracking(onUpdate) {
  if (_watchId !== null) return;
  if (!navigator.geolocation) return;

  _isTrackingActive = true;
  _updateTrackingUI(true);

  _watchId = navigator.geolocation.watchPosition(
    pos => {
      _cachedLat = pos.coords.latitude;
      _cachedLng = pos.coords.longitude;
      _cachedAccuracy = pos.coords.accuracy || 10;

      if (_userMarker && _leafletMap) {
        _userMarker.setLatLng([_cachedLat, _cachedLng]);
        if (!_activeDestination) {
          _leafletMap.panTo([_cachedLat, _cachedLng]);
        }
      }

      // Update Coordinate UI
      const coordEl = document.getElementById('locCoords');
      const timeEl = document.getElementById('locTime');
      const accEl = document.getElementById('locAccuracy');
      if (coordEl) coordEl.textContent = `${_cachedLat.toFixed(5)}, ${_cachedLng.toFixed(5)}`;
      if (timeEl) timeEl.textContent = new Date().toLocaleTimeString();
      if (accEl) accEl.textContent = `±${Math.round(_cachedAccuracy)}m`;

      // Sync with backend persistent location record
      _syncLocationWithBackend(_cachedLat, _cachedLng, _cachedAccuracy);

      // Check geofences boundaries
      _evaluateGeofencesLocally(_cachedLat, _cachedLng);

      // Update dynamic Route / Distance / ETA if destination is set
      if (_activeDestination) {
        _updateRouteProgress(_cachedLat, _cachedLng);
      }

      if (typeof logLocationEntry === 'function') {
        logLocationEntry(_cachedLat, _cachedLng, typeof isSOSActive !== 'undefined' && isSOSActive ? 'SOS active' : 'Live tracking');
      }

      if (typeof onUpdate === 'function') onUpdate({ lat: _cachedLat, lng: _cachedLng, accuracy: _cachedAccuracy });
    },
    err => {
      sgLog(`Tracking error: ${err.message}`, 'error');
    },
    { enableHighAccuracy: true, maximumAge: 3000, timeout: 10000 }
  );

  sgLog('Continuous Live GPS tracking active.', 'success');
}

function sgStopTracking() {
  if (_watchId !== null) {
    navigator.geolocation.clearWatch(_watchId);
    _watchId = null;
  }
  _isTrackingActive = false;
  _updateTrackingUI(false);

  // Inform backend that tracking has stopped
  const token = _getAuthToken();
  if (token) {
    fetch(_getApiUrl('/api/location/stop'), {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    }).catch(() => {});
  }

  sgLog('Live GPS tracking stopped.', 'info');
}

function _updateTrackingUI(active) {
  const badge = document.getElementById('locationBadge');
  const startBtn = document.getElementById('btnStartTracking');
  const stopBtn = document.getElementById('btnStopTracking');
  const statusTxt = document.getElementById('trackingStatusText');

  if (badge) {
    badge.innerHTML = active
      ? '<i class="fas fa-circle-dot"></i> Live Active'
      : '<i class="fas fa-circle-dot"></i> Stopped';
    badge.classList.toggle('active', active);
  }

  if (startBtn) startBtn.classList.toggle('hidden', active);
  if (stopBtn) stopBtn.classList.toggle('hidden', !active);
  if (statusTxt) statusTxt.textContent = active ? 'Tracking Active' : 'Tracking Stopped';
}

let _lastBackendSync = 0;
async function _syncLocationWithBackend(lat, lng, accuracy) {
  const now = Date.now();
  if (now - _lastBackendSync < 6000) return; // 6s throttle
  _lastBackendSync = now;

  const token = _getAuthToken();
  if (!token) return;

  try {
    const res = await fetch(_getApiUrl('/api/location/update'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ latitude: lat, longitude: lng, accuracy, isTracking: 1 })
    });
    const data = await res.json();
    if (data.success && data.geofences) {
      _handleServerGeofenceResults(data.geofences);
    }
  } catch (e) {}
}

// ── 4. ROUTE VISUALIZATION, DISTANCE & ETA ────────────────
async function sgSetDestination(destLat, destLng, destName = 'Destination') {
  _activeDestination = { lat: parseFloat(destLat), lng: parseFloat(destLng), name: destName };

  if (!_cachedLat || !_cachedLng) {
    try {
      const loc = await sgGetLocation();
      _cachedLat = loc.lat;
      _cachedLng = loc.lng;
    } catch (e) {
      if (typeof showToast === 'function') showToast('Current location required for routing', 'error');
      return;
    }
  }

  sgInitMap(_cachedLat, _cachedLng);

  // Place/Update Destination Marker
  if (_destMarker && _leafletMap) {
    _destMarker.setLatLng([_activeDestination.lat, _activeDestination.lng]);
  } else if (_leafletMap) {
    const destIcon = L.divIcon({
      html: `<div style="background:#1a73e8;width:24px;height:24px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 10px rgba(26,115,232,0.9);display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;">🏁</div>`,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
      className: '',
    });
    _destMarker = L.marker([_activeDestination.lat, _activeDestination.lng], { icon: destIcon }).addTo(_leafletMap);
  }
  _destMarker.bindPopup(`<strong>🏁 ${destName}</strong>`).openPopup();

  // Fetch route and ETA from backend
  await _fetchAndRenderRoute();

  // Make sure live tracking is active
  if (!_isTrackingActive) {
    sgStartTracking();
  }
}

async function _fetchAndRenderRoute() {
  if (!_activeDestination || !_cachedLat || !_cachedLng) return;

  const token = _getAuthToken();
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  try {
    const res = await fetch(_getApiUrl('/api/location/route'), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        originLat: _cachedLat,
        originLng: _cachedLng,
        destLat: _activeDestination.lat,
        destLng: _activeDestination.lng,
        destName: _activeDestination.name,
      })
    });

    const data = await res.json();
    if (data.success) {
      _currentRouteData = data;
      _renderRouteOptionsUI(data);
      _drawSelectedRouteOnMap();
    }
  } catch (err) {
    sgLog(`Route fetch error: ${err.message}`, 'warning');
  }
}

function _renderRouteOptionsUI(data) {
  const container = document.getElementById('routeCardsContainer');
  const panel = document.getElementById('routeNavPanel');
  if (panel) panel.classList.remove('hidden');
  if (!container) return;

  const direct = data.directRoute;
  const safe = data.safeRoute;

  container.innerHTML = `
    <div class="route-option-card ${_activeRouteMode === 'route_safe' ? 'selected' : ''}" onclick="sgSelectRouteMode('route_safe')">
      <div class="roc-header">
        <span class="roc-badge safe"><i class="fas fa-shield-check"></i> Recommended Safe Route</span>
        <span class="roc-time">${safe.walkingEtaMin} min walk</span>
      </div>
      <div class="roc-body">
        <strong>${safe.distanceKm} km</strong> &nbsp;·&nbsp; ${safe.description}
      </div>
    </div>
    <div class="route-option-card ${_activeRouteMode === 'route_direct' ? 'selected' : ''}" onclick="sgSelectRouteMode('route_direct')">
      <div class="roc-header">
        <span class="roc-badge direct"><i class="fas fa-bolt"></i> Direct Shortest Route</span>
        <span class="roc-time">${direct.walkingEtaMin} min walk</span>
      </div>
      <div class="roc-body">
        <strong>${direct.distanceKm} km</strong> &nbsp;·&nbsp; ${direct.description}
      </div>
    </div>`;

  _updateRouteProgress(_cachedLat, _cachedLng);
}

function sgSelectRouteMode(mode) {
  _activeRouteMode = mode;
  document.querySelectorAll('.route-option-card').forEach(c => c.classList.remove('selected'));
  if (mode === 'route_safe') {
    document.querySelector('.route-option-card:first-child')?.classList.add('selected');
  } else {
    document.querySelector('.route-option-card:last-child')?.classList.add('selected');
  }
  _drawSelectedRouteOnMap();
}

function _drawSelectedRouteOnMap() {
  if (!_currentRouteData || !_leafletMap) return;

  const selectedRoute = _activeRouteMode === 'route_safe'
    ? _currentRouteData.safeRoute
    : _currentRouteData.directRoute;

  if (_routePolyline) {
    _routePolyline.remove();
  }

  const isSafe = _activeRouteMode === 'route_safe';
  _routePolyline = L.polyline(selectedRoute.waypoints, {
    color: isSafe ? '#3ddc84' : '#ff3e6c',
    weight: 4,
    opacity: 0.9,
    dashArray: isSafe ? null : '6, 6',
  }).addTo(_leafletMap);

  _leafletMap.fitBounds(_routePolyline.getBounds(), { padding: [35, 35] });
}

function _updateRouteProgress(currentLat, currentLng) {
  if (!_activeDestination || !_currentRouteData) return;

  const distKm = _haversineKm(currentLat, currentLng, _activeDestination.lat, _activeDestination.lng);
  const walkingEta = Math.max(1, Math.round((distKm / 4.5) * 60));

  const distEl = document.getElementById('navDistRemaining');
  const etaEl = document.getElementById('navEtaRemaining');
  const destNameEl = document.getElementById('navDestName');

  if (distEl) distEl.textContent = `${distKm.toFixed(2)} km`;
  if (etaEl) etaEl.textContent = `${walkingEta} min`;
  if (destNameEl) destNameEl.textContent = _activeDestination.name;
}

function sgClearDestination() {
  _activeDestination = null;
  _currentRouteData = null;
  if (_destMarker) { _destMarker.remove(); _destMarker = null; }
  if (_routePolyline) { _routePolyline.remove(); _routePolyline = null; }
  document.getElementById('routeNavPanel')?.classList.add('hidden');
  if (typeof showToast === 'function') showToast('Destination navigation cleared');
}

// ── 5. GEOFENCING & SAFE ZONES ────────────────────────────
async function sgLoadGeofences() {
  const token = _getAuthToken();
  if (!token) return;

  try {
    const res = await fetch(_getApiUrl('/api/geofences'), {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (data.success) {
      _userGeofences = data.geofences || [];
      _renderGeofencesList();
      _drawGeofencesOnMap();
    }
  } catch (e) {
    console.warn('Error loading geofences:', e.message);
  }
}

function _renderGeofencesList() {
  const list = document.getElementById('geofencesList');
  const empty = document.getElementById('geofencesEmpty');
  if (!list) return;

  if (_userGeofences.length === 0) {
    list.innerHTML = '';
    empty?.classList.remove('hidden');
    return;
  }

  empty?.classList.add('hidden');
  list.innerHTML = _userGeofences.map(gf => `
    <div class="geofence-card">
      <div class="gfc-icon"><i class="fas fa-shield-heart"></i></div>
      <div class="gfc-info">
        <strong>${gf.name}</strong>
        <span>Radius: ${gf.radius}m &nbsp;·&nbsp; ${gf.latitude.toFixed(4)}, ${gf.longitude.toFixed(4)}</span>
      </div>
      <button class="icon-btn danger" onclick="sgDeleteGeofence(${gf.id})">
        <i class="fas fa-trash-can"></i>
      </button>
    </div>`).join('');
}

function _drawGeofencesOnMap() {
  if (!_leafletMap) return;

  // Clear previous circles
  _geofenceCircles.forEach(c => c.remove());
  _geofenceCircles = [];

  _userGeofences.forEach(gf => {
    if (!gf.isActive) return;

    const circle = L.circle([gf.latitude, gf.longitude], {
      radius: gf.radius,
      color: '#3ddc84',
      fillColor: '#3ddc84',
      fillOpacity: 0.15,
      weight: 2,
      dashArray: '4, 4',
    }).addTo(_leafletMap);

    circle.bindPopup(`<strong>Safe Zone: ${gf.name}</strong><br/>Radius: ${gf.radius}m`);
    _geofenceCircles.push(circle);
  });
}

async function sgCreateGeofenceFromModal() {
  const name = document.getElementById('gfName')?.value.trim();
  const radius = parseInt(document.getElementById('gfRadius')?.value || 500);

  if (!name) {
    if (typeof showToast === 'function') showToast('Please enter safe zone name', 'error');
    return;
  }

  let lat = _cachedLat;
  let lng = _cachedLng;

  if (!lat || !lng) {
    try {
      const loc = await sgGetLocation();
      lat = loc.lat;
      lng = loc.lng;
    } catch (e) {
      console.warn('Could not get GPS coordinate for safe zone, using fallback position:', e.message);
      if (_leafletMap) {
        const center = _leafletMap.getCenter();
        lat = center.lat;
        lng = center.lng;
      } else {
        lat = 28.6139;
        lng = 77.2090;
      }
      _cachedLat = lat;
      _cachedLng = lng;
    }
  }

  const token = _getAuthToken();
  if (!token) {
    if (typeof showToast === 'function') showToast('Please log in first to save safe zones', 'warning');
    if (typeof sgShowAuthModal === 'function') sgShowAuthModal('login');
    return;
  }

  try {
    const res = await fetch(_getApiUrl('/api/geofences'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ name, latitude: lat, longitude: lng, radius })
    });
    const data = await res.json();
    if (data.success) {
      if (typeof showToast === 'function') showToast(`Safe zone "${name}" created ✓`, 'success');
      document.getElementById('addGeofenceModal')?.classList.add('hidden');
      const nameInput = document.getElementById('gfName');
      if (nameInput) nameInput.value = '';
      await sgLoadGeofences();
    } else {
      if (typeof showToast === 'function') showToast(data.message || 'Error creating safe zone', 'error');
    }
  } catch (e) {
    console.error('Error saving geofence:', e);
    if (typeof showToast === 'function') showToast('Network error creating safe zone', 'error');
  }
}

async function sgDeleteGeofence(id) {
  const token = _getAuthToken();
  if (!token) return;

  try {
    const res = await fetch(_getApiUrl(`/api/geofences/${id}`), {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (data.success) {
      if (typeof showToast === 'function') showToast('Safe zone removed');
      await sgLoadGeofences();
    }
  } catch (e) {}
}

function _evaluateGeofencesLocally(currentLat, currentLng) {
  _userGeofences.forEach(gf => {
    if (!gf.isActive) return;
    const distMeters = _haversineKm(currentLat, currentLng, gf.latitude, gf.longitude) * 1000;
    const isInside = distMeters <= gf.radius;
    const wasInside = _geofenceStateMap[gf.id];

    if (wasInside === undefined) {
      _geofenceStateMap[gf.id] = isInside;
      return;
    }

    if (wasInside && !isInside) {
      // Transition: Left Safe Zone
      _geofenceStateMap[gf.id] = false;
      const msg = `🚨 GEOFENCE ALERT: You have left Safe Zone "${gf.name}"!`;
      sgLog(msg, 'emergency');
      if (typeof showToast === 'function') showToast(msg, 'warning');
      if (typeof sgSendPushNotification === 'function') {
        sgSendPushNotification(`Left Safe Zone: ${gf.name}`);
      }
    } else if (!wasInside && isInside) {
      // Transition: Returned to Safe Zone
      _geofenceStateMap[gf.id] = true;
      const msg = `✅ Entered Safe Zone "${gf.name}". You are safe.`;
      sgLog(msg, 'success');
      if (typeof showToast === 'function') showToast(msg, 'success');
    }
  });
}

function _handleServerGeofenceResults(checks) {
  // Handled smoothly via local and server sync
}

// ── 6. FAMILY LIVE LOCATION SHARING ───────────────────────
async function sgLoadFamilyLocations() {
  const token = _getAuthToken();
  if (!token) return;

  try {
    const res = await fetch(_getApiUrl('/api/location/family'), {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (data.success) {
      _renderFamilyTrackingList(data.familyMembers || []);
    }
  } catch (e) {
    console.warn('Error loading family locations:', e.message);
  }
}

function _renderFamilyTrackingList(familyMembers) {
  const list = document.getElementById('familyTrackingList');
  const empty = document.getElementById('familyTrackingEmpty');
  if (!list) return;

  if (familyMembers.length === 0) {
    list.innerHTML = '';
    empty?.classList.remove('hidden');
    return;
  }

  empty?.classList.add('hidden');
  list.innerHTML = familyMembers.map(f => {
    const statusClass = f.status === 'LIVE' ? 'live' : (f.status === 'RECENT' ? 'recent' : 'offline');
    const statusIcon = f.status === 'LIVE' ? '🟢' : (f.status === 'RECENT' ? '🟡' : '⚪');
    const hasLocation = f.latitude && f.longitude;

    return `
      <div class="family-loc-card">
        <div class="flc-avatar">${f.name[0].toUpperCase()}</div>
        <div class="flc-info">
          <strong>${f.name} <span class="flc-rel">(${f.relationship})</span></strong>
          <span class="flc-status ${statusClass}">${statusIcon} ${f.status} &nbsp;·&nbsp; ${f.lastSeenText}</span>
        </div>
        ${hasLocation ? `
          <button class="btn-locate-family" onclick="sgCenterMapOnFamily(${f.latitude}, ${f.longitude}, '${f.name.replace(/'/g, "\\'")}')">
            <i class="fas fa-location-crosshairs"></i> View
          </button>
        ` : ''}
      </div>`;
  }).join('');
}

function sgCenterMapOnFamily(lat, lng, name) {
  if (!_leafletMap) {
    sgInitMap(lat, lng);
  } else {
    _leafletMap.setView([lat, lng], 16);
  }

  // Clear previous family markers
  _familyMarkers.forEach(m => m.remove());
  _familyMarkers = [];

  const familyIcon = L.divIcon({
    html: `<div style="background:#1a73e8;width:22px;height:22px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 10px rgba(26,115,232,0.9);display:flex;align-items:center;justify-content:center;color:#fff;font-size:11px;">👤</div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    className: '',
  });

  const marker = L.marker([lat, lng], { icon: familyIcon }).addTo(_leafletMap);
  marker.bindPopup(`<strong>👤 ${name}'s Live Location</strong><br/>Shared with you`).openPopup();
  _familyMarkers.push(marker);

  if (typeof showToast === 'function') {
    showToast(`Viewing ${name}'s live location on map`);
  }
}

async function sgToggleLocationSharing(checked) {
  const token = _getAuthToken();
  if (!token) return;

  try {
    const res = await fetch(_getApiUrl('/api/location/share-toggle'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ isSharing: checked })
    });
    const data = await res.json();
    if (data.success && typeof showToast === 'function') {
      showToast(checked ? 'Live location sharing with family enabled ✓' : 'Live location sharing disabled');
    }
  } catch (e) {}
}

// ── 7. REUSED DISTANCE & OVERPASS UTILS ───────────────────
function _haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dL = ((lat2 - lat1) * Math.PI) / 180;
  const dG = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dL / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dG / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function sgFindPolice(lat, lng, radius = 5000) {
  const query = `
    [out:json][timeout:15];
    node["amenity"="police"](around:${radius},${lat},${lng});
    out 5;
  `;
  try {
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(query)}`,
    });
    const data = await res.json();
    return (data.elements || []).map(el => ({
      name: el.tags?.name || 'Nearest Police Station',
      lat: el.lat,
      lng: el.lon,
      phone: el.tags?.phone || el.tags?.['contact:phone'] || '112',
      mapsLink: sgMapsLink(el.lat, el.lon),
    }));
  } catch (err) {
    return [];
  }
}
