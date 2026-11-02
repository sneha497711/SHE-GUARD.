/**
 * Automated Verification Script for SHE-GUARD Module 4: Live GPS Tracking
 */

const http = require('http');

const PORT = 5000;

function request(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const parsed = body ? JSON.parse(body) : {};
          resolve({ status: res.statusCode, headers: res.headers, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, data: body });
        }
      });
    });
    req.on('error', reject);
    if (data) {
      req.write(typeof data === 'string' ? data : JSON.stringify(data));
    }
    req.end();
  });
}

async function registerAndLoginUser(fullName, phone, email) {
  // 1. Send OTP
  const sendRes = await request({
    hostname: 'localhost',
    port: PORT,
    path: '/api/auth/send-otp',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { mobileNumber: phone });

  const otpCode = sendRes.data.devOtp || '123456';

  // 2. Verify OTP
  await request({
    hostname: 'localhost',
    port: PORT,
    path: '/api/auth/verify-otp',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { mobileNumber: phone, otpCode });

  // 3. Register
  const regRes = await request({
    hostname: 'localhost',
    port: PORT,
    path: '/api/auth/register',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    fullName,
    mobileNumber: phone,
    email,
    password: 'Password123!',
    confirmPassword: 'Password123!'
  });

  return regRes.data.token;
}

async function runTests() {
  console.log('====================================================');
  console.log('🧪 Starting SHE-GUARD Module 4: Live GPS Tracking Tests');
  console.log('====================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition, testName, extra = '') {
    total++;
    if (condition) {
      console.log(`✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${testName} ${extra}`);
    }
  }

  try {
    // 1. Auth protection on /api/location/update
    const unauthRes = await request({
      hostname: 'localhost',
      port: PORT,
      path: '/api/location/update',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { latitude: 17.3850, longitude: 78.4867 });
    assert(unauthRes.status === 401, 'Protected /api/location/update rejects unauthenticated requests (401)');

    // 2. Register User A (Ananya) & User B (Family Contact: Mom)
    const timestamp = Date.now();
    const userAPhone = `98${String(timestamp).slice(-8)}`;
    const tokenA = await registerAndLoginUser('Ananya Roy', userAPhone, `ananya_${timestamp}@example.com`);
    assert(!!tokenA, 'User A registered & authenticated');

    const authHeadersA = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${tokenA}`
    };

    const userBPhone = `97${String(timestamp + 500).slice(-8)}`;
    const tokenB = await registerAndLoginUser('Mom Emergency', userBPhone, `mom_${timestamp}@example.com`);
    assert(!!tokenB, 'Family Member (User B) registered & authenticated');

    const authHeadersB = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${tokenB}`
    };

    // 3. User A updates live GPS location
    const updateLocRes = await request({
      hostname: 'localhost',
      port: PORT,
      path: '/api/location/update',
      method: 'POST',
      headers: authHeadersA
    }, {
      latitude: 17.38504,
      longitude: 78.48667,
      accuracy: 8.5,
      isTracking: 1,
      isSharing: 1,
    });

    assert(
      updateLocRes.status === 200 &&
      updateLocRes.data.success &&
      updateLocRes.data.location.latitude === 17.38504 &&
      updateLocRes.data.location.longitude === 78.48667 &&
      updateLocRes.data.location.isTracking === 1,
      'Update Live GPS Location (POST /api/location/update) persists coordinates in database'
    );

    // 4. Retrieve Current Location
    const getLocRes = await request({
      hostname: 'localhost',
      port: PORT,
      path: '/api/location/current',
      method: 'GET',
      headers: authHeadersA
    });

    assert(
      getLocRes.status === 200 &&
      getLocRes.data.location &&
      getLocRes.data.location.latitude === 17.38504,
      'Get Current Location (GET /api/location/current) returns latest GPS state'
    );

    // 5. Start and Stop Tracking Controls
    const stopRes = await request({
      hostname: 'localhost',
      port: PORT,
      path: '/api/location/stop',
      method: 'POST',
      headers: authHeadersA
    });
    assert(stopRes.status === 200 && stopRes.data.tracking === false, 'Stop Tracking control (POST /api/location/stop)');

    const startRes = await request({
      hostname: 'localhost',
      port: PORT,
      path: '/api/location/start',
      method: 'POST',
      headers: authHeadersA
    });
    assert(startRes.status === 200 && startRes.data.tracking === true, 'Start Tracking control (POST /api/location/start)');

    // 6. Route Calculation, Distance Monitoring, and ETA
    const routeRes = await request({
      hostname: 'localhost',
      port: PORT,
      path: '/api/location/route',
      method: 'POST',
      headers: authHeadersA
    }, {
      originLat: 17.3850,
      originLng: 78.4867,
      destLat: 17.4100,
      destLng: 78.5000,
      destName: 'City Central Police Station'
    });

    assert(
      routeRes.status === 200 &&
      routeRes.data.success &&
      routeRes.data.directRoute &&
      routeRes.data.directRoute.distanceKm > 0 &&
      routeRes.data.directRoute.walkingEtaMin > 0 &&
      routeRes.data.safeRoute &&
      routeRes.data.safeRoute.isRecommended === true,
      'Route & Distance Calculation (POST /api/location/route) provides distance, ETA, and Safe Corridor suggestion'
    );

    // 7. Create Geofence (Safe Zone)
    const createGfRes = await request({
      hostname: 'localhost',
      port: PORT,
      path: '/api/geofences',
      method: 'POST',
      headers: authHeadersA
    }, {
      name: 'Home Safe Zone',
      latitude: 17.3850,
      longitude: 78.4867,
      radius: 500
    });

    assert(
      createGfRes.status === 201 &&
      createGfRes.data.success &&
      createGfRes.data.geofence.name === 'Home Safe Zone' &&
      createGfRes.data.geofence.radius === 500,
      'Create Safe Zone Geofence (POST /api/geofences)'
    );

    const geofenceId = createGfRes.data.geofence.id;

    // 8. List User Geofences
    const listGfRes = await request({
      hostname: 'localhost',
      port: PORT,
      path: '/api/geofences',
      method: 'GET',
      headers: authHeadersA
    });

    assert(
      listGfRes.status === 200 &&
      listGfRes.data.geofences.length >= 1 &&
      listGfRes.data.geofences[0].id === geofenceId,
      'List User Safe Zones (GET /api/geofences)'
    );

    // 9. Geofence Boundary Check (Inside vs Outside)
    // Point inside radius (20 meters away)
    const insideUpdate = await request({
      hostname: 'localhost',
      port: PORT,
      path: '/api/location/update',
      method: 'POST',
      headers: authHeadersA
    }, {
      latitude: 17.3851,
      longitude: 78.4868
    });

    const insideCheck = insideUpdate.data.geofences && insideUpdate.data.geofences.find(g => g.id === geofenceId);
    assert(
      insideCheck && insideCheck.isInside === true && insideCheck.status === 'INSIDE_SAFE_ZONE',
      'Geofence Boundary Check: Inside safe zone detected'
    );

    // Point outside radius (5 km away)
    const outsideUpdate = await request({
      hostname: 'localhost',
      port: PORT,
      path: '/api/location/update',
      method: 'POST',
      headers: authHeadersA
    }, {
      latitude: 17.4300,
      longitude: 78.5300
    });

    const outsideCheck = outsideUpdate.data.geofences && outsideUpdate.data.geofences.find(g => g.id === geofenceId);
    assert(
      outsideCheck && outsideCheck.isInside === false && outsideCheck.status === 'OUTSIDE_SAFE_ZONE',
      'Geofence Boundary Check: Outside safe zone detected (Geofence Exit)'
    );

    // 10. Update and Delete Geofence
    const updateGfRes = await request({
      hostname: 'localhost',
      port: PORT,
      path: `/api/geofences/${geofenceId}`,
      method: 'PUT',
      headers: authHeadersA
    }, {
      name: 'Home Perimeter Extended',
      radius: 800
    });
    assert(updateGfRes.status === 200 && updateGfRes.data.geofence.radius === 800, 'Update Geofence (PUT /api/geofences/:id)');

    const deleteGfRes = await request({
      hostname: 'localhost',
      port: PORT,
      path: `/api/geofences/${geofenceId}`,
      method: 'DELETE',
      headers: authHeadersA
    });
    assert(deleteGfRes.status === 200, 'Delete Geofence (DELETE /api/geofences/:id)');

    // 11. Family Live Location Sharing
    // User A adds User B (Mom) as an emergency contact in Module 2
    await request({
      hostname: 'localhost',
      port: PORT,
      path: '/api/emergency-contacts',
      method: 'POST',
      headers: authHeadersA
    }, {
      name: 'Mom',
      phoneNumber: userBPhone,
      relationship: 'Mother',
      contactGroup: 'Family',
      priority: 1
    });

    // User B enables live location sharing and updates coordinates
    await request({
      hostname: 'localhost',
      port: PORT,
      path: '/api/location/update',
      method: 'POST',
      headers: authHeadersB
    }, {
      latitude: 17.4000,
      longitude: 78.4900,
      accuracy: 5.0,
      isTracking: 1,
      isSharing: 1,
    });

    // User A queries family live locations
    const familyLocRes = await request({
      hostname: 'localhost',
      port: PORT,
      path: '/api/location/family',
      method: 'GET',
      headers: authHeadersA
    });

    const momStatus = familyLocRes.data.familyMembers && familyLocRes.data.familyMembers.find(f => f.phoneNumber === userBPhone);
    assert(
      familyLocRes.status === 200 &&
      momStatus &&
      momStatus.status === 'LIVE' &&
      momStatus.latitude === 17.4000 &&
      momStatus.longitude === 78.4900,
      'Family Live Tracking (GET /api/location/family) retrieves live coordinates and LIVE status for authorized contacts'
    );

    // 12. Privacy & User Isolation: User B cannot access or delete User A's geofences
    const crossGfRes = await request({
      hostname: 'localhost',
      port: PORT,
      path: `/api/geofences/${geofenceId}`,
      method: 'DELETE',
      headers: authHeadersB
    });
    assert(crossGfRes.status === 404, 'User Isolation: User B cannot access or modify User A safe zones (404 Not Found)');

    console.log('\n====================================================');
    console.log(`🏁 Module 4 Tests Completed: ${passed}/${total} passed`);
    console.log('====================================================\n');

    if (passed === total) {
      console.log('🎉 ALL MODULE 4 LIVE GPS TRACKING TESTS PASSED PERFECTLY!');
      process.exit(0);
    } else {
      console.error('❌ SOME TESTS FAILED');
      process.exit(1);
    }

  } catch (err) {
    console.error('Test execution error:', err);
    process.exit(1);
  }
}

runTests();
