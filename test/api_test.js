/**
 * test/api_test.js — Complete Module 1 Verification Suite
 */

const http = require('http');

const BASE_URL = 'http://localhost:5000';

async function request(path, method = 'GET', body = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const req = http.request(url, { method, headers }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, data: json });
        } catch (e) {
          resolve({ status: res.statusCode, text: data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`✅ PASSED: ${message}`);
}

async function runTests() {
  console.log('\n======================================================');
  console.log('🧪 RUNNING SHE-GUARD MODULE 1 AUTOMATED TEST SUITE');
  console.log('======================================================\n');

  const testMobile = '987654' + Math.floor(1000 + Math.random() * 9000);
  const testEmail = `sheguard.test.${Date.now()}@example.com`;
  const testPassword = 'SecurePassword@123';

  console.log(`Test Subject: Mobile=+91 ${testMobile}, Email=${testEmail}\n`);

  // ── TEST 1: Health Check ──
  console.log('--- Test 1: API Server Health ---');
  const health = await request('/api/health');
  assert(health.status === 200 && health.data.status === 'healthy', 'Server responds to /api/health');

  // ── TEST 2: Send OTP ──
  console.log('\n--- Test 2: Mobile Number OTP Generation ---');
  const otpRes = await request('/api/auth/send-otp', 'POST', {
    mobileNumber: testMobile,
    checkExisting: true,
  });
  assert(otpRes.status === 200, `OTP sent successfully (${otpRes.data.message})`);
  assert(otpRes.data.devOtp !== undefined || otpRes.data.expiresAt !== undefined, 'OTP expiry and code generated securely');
  const generatedOtp = otpRes.data.devOtp;
  console.log(`[Test Helper] Generated OTP is: ${generatedOtp}`);

  // ── TEST 3: Resend Cooldown ──
  console.log('\n--- Test 3: OTP Resend Cooldown Enforcement ---');
  const cooldownRes = await request('/api/auth/send-otp', 'POST', {
    mobileNumber: testMobile,
    checkExisting: false,
  });
  assert(cooldownRes.status === 429, 'Immediate OTP resend blocked by 60s cooldown limit');

  // ── TEST 4: Invalid OTP Verification ──
  console.log('\n--- Test 4: Invalid OTP Handling ---');
  const wrongOtpRes = await request('/api/auth/verify-otp', 'POST', {
    mobileNumber: testMobile,
    otpCode: '000000',
  });
  assert(wrongOtpRes.status === 400 && wrongOtpRes.data.success === false, 'Invalid OTP code rejected with clear error');

  // ── TEST 5: Valid OTP Verification ──
  console.log('\n--- Test 5: Valid OTP Verification ---');
  const validOtpRes = await request('/api/auth/verify-otp', 'POST', {
    mobileNumber: testMobile,
    otpCode: generatedOtp,
  });
  assert(validOtpRes.status === 200 && validOtpRes.data.success === true, 'Valid OTP verified successfully');

  // ── TEST 6: User Registration ──
  console.log('\n--- Test 6: User Registration & Password Hashing ---');
  const regRes = await request('/api/auth/register', 'POST', {
    fullName: 'Priya Sharma',
    email: testEmail,
    mobileNumber: testMobile,
    password: testPassword,
    confirmPassword: testPassword,
    age: 22,
    address: 'Plot 42, Hitech City',
    city: 'Hyderabad',
    state: 'Telangana',
    pin: '500081',
    bloodGroup: 'B+',
    emergencyContactName: 'Anita Sharma',
    emergencyContactNumber: '9123456780',
    emergencyContactRelationship: 'Mother',
  });
  assert(regRes.status === 201 && regRes.data.token, 'User registered and JWT token returned');
  assert(regRes.data.user.passwordHash === undefined, 'Password hash is NEVER exposed to client');
  assert(regRes.data.user.mobileVerified === 1, 'Account marked as mobileVerified');
  const authToken = regRes.data.token;

  // ── TEST 7: Login with Email & Password ──
  console.log('\n--- Test 7: Secure Login via Email ---');
  const loginEmailRes = await request('/api/auth/login', 'POST', {
    identifier: testEmail,
    password: testPassword,
  });
  assert(loginEmailRes.status === 200 && loginEmailRes.data.token, 'Logged in successfully using Email');

  // ── TEST 8: Login with Mobile & Password ──
  console.log('\n--- Test 8: Secure Login via Mobile Number ---');
  const loginMobileRes = await request('/api/auth/login', 'POST', {
    identifier: testMobile,
    password: testPassword,
  });
  assert(loginMobileRes.status === 200 && loginMobileRes.data.token, 'Logged in successfully using Mobile Number');

  // ── TEST 9: Wrong Password Rejection ──
  console.log('\n--- Test 9: Wrong Password Rejection ---');
  const badLoginRes = await request('/api/auth/login', 'POST', {
    identifier: testEmail,
    password: 'IncorrectPassword',
  });
  assert(badLoginRes.status === 401, 'Wrong password rejected with 401 Unauthorized');

  // ── TEST 10: Protected Route Authentication ──
  console.log('\n--- Test 10: Authorization Guard (Protected Routes) ---');
  const unauthRes = await request('/api/profile', 'GET');
  assert(unauthRes.status === 401, 'Unauthenticated request to /api/profile rejected (401)');

  const authProfileRes = await request('/api/profile', 'GET', null, authToken);
  assert(authProfileRes.status === 200 && authProfileRes.data.profile.fullName === 'Priya Sharma', 'Authenticated profile retrieved successfully');

  // ── TEST 11: Medical Information Management ──
  console.log('\n--- Test 11: Medical Information & Blood Group ---');
  const medUpdateRes = await request('/api/profile/medical', 'PUT', {
    bloodGroup: 'O+',
    medicalConditions: 'Mild Asthma',
    allergies: 'Penicillin, Dust',
    currentMedication: 'Salbutamol Inhaler',
    additionalMedicalInformation: 'Keep inhaler in purse during emergencies',
  }, authToken);
  assert(medUpdateRes.status === 200 && medUpdateRes.data.medical.bloodGroup === 'O+', 'Medical details and Blood Group updated');

  const getMedRes = await request('/api/profile/medical', 'GET', null, authToken);
  assert(getMedRes.data.medical.allergies === 'Penicillin, Dust', 'Medical information persisted in database');

  // ── TEST 12: Invalid Blood Group Rejection ──
  console.log('\n--- Test 12: Blood Group Validation ---');
  const badBloodRes = await request('/api/profile/medical', 'PUT', {
    bloodGroup: 'InvalidBloodType',
  }, authToken);
  assert(badBloodRes.status === 400, 'Invalid blood group rejected by backend validation');

  // ── TEST 13: Emergency Details Management ──
  console.log('\n--- Test 13: Emergency Details Management ---');
  const emUpdateRes = await request('/api/profile/emergency', 'PUT', {
    emergencyContactName: 'Dr. Ramesh Sharma',
    emergencyContactNumber: '9876500000',
    emergencyContactRelationship: 'Father',
    emergencyInformation: 'Call father first if after 9 PM',
  }, authToken);
  assert(emUpdateRes.status === 200 && emUpdateRes.data.emergency.emergencyContactName === 'Dr. Ramesh Sharma', 'Emergency contact details updated');

  const getEmRes = await request('/api/profile/emergency', 'GET', null, authToken);
  assert(getEmRes.data.emergency.emergencyContactRelationship === 'Father', 'Emergency details persisted in database');

  // ── TEST 14: User Context for SOS Integration ──
  console.log('\n--- Test 14: /api/auth/me Profile Context for Smart SOS ---');
  const meRes = await request('/api/auth/me', 'GET', null, authToken);
  assert(meRes.status === 200 && meRes.data.user.emergencyContactNumber === '9876500000', 'Full user safety context accessible for Smart SOS');

  console.log('\n======================================================');
  console.log('🎉 ALL 14 TESTS PASSED SUCCESSFULLY! MODULE 1 IS VERIFIED');
  console.log('======================================================\n');
}

runTests().catch(err => {
  console.error('\n❌ TEST RUN FAILED:', err);
  process.exit(1);
});
