/**
 * test/chatbot_test.js
 * Automated test suite for SHE-GUARD Module 9: AI Safety Assistant & Chatbot
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
    fullName: `${namePrefix} SafetyTest`,
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
  console.log(' SHE-GUARD MODULE 9: AI SAFETY ASSISTANT — TEST SUITE');
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

    // 2. Test Unauthenticated Access Protection
    console.log('\n--- Test 2: Authentication & Authorization Protection ---');
    const unauthMsg = await makeRequest('POST', '/api/chat/message', { message: 'Help' });
    assert(unauthMsg.status === 401, 'Reject unauthenticated message sending with 401');

    const unauthHist = await makeRequest('GET', '/api/chat/history');
    assert(unauthHist.status === 401, 'Reject unauthenticated history retrieval with 401');

    // 3. Test Safety Guidance Capability
    console.log('\n--- Test 3: Safety Guidance Capability ---');
    const safetyRes = await makeRequest('POST', '/api/chat/message', {
      message: 'I am walking home alone at night. What safety precautions should I follow?',
      latitude: 28.6139,
      longitude: 77.2090,
    }, tokenA);

    assert(safetyRes.status === 200 && safetyRes.data.success, 'Safety guidance query succeeds (200)');
    assert(safetyRes.data.intent === 'SAFETY', 'Intent classified as SAFETY');
    assert(safetyRes.data.message.includes('Safe Route') || safetyRes.data.message.includes('corridor') || safetyRes.data.message.includes('location'), 'Response includes practical safe transit guidance');

    // 4. Test Emergency Instructions & Smart SOS Integration
    console.log('\n--- Test 4: Emergency Instructions & Smart SOS Integration ---');
    const emergencyRes = await makeRequest('POST', '/api/chat/message', {
      message: 'Someone is attacking me! I need immediate emergency help!',
      latitude: 28.6139,
      longitude: 77.2090,
    }, tokenA);

    assert(emergencyRes.status === 200 && emergencyRes.data.success, 'Emergency query succeeds (200)');
    assert(emergencyRes.data.intent === 'EMERGENCY', 'Intent classified as EMERGENCY');
    assert(emergencyRes.data.structuredData && emergencyRes.data.structuredData.showSosButton, 'Emergency response includes Smart SOS trigger action');
    assert(emergencyRes.data.quickActions.some(a => a.action === 'TRIGGER_SOS'), 'Smart SOS quick action button provided');

    // 5. Test First Aid Information Capability
    console.log('\n--- Test 5: First Aid Information & Disclaimers ---');
    const firstAidRes = await makeRequest('POST', '/api/chat/message', {
      message: 'What is the immediate first aid for a minor burn?',
    }, tokenA);

    assert(firstAidRes.status === 200 && firstAidRes.data.success, 'First aid query succeeds (200)');
    assert(firstAidRes.data.intent === 'FIRST_AID', 'Intent classified as FIRST_AID');
    assert(firstAidRes.data.message.includes('Cool the Burn') || firstAidRes.data.message.includes('running water'), 'Provides step-by-step first aid guidance');
    assert(firstAidRes.data.structuredData && firstAidRes.data.structuredData.disclaimer, 'Includes medical safety disclaimer (not a doctor)');

    // 6. Test Nearby Police Station Lookup
    console.log('\n--- Test 6: Nearby Police Station Lookup ---');
    const policeRes = await makeRequest('POST', '/api/chat/message', {
      message: 'Find the nearest police station to my location',
      latitude: 28.6139,
      longitude: 77.2090,
    }, tokenA);

    assert(policeRes.status === 200 && policeRes.data.success, 'Police lookup query succeeds (200)');
    assert(policeRes.data.intent === 'POLICE', 'Intent classified as POLICE');
    assert(policeRes.data.structuredData && Array.isArray(policeRes.data.structuredData.places) && policeRes.data.structuredData.places.length > 0, 'Returns structured nearby police stations array');
    const firstPolice = policeRes.data.structuredData.places[0];
    assert(firstPolice.name && firstPolice.distanceKm !== undefined && firstPolice.mapsUrl, 'Police station contains name, distance in km, and map navigation URL');

    // 7. Test Hospital Recommendations
    console.log('\n--- Test 7: Hospital Recommendations ---');
    const hospitalRes = await makeRequest('POST', '/api/chat/message', {
      message: 'Find the closest emergency hospital near me',
      latitude: 28.6139,
      longitude: 77.2090,
    }, tokenA);

    assert(hospitalRes.status === 200 && hospitalRes.data.success, 'Hospital lookup query succeeds (200)');
    assert(hospitalRes.data.intent === 'HOSPITAL', 'Intent classified as HOSPITAL');
    assert(hospitalRes.data.structuredData && Array.isArray(hospitalRes.data.structuredData.places) && hospitalRes.data.structuredData.places.length > 0, 'Returns structured nearby hospital facilities');
    const firstHospital = hospitalRes.data.structuredData.places[0];
    assert(firstHospital.name && firstHospital.distanceKm !== undefined, 'Hospital contains valid name and distance');

    // 8. Test Legal Assistance Information
    console.log('\n--- Test 8: Legal Assistance Information ---');
    const legalRes = await makeRequest('POST', '/api/chat/message', {
      message: 'What is a Zero FIR and what are my legal rights regarding harassment?',
    }, tokenA);

    assert(legalRes.status === 200 && legalRes.data.success, 'Legal assistance query succeeds (200)');
    assert(legalRes.data.intent === 'LEGAL', 'Intent classified as LEGAL');
    assert(legalRes.data.message.includes('Zero FIR') && (legalRes.data.message.includes('354') || legalRes.data.message.includes('NALSA')), 'Returns legal rights, Zero FIR guidelines, and helplines (15100 / 7827170170)');

    // 9. Test Suggested Prompt Chips Endpoint
    console.log('\n--- Test 9: Suggested Prompt Chips ---');
    const promptsRes = await makeRequest('GET', '/api/chat/prompts', null, tokenA);
    assert(promptsRes.status === 200 && Array.isArray(promptsRes.data.prompts) && promptsRes.data.prompts.length >= 6, 'Fetch suggested prompt chips');

    // 10. Test User Isolation & Privacy
    console.log('\n--- Test 10: User Privacy & Conversation Isolation ---');
    const historyA = await makeRequest('GET', '/api/chat/history', null, tokenA);
    assert(historyA.status === 200 && historyA.data.messages.length >= 6, 'User A has recorded chat history');

    const historyB = await makeRequest('GET', '/api/chat/history', null, tokenB);
    assert(historyB.status === 200 && historyB.data.messages.length === 0, 'User B has 0 messages (User A conversations strictly isolated)');

    // 11. Test Clear History
    console.log('\n--- Test 11: Clear Chat History ---');
    const clearRes = await makeRequest('DELETE', '/api/chat/history', null, tokenA);
    assert(clearRes.status === 200 && clearRes.data.success, 'Clear chat history succeeds');

    const postClearHistoryA = await makeRequest('GET', '/api/chat/history', null, tokenA);
    assert(postClearHistoryA.status === 200 && postClearHistoryA.data.messages.length === 0, 'User A chat history is now empty');

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
