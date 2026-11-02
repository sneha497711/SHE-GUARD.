/**
 * Automated Verification Script for SHE-GUARD Module 3: Smart SOS
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
  console.log('🧪 Starting SHE-GUARD Module 3: Smart SOS Tests');
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
    // 1. Auth protection on /api/sos/trigger
    const unauthRes = await request({
      hostname: 'localhost',
      port: PORT,
      path: '/api/sos/trigger',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { triggerSource: 'button' });
    assert(unauthRes.status === 401, 'Protected /api/sos/trigger rejects unauthenticated requests (401)');

    // 2. Register User A
    const timestamp = Date.now();
    const userAPhone = `98${String(timestamp).slice(-8)}`;
    const tokenA = await registerAndLoginUser('Priya Sharma', userAPhone, `priya_${timestamp}@example.com`);
    assert(!!tokenA, 'User A registered & authenticated for Smart SOS');

    const authHeadersA = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${tokenA}`
    };

    // 3. Add Priority Contacts from Module 2 for User A
    await request({
      hostname: 'localhost',
      port: PORT,
      path: '/api/emergency-contacts',
      method: 'POST',
      headers: authHeadersA
    }, {
      name: 'Dad Contact',
      phoneNumber: '9876543210',
      relationship: 'Father',
      contactGroup: 'Family',
      priority: 1
    });

    await request({
      hostname: 'localhost',
      port: PORT,
      path: '/api/emergency-contacts',
      method: 'POST',
      headers: authHeadersA
    }, {
      name: 'Sister Contact',
      phoneNumber: '9876543211',
      relationship: 'Sister',
      contactGroup: 'Family',
      priority: 2
    });

    // 4. Trigger SOS (One-Touch Button trigger with GPS)
    const triggerRes = await request({
      hostname: 'localhost',
      port: PORT,
      path: '/api/sos/trigger',
      method: 'POST',
      headers: authHeadersA
    }, {
      triggerSource: 'button',
      latitude: 17.3850,
      longitude: 78.4867,
      accuracy: 5.2,
      notes: 'Test emergency trigger via SOS button'
    });

    assert(
      triggerRes.status === 201 &&
      triggerRes.data.success &&
      triggerRes.data.incident &&
      triggerRes.data.incident.status === 'ACTIVE' &&
      triggerRes.data.incident.triggerSource === 'button',
      'Trigger Central SOS (POST /api/sos/trigger) registers ACTIVE incident with GPS coordinates'
    );

    const incident1Id = triggerRes.data.incident.id;

    // 5. Verify Priority #1 Contact call link & SMS dispatch
    assert(
      triggerRes.data.primaryContact &&
      triggerRes.data.primaryContact.name === 'Dad Contact' &&
      triggerRes.data.primaryContact.callLink === 'tel:9876543210' &&
      triggerRes.data.contactsNotified === 2,
      'Central SOS automatically identifies Priority #1 contact for one-click calling and dispatches SMS'
    );

    // 6. Check Active SOS Status
    const statusRes = await request({
      hostname: 'localhost',
      port: PORT,
      path: '/api/sos/status',
      method: 'GET',
      headers: authHeadersA
    });

    assert(
      statusRes.status === 200 &&
      statusRes.data.active === true &&
      statusRes.data.incident.id === incident1Id &&
      statusRes.data.primaryContact.name === 'Dad Contact',
      'GET /api/sos/status returns active ongoing emergency state'
    );

    // 7. Live Location Streaming Update
    const locUpdateRes = await request({
      hostname: 'localhost',
      port: PORT,
      path: `/api/sos/${incident1Id}/location`,
      method: 'POST',
      headers: authHeadersA
    }, {
      latitude: 17.3899,
      longitude: 78.4920,
      accuracy: 3.5
    });

    assert(
      locUpdateRes.status === 200 &&
      locUpdateRes.data.incident.latitude === 17.3899 &&
      locUpdateRes.data.incident.longitude === 78.4920 &&
      locUpdateRes.data.incident.liveLocationStatus === 'STREAMING',
      'Live Location Stream (POST /api/sos/:id/location) updates real-time coordinates'
    );

    // 8. Test Shake Phone Trigger
    const shakeTriggerRes = await request({
      hostname: 'localhost',
      port: PORT,
      path: '/api/sos/trigger',
      method: 'POST',
      headers: authHeadersA
    }, {
      triggerSource: 'shake',
      latitude: 17.3910,
      longitude: 78.4950
    });

    assert(
      shakeTriggerRes.status === 201 &&
      shakeTriggerRes.data.incident.triggerSource === 'shake' &&
      shakeTriggerRes.data.incident.status === 'ACTIVE',
      'Trigger SOS via Phone Shake (source: shake) creates active incident'
    );

    const incident2Id = shakeTriggerRes.data.incident.id;

    // 9. Test Voice Command Trigger
    const voiceTriggerRes = await request({
      hostname: 'localhost',
      port: PORT,
      path: '/api/sos/trigger',
      method: 'POST',
      headers: authHeadersA
    }, {
      triggerSource: 'voice',
      latitude: 17.3920,
      longitude: 78.4960,
      notes: 'Triggered by voice keyword: "bachao"'
    });

    assert(
      voiceTriggerRes.status === 201 &&
      voiceTriggerRes.data.incident.triggerSource === 'voice' &&
      voiceTriggerRes.data.incident.status === 'ACTIVE',
      'Trigger SOS via Voice Command (source: voice) creates active incident'
    );

    const incident3Id = voiceTriggerRes.data.incident.id;

    // 10. Test External Smartwatch / Bluetooth Trigger
    const extTriggerRes = await request({
      hostname: 'localhost',
      port: PORT,
      path: '/api/sos/external-trigger',
      method: 'POST',
      headers: authHeadersA
    }, {
      triggerSource: 'bluetooth',
      deviceId: 'BT_FOB_01',
      latitude: 17.3930,
      longitude: 78.4970
    });

    assert(
      extTriggerRes.status === 201 &&
      extTriggerRes.data.incident.triggerSource === 'bluetooth',
      'External Trigger endpoint (POST /api/sos/external-trigger) handles Bluetooth panic button & Smartwatch'
    );

    const incident4Id = extTriggerRes.data.incident.id;

    // 11. Resolve Active SOS Incident
    const resolveRes = await request({
      hostname: 'localhost',
      port: PORT,
      path: `/api/sos/${incident4Id}/resolve`,
      method: 'POST',
      headers: authHeadersA
    }, { notes: 'User verified safe via PIN/Safe Button' });

    assert(
      resolveRes.status === 200 &&
      resolveRes.data.incident.status === 'RESOLVED' &&
      resolveRes.data.incident.liveLocationStatus === 'STOPPED' &&
      !!resolveRes.data.incident.resolvedAt,
      'Resolve SOS (POST /api/sos/:id/resolve) marks incident RESOLVED and records resolvedAt timestamp'
    );

    // 12. Verify Active Status is now cleared
    const statusAfterResolve = await request({
      hostname: 'localhost',
      port: PORT,
      path: '/api/sos/status',
      method: 'GET',
      headers: authHeadersA
    });

    assert(
      statusAfterResolve.status === 200 && statusAfterResolve.data.active === false,
      'Active SOS status is cleared after incident resolution'
    );

    // 13. Query SOS Incident History
    const historyRes = await request({
      hostname: 'localhost',
      port: PORT,
      path: '/api/sos/history',
      method: 'GET',
      headers: authHeadersA
    });

    assert(
      historyRes.status === 200 &&
      historyRes.data.success &&
      historyRes.data.incidents.length >= 4,
      'GET /api/sos/history returns complete persistent incident log from database'
    );

    // 14. Test User Isolation (User B cannot see or manipulate User A's SOS incidents)
    const timestampB = Date.now() + 800;
    const userBPhone = `97${String(timestampB).slice(-8)}`;
    const tokenB = await registerAndLoginUser('Bob Guard', userBPhone, `bob_${timestampB}@example.com`);

    const authHeadersB = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${tokenB}`
    };

    // User B tries to update User A's incident location
    const crossLocationRes = await request({
      hostname: 'localhost',
      port: PORT,
      path: `/api/sos/${incident1Id}/location`,
      method: 'POST',
      headers: authHeadersB
    }, { latitude: 0, longitude: 0 });

    assert(crossLocationRes.status === 404, 'User Isolation: User B cannot update User A incident location (404 Not Found)');

    // User B tries to resolve User A's incident
    const crossResolveRes = await request({
      hostname: 'localhost',
      port: PORT,
      path: `/api/sos/${incident1Id}/resolve`,
      method: 'POST',
      headers: authHeadersB
    }, { notes: 'Malicious resolve' });

    assert(crossResolveRes.status === 404 || (crossResolveRes.status === 200 && crossResolveRes.data.incident === undefined), 'User Isolation: User B cannot modify User A incident state');

    // User B history is completely isolated and empty
    const historyResB = await request({
      hostname: 'localhost',
      port: PORT,
      path: '/api/sos/history',
      method: 'GET',
      headers: authHeadersB
    });

    assert(
      historyResB.status === 200 && historyResB.data.incidents.length === 0,
      'User Isolation: User B incident history is isolated and empty'
    );

    console.log('\n====================================================');
    console.log(`🏁 Module 3 Tests Completed: ${passed}/${total} passed`);
    console.log('====================================================\n');

    if (passed === total) {
      console.log('🎉 ALL MODULE 3 SMART SOS TESTS PASSED PERFECTLY!');
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
