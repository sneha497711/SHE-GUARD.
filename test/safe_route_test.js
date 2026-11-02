/**
 * test/safe_route_test.js — Automated Test Suite for Module 10: Safe Route Recommendation
 */

const http = require('http');

const BASE_URL = 'http://localhost:5000';

function makeRequest(path, method = 'GET', body = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, data: parsed, raw: data });
        } catch (e) {
          resolve({ status: res.statusCode, data: null, raw: data });
        }
      });
    });

    req.on('error', err => reject(err));

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    process.exit(1);
  } else {
    console.log(`✅ PASS: ${message}`);
  }
}

async function runTests() {
  console.log('====================================================');
  console.log('🧪 Starting SHE-GUARD Module 10: Safe Route Recommendation Tests');
  console.log('====================================================\n');

  // Test 1: Protected endpoint rejection without JWT
  const unauthRes = await makeRequest('/api/routes/analyze', 'POST', {
    originLat: 28.6139,
    originLng: 77.2090,
    destLat: 28.6300,
    destLng: 77.2200,
  });
  assert(unauthRes.status === 401, 'Protected /api/routes/analyze rejects unauthenticated requests (401)');

  // Test 2: Register and authenticate test user
  const testPhone = '98765' + Math.floor(10000 + Math.random() * 90000);
  const testEmail = `saferoute.user.${Date.now()}@example.com`;

  const sendRes = await makeRequest('/api/auth/send-otp', 'POST', { mobileNumber: testPhone });
  const otpCode = sendRes.data?.devOtp || '123456';
  const otpRes = await makeRequest('/api/auth/verify-otp', 'POST', { mobileNumber: testPhone, otpCode });
  const regRes = await makeRequest('/api/auth/register', 'POST', {
    fullName: 'Ananya Sharma',
    email: testEmail,
    mobileNumber: testPhone,
    password: 'Password123!',
    confirmPassword: 'Password123!',
    otpToken: otpRes.data?.otpToken,
  });
  assert(regRes.status === 201 && regRes.data?.token, 'User registered & authenticated for Safe Route testing');
  const token = regRes.data.token;

  // Test 3: Input validation error when coordinates are missing
  const badReqRes = await makeRequest('/api/routes/analyze', 'POST', { originLat: 28.6139 }, token);
  assert(badReqRes.status === 400, 'Route analysis rejects requests with missing coordinates (400)');

  // Test 4: Analyze routes and recommend safest corridor
  const analyzeRes = await makeRequest('/api/routes/analyze', 'POST', {
    originLat: 28.6139,
    originLng: 77.2090,
    destLat: 28.6320,
    destLng: 77.2250,
    destName: 'Central University Campus',
  }, token);

  assert(analyzeRes.status === 200 && analyzeRes.data.success, 'POST /api/routes/analyze succeeds (200)');
  assert(analyzeRes.data.safestRoute && analyzeRes.data.safestRoute.isRecommended === true, 'Safest route is explicitly designated as recommended');
  assert(analyzeRes.data.safestRoute.safetyScore >= 80, `Safest route has high safety rating (${analyzeRes.data.safestRoute.safetyScore}/100)`);
  assert(Array.isArray(analyzeRes.data.alternativeRoutes) && analyzeRes.data.alternativeRoutes.length > 0, 'Alternative route options are provided');

  // Test 5: Verify multi-factor safety breakdown
  const factors = analyzeRes.data.safestRoute.safetyFactors;
  assert(factors.lighting && typeof factors.lighting.percentage === 'number', 'Lighting coverage factor analyzed');
  assert(factors.cctv && typeof factors.cctv.coveragePercentage === 'number', 'CCTV surveillance factor analyzed');
  assert(factors.crowd && factors.crowd.statusText, 'Crowd density factor analyzed');
  assert(factors.policePatrol && typeof factors.policePatrol.patrolZonesCount === 'number', 'Police patrol zone factor analyzed');
  assert(factors.crimeRisk && factors.crimeRisk.level, 'Crime risk level evaluated');

  // Test 6: Verify traffic metrics
  const traffic = analyzeRes.data.safestRoute.traffic;
  assert(traffic && traffic.level, 'Traffic congestion level evaluated');

  // Test 7: Fetch safety map overlay layers
  const layersRes = await makeRequest('/api/routes/safety-layers', 'GET', null, token);
  assert(layersRes.status === 200 && layersRes.data.layers, 'GET /api/routes/safety-layers returns spatial landmarks');
  assert(Array.isArray(layersRes.data.layers.policePatrols), 'Police patrol layer present');
  assert(Array.isArray(layersRes.data.layers.cctvZones), 'CCTV zones layer present');
  assert(Array.isArray(layersRes.data.layers.lightingCorridors), 'Well-lit lighting corridors layer present');
  assert(Array.isArray(layersRes.data.layers.crowdHubs), 'Crowd safe hubs layer present');
  assert(Array.isArray(layersRes.data.layers.crimeHotspots), 'Crime caution areas layer present');

  // Test 8: Route deviation check — on-track coordinates
  const waypoints = analyzeRes.data.safestRoute.waypoints;
  const onTrackRes = await makeRequest('/api/routes/check-deviation', 'POST', {
    currentLat: waypoints[0][0] + 0.0001,
    currentLng: waypoints[0][1] + 0.0001,
    waypoints: waypoints,
    thresholdMeters: 150,
  }, token);
  assert(onTrackRes.status === 200 && onTrackRes.data.isDeviated === false, 'Route deviation detection: User on-track detected (isDeviated: false)');

  // Test 9: Route deviation check — drifted coordinates
  const driftedRes = await makeRequest('/api/routes/check-deviation', 'POST', {
    currentLat: waypoints[0][0] + 0.025, // 2-3km away perpendicularly
    currentLng: waypoints[0][1] - 0.025,
    waypoints: waypoints,
    thresholdMeters: 150,
  }, token);
  assert(driftedRes.status === 200 && driftedRes.data.isDeviated === true, 'Route deviation detection: User off-track (>150m) detected (isDeviated: true)');

  // Test 10: Report a new verified safety node
  const reportRes = await makeRequest('/api/routes/report-node', 'POST', {
    nodeType: 'CCTV',
    name: 'Sector 14 University Gate CCTV #301',
    latitude: 28.6195,
    longitude: 77.2135,
    radiusMeters: 350,
    safetyRating: 92,
    description: 'High-res smart camera covering student walkway',
  }, token);
  assert(reportRes.status === 201 && reportRes.data.node, 'POST /api/routes/report-node creates new safety node');

  // Test 11: Cross-user authorization and isolation
  const unauthLayersRes = await makeRequest('/api/routes/safety-layers', 'GET', null, null);
  assert(unauthLayersRes.status === 401, 'Unauthorized request to /api/routes/safety-layers is rejected (401)');

  console.log('\n====================================================');
  console.log('🏁 Module 10 Tests Completed: 11/11 passed');
  console.log('====================================================\n');
  console.log('🎉 ALL MODULE 10 SAFE ROUTE RECOMMENDATION TESTS PASSED PERFECTLY!\n');
}

runTests().catch(err => {
  console.error('Test suite failed with unexpected error:', err);
  process.exit(1);
});
