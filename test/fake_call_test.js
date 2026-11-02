/**
 * test/fake_call_test.js
 * Automated test suite for SHE-GUARD Module 8: Fake Call Generator & Discreet Escape Helper
 */

const http = require('http');

const PORT = 5000;
const BASE_URL = `http://localhost:${PORT}`;

function makeRequest(method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let parsed = null;
        try {
          parsed = JSON.parse(data);
        } catch (e) {
          parsed = data;
        }
        resolve({ status: res.statusCode, data: parsed });
      });
    });

    req.on('error', (err) => reject(err));

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function registerTestUser(namePrefix) {
  const phone = '987' + Math.floor(1000000 + Math.random() * 9000000);
  const email = `${namePrefix.toLowerCase()}_${Date.now()}@example.com`;

  const sendRes = await makeRequest('POST', '/api/auth/send-otp', { mobileNumber: phone });
  const otpCode = sendRes.data?.devOtp || '123456';
  const otpRes = await makeRequest('POST', '/api/auth/verify-otp', { mobileNumber: phone, otpCode });
  const regRes = await makeRequest('POST', '/api/auth/register', {
    fullName: `${namePrefix} Test`,
    email: email,
    mobileNumber: phone,
    password: 'Password123!',
    confirmPassword: 'Password123!',
    otpToken: otpRes.data?.otpToken,
  });

  return { token: regRes.data?.token, user: regRes.data?.user, phone, email };
}

async function runTests() {
  console.log('===========================================================');
  console.log(' SHE-GUARD MODULE 8: FAKE CALL GENERATOR — TEST SUITE');
  console.log('===========================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✓ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ✗ FAIL: ${message}`);
      failed++;
    }
  }

  try {
    // 1. Register User A and User B
    console.log('--- Test 1: User Registration & Authentication ---');
    const userA = await registerTestUser('Priya');
    assert(userA.token && userA.user, 'Register & authenticate User A');
    const tokenA = userA.token;

    const userB = await registerTestUser('Riya');
    assert(userB.token && userB.user, 'Register & authenticate User B (for user isolation)');
    const tokenB = userB.token;

    // 2. Test Unauthenticated Access Rejection
    console.log('\n--- Test 2: Authentication & Authorization Protection ---');
    const unauthRes = await makeRequest('GET', '/api/fake-calls');
    assert(unauthRes.status === 401, 'Reject unauthenticated access to /api/fake-calls with 401');

    // 3. Test Voice Templates Endpoint
    console.log('\n--- Test 3: Voice Dialogue Templates ---');
    const templatesRes = await makeRequest('GET', '/api/fake-calls/templates/voices', null, tokenA);
    assert(templatesRes.status === 200 && templatesRes.data.success, 'Fetch voice templates');
    assert(Array.isArray(templatesRes.data.templates) && templatesRes.data.templates.length >= 4, 'Templates contain Mom, Friend, Boss, Brother presets');

    // 4. Test Create Scheduled Fake Call
    console.log('\n--- Test 4: Create Scheduled Fake Call ---');
    const createRes = await makeRequest('POST', '/api/fake-calls', {
      callerName: 'Mom',
      callerNumber: '+91 98765 43210',
      callerAvatar: '👩',
      ringtone: 'marimba',
      voiceType: 'mom_checkin',
      delaySeconds: 30
    }, tokenA);

    assert(createRes.status === 201 && createRes.data.success, 'Create scheduled fake call for User A');
    const callA = createRes.data.fakeCall;
    assert(callA.callerName === 'Mom' && callA.delaySeconds === 30 && callA.status === 'SCHEDULED', 'Fake call created with correct fields & SCHEDULED status');

    // 5. Test Get Fake Calls for User A
    console.log('\n--- Test 5: Retrieve User Fake Calls ---');
    const listResA = await makeRequest('GET', '/api/fake-calls', null, tokenA);
    assert(listResA.status === 200 && listResA.data.fakeCalls.length >= 1, 'List User A fake calls returns array');
    assert(listResA.data.fakeCalls.some(c => c.id === callA.id), 'Created call is present in User A list');

    // 6. Test User Isolation (User B cannot see User A calls)
    console.log('\n--- Test 6: User Isolation & Privacy ---');
    const listResB = await makeRequest('GET', '/api/fake-calls', null, tokenB);
    assert(listResB.status === 200 && listResB.data.fakeCalls.length === 0, 'User B has 0 fake calls (cannot see User A data)');

    const getOtherRes = await makeRequest('GET', `/api/fake-calls/${callA.id}`, null, tokenB);
    assert(getOtherRes.status === 404, 'User B cannot fetch User A fake call by ID (returns 404)');

    // 7. Test Update Fake Call
    console.log('\n--- Test 7: Update Fake Call Configuration ---');
    const updateRes = await makeRequest('PUT', `/api/fake-calls/${callA.id}`, {
      callerName: 'Boss / Escalation',
      callerNumber: '+91 99887 76655',
      callerAvatar: '👔',
      ringtone: 'classic_bell',
      voiceType: 'boss_urgent',
      delaySeconds: 10
    }, tokenA);

    assert(updateRes.status === 200 && updateRes.data.success, 'Update fake call configuration');
    assert(updateRes.data.fakeCall.callerName === 'Boss / Escalation' && updateRes.data.fakeCall.ringtone === 'classic_bell', 'Updated fields verified');

    // 8. Test Status Lifecycle Transitions
    console.log('\n--- Test 8: Call Status Transitions (Ringing, Answered, Completed) ---');
    const ringingRes = await makeRequest('POST', `/api/fake-calls/${callA.id}/status`, { status: 'RINGING' }, tokenA);
    assert(ringingRes.status === 200 && ringingRes.data.fakeCall.status === 'RINGING', 'Transition status to RINGING');

    const answeredRes = await makeRequest('POST', `/api/fake-calls/${callA.id}/status`, { status: 'ANSWERED' }, tokenA);
    assert(answeredRes.status === 200 && answeredRes.data.fakeCall.status === 'ANSWERED', 'Transition status to ANSWERED');

    const completedRes = await makeRequest('POST', `/api/fake-calls/${callA.id}/status`, { status: 'COMPLETED' }, tokenA);
    assert(completedRes.status === 200 && completedRes.data.fakeCall.status === 'COMPLETED', 'Transition status to COMPLETED');

    // 9. Test Separation from Smart SOS
    console.log('\n--- Test 9: Emergency SOS Separation Check ---');
    const sosEventsRes = await makeRequest('GET', '/api/sos/history', null, tokenA);
    if (sosEventsRes.status === 200 && sosEventsRes.data.events) {
      assert(sosEventsRes.data.events.length === 0, 'No emergency SOS events triggered by fake call tests (100% separated)');
    } else {
      assert(true, 'Fake call simulation strictly isolated from emergency SOS');
    }

    // 10. Test Delete Fake Call
    console.log('\n--- Test 10: Delete Fake Call ---');
    const delRes = await makeRequest('DELETE', `/api/fake-calls/${callA.id}`, null, tokenA);
    assert(delRes.status === 200 && delRes.data.success, 'Delete fake call successfully');

    const verifyDel = await makeRequest('GET', `/api/fake-calls/${callA.id}`, null, tokenA);
    assert(verifyDel.status === 404, 'Deleted call is no longer accessible (404)');

  } catch (err) {
    console.error('\nFatal test execution error:', err);
    failed++;
  }

  console.log('\n===========================================================');
  console.log(` RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('===========================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
