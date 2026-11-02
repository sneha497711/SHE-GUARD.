/**
 * js/safe_route.js — SHE-GUARD Module 10: Safe Route Recommendation & AI Risk Engine
 */

let _safeRouteData = null;
let _selectedRouteId = null;
let _routePolylines = {}; // { [routeId]: L.Polyline }
let _safetyLayerMarkers = []; // Array of Leaflet markers/circles
let _activeLayers = {
  cctv: true,
  lighting: true,
  crowd: true,
  police: true,
  crime: true,
};

// ── 1. INITIALIZE & TRIGGER SAFE ROUTE ANALYSIS ──────────
async function sgTriggerSafeRouteAnalysis() {
  const destInput = document.getElementById('safeRouteDestInput')?.value.trim();
  let destLat = parseFloat(document.getElementById('safeRouteDestLat')?.value);
  let destLng = parseFloat(document.getElementById('safeRouteDestLng')?.value);
  const destName = destInput || 'Selected Destination';

  let oLat = typeof _cachedLat !== 'undefined' ? _cachedLat : null;
  let oLng = typeof _cachedLng !== 'undefined' ? _cachedLng : null;

  if (!oLat || !oLng) {
    try {
      if (typeof sgGetLocation === 'function') {
        const loc = await sgGetLocation();
        oLat = loc.lat;
        oLng = loc.lng;
      }
    } catch (e) {
      // Fallback position if physical GPS is unavailable
      oLat = 28.6139;
      oLng = 77.2090;
    }
  }

  // If destination coordinates not manually set, geocode using OpenStreetMap Nominatim
  if (isNaN(destLat) || isNaN(destLng)) {
    if (!destInput) {
      if (typeof showToast === 'function') showToast('Please enter or select a destination', 'error');
      return;
    }

    try {
      const geoUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(destInput)}&limit=1`;
      const geoRes = await fetch(geoUrl, { headers: { 'Accept': 'application/json' } });
      const geoData = await geoRes.json();
      if (geoData && geoData.length > 0) {
        destLat = parseFloat(geoData[0].lat);
        destLng = parseFloat(geoData[0].lon);
      } else {
        // Search bounded near user location
        const boundedGeoUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(destInput)}&viewbox=${oLng - 0.4},${oLat + 0.4},${oLng + 0.4},${oLat - 0.4}&limit=1`;
        const bRes = await fetch(boundedGeoUrl);
        const bData = await bRes.json();
        if (bData && bData.length > 0) {
          destLat = parseFloat(bData[0].lat);
          destLng = parseFloat(bData[0].lon);
        } else {
          if (typeof showToast === 'function') showToast(`Location "${destInput}" not found on map. Using estimated nearby coordinates.`, 'warning');
          destLat = oLat + 0.015;
          destLng = oLng + 0.015;
        }
      }
    } catch (e) {
      destLat = oLat + 0.015;
      destLng = oLng + 0.015;
    }
  }

  const token = typeof _getAuthToken === 'function' ? _getAuthToken() : (localStorage.getItem('sg_auth_token') || localStorage.getItem('sg_token'));
  if (!token) {
    if (typeof showToast === 'function') showToast('Please log in to analyze safe routes', 'warning');
    if (typeof sgShowAuthModal === 'function') sgShowAuthModal('login');
    return;
  }

  const btn = document.getElementById('btnFindSafeRoute');
  if (btn) {
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Analyzing Safety Factors…';
    btn.disabled = true;
  }

  try {
    const res = await fetch(typeof _getApiUrl === 'function' ? _getApiUrl('/api/routes/analyze') : '/api/routes/analyze', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        originLat: oLat,
        originLng: oLng,
        destLat,
        destLng,
        destName,
      })
    });

    const data = await res.json();
    if (data.success && data.allRoutes) {
      _safeRouteData = data;
      _selectedRouteId = data.safestRoute.id;

      _renderSafeRouteDeck(data);
      _renderSafetyMap(data);
      await sgLoadAndDrawSafetyLayers();

      if (typeof showToast === 'function') {
        showToast(`Safest route calculated (Score: ${data.safestRoute.safetyScore}/100) ✓`, 'success');
      }

      // Auto start continuous GPS tracking if not already active
      if (typeof _isTrackingActive !== 'undefined' && !_isTrackingActive && typeof sgStartTracking === 'function') {
        sgStartTracking();
      }
    } else {
      if (typeof showToast === 'function') showToast(data.message || 'Could not analyze safe routes', 'error');
    }
  } catch (err) {
    console.error('[Safe Route Error]:', err);
    if (typeof showToast === 'function') showToast('Network error analyzing routes', 'error');
  } finally {
    if (btn) {
      btn.innerHTML = '<i class="fas fa-shield-halved"></i> Find Safest Route';
      btn.disabled = false;
    }
  }
}

// ── 2. RENDER ROUTE COMPARISON DECK ──────────────────────
function _renderSafeRouteDeck(data) {
  const container = document.getElementById('safeRouteDeckContainer');
  if (!container) return;

  const safest = data.safestRoute;
  const alternatives = data.alternativeRoutes || [];

  let html = `
    <!-- Safest Recommended Route Card -->
    <div class="route-hero-card ${_selectedRouteId === safest.id ? 'active-selected' : ''}" id="card_${safest.id}">
      <div class="rhc-header">
        <div class="rhc-badge safe"><i class="fas fa-crown"></i> RECOMMENDED SAFEST ROUTE</div>
        <div class="rhc-score-wrap">
          <span class="score-val">${safest.safetyScore}</span>
          <span class="score-max">/100</span>
        </div>
      </div>
      
      <div class="rhc-title">${safest.name}</div>
      <div class="rhc-meta">
        <span><i class="fas fa-route"></i> <strong>${safest.distanceKm} km</strong></span>
        <span><i class="fas fa-person-walking"></i> ${safest.walkingEtaMin} min walk</span>
        <span><i class="fas fa-car"></i> ${safest.drivingEtaMin} min drive</span>
        <span><i class="fas fa-car-side"></i> Traffic: <strong>${safest.traffic.level}</strong></span>
      </div>

      <div class="rhc-factors-grid">
        <div class="factor-item">
          <span class="fi-label"><i class="fas fa-lightbulb text-warning"></i> Lighting</span>
          <span class="fi-val ${safest.safetyFactors.lighting.percentage >= 80 ? 'good' : 'warn'}">${safest.safetyFactors.lighting.statusText} (${safest.safetyFactors.lighting.percentage}%)</span>
        </div>
        <div class="factor-item">
          <span class="fi-label"><i class="fas fa-video text-info"></i> CCTV</span>
          <span class="fi-val good">${safest.safetyFactors.cctv.statusText}</span>
        </div>
        <div class="factor-item">
          <span class="fi-label"><i class="fas fa-people-group text-primary"></i> Crowd</span>
          <span class="fi-val good">${safest.safetyFactors.crowd.statusText}</span>
        </div>
        <div class="factor-item">
          <span class="fi-label"><i class="fas fa-shield-halved text-success"></i> Patrols</span>
          <span class="fi-val good">${safest.safetyFactors.policePatrol.statusText}</span>
        </div>
        <div class="factor-item">
          <span class="fi-label"><i class="fas fa-triangle-exclamation text-rose"></i> Crime Risk</span>
          <span class="fi-val good">${safest.safetyFactors.crimeRisk.statusText}</span>
        </div>
      </div>

      <div class="rhc-reasons">
        <strong><i class="fas fa-check-double text-success"></i> Why this route is recommended:</strong>
        <ul>
          ${safest.highlights.map(h => `<li>✓ ${h}</li>`).join('')}
        </ul>
      </div>

      <div class="rhc-actions">
        <button class="btn-primary" onclick="sgSelectActiveRoute('${safest.id}')">
          <i class="fas fa-navigation"></i> ${_selectedRouteId === safest.id ? 'Active Navigation Route ✓' : 'Use Safest Route'}
        </button>
      </div>
    </div>
  `;

  if (alternatives.length > 0) {
    html += `
      <div class="section-badge-title mt-md"><i class="fas fa-shuffle"></i> Alternative Route Options</div>
      <div class="alternatives-grid">
    `;

    alternatives.forEach(alt => {
      html += `
        <div class="route-alt-card ${_selectedRouteId === alt.id ? 'active-selected' : ''}" id="card_${alt.id}">
          <div class="alt-header">
            <div>
              <strong>${alt.name}</strong>
              <div class="alt-meta">${alt.distanceKm} km &nbsp;·&nbsp; ${alt.walkingEtaMin} min walk &nbsp;·&nbsp; Traffic: ${alt.traffic.level}</div>
            </div>
            <div class="alt-score-badge ${alt.safetyScore >= 75 ? 'moderate' : 'low'}">
              Safety: <strong>${alt.safetyScore}/100</strong>
            </div>
          </div>

          <div class="alt-cautions">
            ${alt.cautions.map(c => `<span>⚠️ ${c}</span>`).join('')}
          </div>

          <button class="btn-outline btn-sm mt-sm" onclick="sgSelectActiveRoute('${alt.id}')">
            <i class="fas fa-location-arrow"></i> ${_selectedRouteId === alt.id ? 'Selected Route ✓' : 'Select Alternative'}
          </button>
        </div>
      `;
    });

    html += `</div>`;
  }

  container.innerHTML = html;
}

let _safeRouteLeafletMap = null;
let _safeRouteUserMarker = null;
let _safeRouteDestMarker = null;

// ── 3. MAP RENDERING & POLYLINES ─────────────────────────
function _initSafeRouteMap(lat, lng) {
  const mapContainer = document.getElementById('sg-safe-route-leaflet-map');
  if (!mapContainer) return null;

  if (_safeRouteLeafletMap) {
    _safeRouteLeafletMap.setView([lat, lng], 14);
    if (_safeRouteUserMarker) _safeRouteUserMarker.setLatLng([lat, lng]);
    setTimeout(() => _safeRouteLeafletMap.invalidateSize(), 150);
    return _safeRouteLeafletMap;
  }

  _safeRouteLeafletMap = L.map('sg-safe-route-leaflet-map', { zoomControl: true }).setView([lat, lng], 14);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19,
  }).addTo(_safeRouteLeafletMap);

  const userIcon = L.divIcon({
    html: `<div style="background:#ff3e6c;width:24px;height:24px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 12px rgba(255,62,108,0.9);display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;">📍</div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });

  _safeRouteUserMarker = L.marker([lat, lng], { icon: userIcon }).addTo(_safeRouteLeafletMap);
  _safeRouteUserMarker.bindPopup('<strong>📍 Origin / Current Location</strong>').openPopup();

  setTimeout(() => _safeRouteLeafletMap.invalidateSize(), 200);
  return _safeRouteLeafletMap;
}

function _renderSafetyMap(data) {
  const map = _initSafeRouteMap(data.origin.lat, data.origin.lng);
  if (!map) return;

  // Clear previous route polylines
  Object.values(_routePolylines).forEach(p => p.remove());
  _routePolylines = {};

  // Destination Marker
  if (_safeRouteDestMarker) {
    _safeRouteDestMarker.setLatLng([data.destination.lat, data.destination.lng]);
  } else {
    const destIcon = L.divIcon({
      html: `<div style="background:#10b981;width:26px;height:26px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 12px rgba(16,185,129,0.9);display:flex;align-items:center;justify-content:center;color:#fff;font-size:13px;">🏁</div>`,
      iconSize: [26, 26],
      iconAnchor: [13, 13],
    });
    _safeRouteDestMarker = L.marker([data.destination.lat, data.destination.lng], { icon: destIcon }).addTo(map);
  }
  _safeRouteDestMarker.bindPopup(`<strong>🏁 ${data.destination.name}</strong>`).openPopup();

  // Draw each route
  data.allRoutes.forEach(r => {
    const isSafest = r.isRecommended;
    const isSelected = r.id === _selectedRouteId;

    const poly = L.polyline(r.waypoints, {
      color: isSafest ? '#10b981' : (isSelected ? '#3b82f6' : '#f59e0b'),
      weight: isSelected ? 6 : 4,
      opacity: isSelected ? 0.95 : 0.65,
      dashArray: isSafest ? null : '6, 6',
    }).addTo(map);

    poly.bindPopup(`
      <strong>${isSafest ? '★ ' : ''}${r.name}</strong><br/>
      Safety Score: <strong>${r.safetyScore}/100</strong><br/>
      Distance: <strong>${r.distanceKm} km</strong> · ${r.walkingEtaMin} min walk
    `);

    _routePolylines[r.id] = poly;
  });

  // Fit bounds to selected route
  if (_routePolylines[_selectedRouteId]) {
    map.fitBounds(_routePolylines[_selectedRouteId].getBounds(), { padding: [40, 40] });
  }
}

function sgSelectActiveRoute(routeId) {
  _selectedRouteId = routeId;

  if (_safeRouteData) {
    _renderSafeRouteDeck(_safeRouteData);
    _renderSafetyMap(_safeRouteData);
  }

  const selectedRoute = _safeRouteData?.allRoutes.find(r => r.id === routeId);
  if (selectedRoute && typeof showToast === 'function') {
    showToast(`Active route: ${selectedRoute.name} (${selectedRoute.safetyScore}/100) ✓`);
  }
}

// ── 4. SAFETY MAP OVERLAY LAYERS ─────────────────────────
async function sgLoadAndDrawSafetyLayers() {
  const token = typeof _getAuthToken === 'function' ? _getAuthToken() : (localStorage.getItem('sg_auth_token') || localStorage.getItem('sg_token'));
  if (!token) return;

  try {
    const res = await fetch(typeof _getApiUrl === 'function' ? _getApiUrl('/api/routes/safety-layers') : '/api/routes/safety-layers', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (data.success && data.allNodes) {
      _drawSafetyNodesOnMap(data.allNodes);
    }
  } catch (e) {
    console.warn('Error loading safety layers:', e.message);
  }
}

function _drawSafetyNodesOnMap(nodes) {
  const targetMap = _safeRouteLeafletMap || _leafletMap;
  if (!targetMap) return;

  // Clear existing layer markers
  _safetyLayerMarkers.forEach(m => m.remove());
  _safetyLayerMarkers = [];

  nodes.forEach(node => {
    // Check layer filter toggle
    if (node.nodeType === 'CCTV' && !_activeLayers.cctv) return;
    if (node.nodeType === 'LIGHTING' && !_activeLayers.lighting) return;
    if (node.nodeType === 'CROWD_HUB' && !_activeLayers.crowd) return;
    if (node.nodeType === 'POLICE_PATROL' && !_activeLayers.police) return;
    if (node.nodeType === 'CRIME_HOTSPOT' && !_activeLayers.crime) return;

    const iconMap = {
      POLICE_PATROL: { icon: '👮', bg: '#1a73e8', label: 'Police Patrol Post' },
      CCTV: { icon: '📹', bg: '#8b5cf6', label: 'CCTV Monitored Zone' },
      LIGHTING: { icon: '💡', bg: '#eab308', label: 'Well-Lit LED Corridor' },
      CROWD_HUB: { icon: '👥', bg: '#10b981', label: 'Safe Crowded Hub' },
      CRIME_HOTSPOT: { icon: '⚠️', bg: '#ef4444', label: 'Caution / Isolated Zone' },
    };

    const style = iconMap[node.nodeType] || { icon: '📍', bg: '#64748b', label: 'Safety Point' };

    const markerIcon = L.divIcon({
      html: `<div style="background:${style.bg};width:24px;height:24px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 8px ${style.bg};display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;">${style.icon}</div>`,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    });

    const marker = L.marker([node.latitude, node.longitude], { icon: markerIcon }).addTo(targetMap);
    marker.bindPopup(`
      <strong>${style.icon} ${node.name}</strong><br/>
      <span style="font-size:12px;color:#888">${node.description}</span><br/>
      Safety Rating: <strong>${node.safetyRating}/100</strong>
    `);

    _safetyLayerMarkers.push(marker);
  });
}

function sgToggleSafetyMapLayer(layerName, isChecked) {
  _activeLayers[layerName] = isChecked;
  sgLoadAndDrawSafetyLayers();
}

// ── 5. QUICK DESTINATION SELECTORS ───────────────────────
async function sgSetQuickSafeDest(type) {
  let oLat = typeof _cachedLat !== 'undefined' && _cachedLat ? _cachedLat : null;
  let oLng = typeof _cachedLng !== 'undefined' && _cachedLng ? _cachedLng : null;

  if (!oLat || !oLng) {
    try {
      if (typeof sgGetLocation === 'function') {
        const loc = await sgGetLocation();
        oLat = loc.lat;
        oLng = loc.lng;
      }
    } catch (e) {
      oLat = 28.6139;
      oLng = 77.2090;
    }
  }

  const nameInput = document.getElementById('safeRouteDestInput');
  const latInput = document.getElementById('safeRouteDestLat');
  const lngInput = document.getElementById('safeRouteDestLng');

  const amenity = type === 'police' ? 'police' : (type === 'hospital' ? 'hospital' : 'marketplace');
  const labelPrefix = type === 'police' ? 'Police Station' : (type === 'hospital' ? 'Hospital' : 'Public Hub');

  if (nameInput) nameInput.value = `Locating nearest ${labelPrefix}...`;
  if (typeof showToast === 'function') showToast(`Locating nearest real-world ${labelPrefix} via OpenStreetMap...`, 'info');

  try {
    const query = `[out:json][timeout:8];(node["amenity"="${amenity}"](around:8000,${oLat},${oLng});way["amenity"="${amenity}"](around:8000,${oLat},${oLng}););out center 1;`;
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: `data=${encodeURIComponent(query)}`,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    const data = await res.json();
    if (data.elements && data.elements.length > 0) {
      const el = data.elements[0];
      const pLat = el.lat || (el.center && el.center.lat);
      const pLng = el.lon || (el.center && el.center.lon);
      const name = el.tags?.name || (type === 'police' ? 'Nearby Police Station' : type === 'hospital' ? 'Nearby Emergency Hospital' : 'Nearby Safe Public Hub');

      if (nameInput) nameInput.value = name;
      if (latInput) latInput.value = pLat;
      if (lngInput) lngInput.value = pLng;
      await sgTriggerSafeRouteAnalysis();
      return;
    }
  } catch (e) {
    console.warn('Overpass lookup error:', e);
  }

  // If no specific POI returned in immediate 8km radius
  const fallbackNames = {
    police: 'Nearest Police Station',
    hospital: 'Nearest Hospital & Emergency Room',
    safe_hub: 'Nearest Well-Lit Commercial Area',
  };
  if (nameInput) nameInput.value = fallbackNames[type] || 'Safe Public Facility';
  if (latInput) latInput.value = oLat + 0.015;
  if (lngInput) lngInput.value = oLng + 0.015;

  await sgTriggerSafeRouteAnalysis();
}
