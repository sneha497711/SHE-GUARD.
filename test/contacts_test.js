/**
 * Automated Verification Script for SHE-GUARD Module 2: Emergency Contact Management
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

  const otpCode = sendRes.data.devOtp;
  if (!otpCode) {
    throw new Error(`Failed to get OTP code: ${JSON.stringify(sendRes.data)}`);
  }

  // 2. Verify OTP
  const verifyRes = await request({
    hostname: 'localhost',
    port: PORT,
    path: '/api/auth/verify-otp',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { mobileNumber: phone, otpCode });

  if (!verifyRes.data.success) {
    throw new Error(`Verify OTP failed: ${JSON.stringify(verifyRes.data)}`);
  }

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

  if (!regRes.data.token) {
    throw new Error(`Register failed: ${JSON.stringify(regRes.data)}`);
  }

  return regRes.data.token;
}

async function runTests() {
  console.log('====================================================');
  console.log('🧪 Starting SHE-GUARD Module 2: Contact Management Tests');
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
    // 1. Helplines endpoint
    const helplinesRes = await request({
      hostname: 'localhost',
      port: PORT,
      path: '/api/emergency-contacts/helplines',
      method: 'GET'
    });
    assert(
      helplinesRes.status === 200 &&
      helplinesRes.data.success &&
      helplinesRes.data.helplines.police.number === '112' &&
      helplinesRes.data.helplines.womenHelpline.number === '1091',
      'GET /api/emergency-contacts/helplines returns official emergency numbers (112 & 1091)'
    );

    // 2. Auth protection on /api/emergency-contacts
    const unauthRes = await request({
      hostname: 'localhost',
      port: PORT,
      path: '/api/emergency-contacts',
      method: 'GET'
    });
    assert(unauthRes.status === 401, 'Protected /api/emergency-contacts rejects unauthenticated requests (401)');

    // 3. Register / Log in User A
    const timestamp = Date.now();
    const userAPhone = `98${String(timestamp).slice(-8)}`;
    const tokenA = await registerAndLoginUser('Alice Guard', userAPhone, `alice_${timestamp}@example.com`);

    assert(!!tokenA, 'User A registered & authenticated with JWT token');

    const authHeadersA = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${tokenA}`
    };

    // 4. Add Contact 1 (Priority 1, Family)
    const addC1 = await request({
      hostname: 'localhost',
      port: PORT,
      path: '/api/emergency-contacts',
      method: 'POST',
      headers: authHeadersA
    }, {
      name: 'Dad Emergency',
      phoneNumber: '9876543210',
      relationship: 'Father',
      contactGroup: 'Family',
      priority: 1,
      notes: 'Available 24/7'
    });

    assert(addC1.status === 201 && addC1.data.contact && addC1.data.contact.priority === 1, 'Add Contact 1 (Family / Priority 1)');
    const contact1Id = addC1.data.contact ? addC1.data.contact.id : null;

    // 5. Add Contact 2 (Priority 2, Friends)
    const addC2 = await request({
      hostname: 'localhost',
      port: PORT,
      path: '/api/emergency-contacts',
      method: 'POST',
      headers: authHeadersA
    }, {
      name: 'Bestie Priya',
      phoneNumber: '9876543211',
      relationship: 'Friend',
      contactGroup: 'Friends',
      priority: 2
    });

    assert(addC2.status === 201 && addC2.data.contact && addC2.data.contact.priority === 2, 'Add Contact 2 (Friends / Priority 2)');
    const contact2Id = addC2.data.contact ? addC2.data.contact.id : null;

    // 6. Add Contact 3 inserted at Priority 1 (Automatic Priority Shifting)
    const addC3 = await request({
      hostname: 'localhost',
      port: PORT,
      path: '/api/emergency-contacts',
      method: 'POST',
      headers: authHeadersA
    }, {
      name: 'Mom Emergency',
      phoneNumber: '9876543212',
      relationship: 'Mother',
      contactGroup: 'Family',
      priority: 1
    });

    assert(addC3.status === 201 && addC3.data.contact && addC3.data.contact.priority === 1, 'Add Contact 3 inserted at Priority 1');
    const contact3Id = addC3.data.contact ? addC3.data.contact.id : null;

    // 7. Check priority sequence normalization
    const listRes = await request({
      hostname: 'localhost',
      port: PORT,
      path: '/api/emergency-contacts',
      method: 'GET',
      headers: authHeadersA
    });

    const contactsList = listRes.data.contacts || [];
    const isPriorityOrdered = (
      contactsList.length === 3 &&
      contactsList[0].id === contact3Id && contactsList[0].priority === 1 &&
      contactsList[1].id === contact1Id && contactsList[1].priority === 2 &&
      contactsList[2].id === contact2Id && contactsList[2].priority === 3
    );
    assert(isPriorityOrdered, 'Priority cascading re-ordering verified (Mom: 1, Dad: 2, Priya: 3)');

    // 8. Test Duplicate Phone Validation for same user
    const dupRes = await request({
      hostname: 'localhost',
      port: PORT,
      path: '/api/emergency-contacts',
      method: 'POST',
      headers: authHeadersA
    }, {
      name: 'Duplicate Phone Contact',
      phoneNumber: '9876543210', // same as Dad
      relationship: 'Brother',
      contactGroup: 'Family'
    });
    assert(dupRes.status === 400 && !dupRes.data.success, 'Duplicate contact phone validation rejects existing number (400)');

    // 9. Test Group Category Filtering
    const familyFilterRes = await request({
      hostname: 'localhost',
      port: PORT,
      path: '/api/emergency-contacts?group=Family',
      method: 'GET',
      headers: authHeadersA
    });
    const familyContacts = familyFilterRes.data.contacts || [];
    assert(
      familyContacts.length === 2 &&
      familyContacts.every(c => (c.contactGroup || c.groupCategory) === 'Family'),
      'Filter contacts by Family grouping (?group=Family)'
    );

    // 10. Test One-Click Update (PUT)
    const updateRes = await request({
      hostname: 'localhost',
      port: PORT,
      path: `/api/emergency-contacts/${contact2Id}`,
      method: 'PUT',
      headers: authHeadersA
    }, {
      name: 'Priya Sharma (Roommate)',
      phoneNumber: '9876543299',
      relationship: 'Roommate',
      contactGroup: 'Friends',
      priority: 3,
      notes: 'Lives in same building'
    });
    assert(
      updateRes.status === 200 &&
      updateRes.data.contact &&
      updateRes.data.contact.name === 'Priya Sharma (Roommate)' &&
      (updateRes.data.contact.phoneNumber === '9876543299' || updateRes.data.contact.phone === '9876543299'),
      'One-click contact update (PUT /api/emergency-contacts/:id)'
    );

    // 11. Test User Isolation (User B cannot access or modify User A's contacts)
    const timestampB = Date.now() + 500;
    const userBPhone = `97${String(timestampB).slice(-8)}`;
    const tokenB = await registerAndLoginUser('Bob Guard', userBPhone, `bob_${timestampB}@example.com`);
    const authHeadersB = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${tokenB}`
    };

    // User B tries to get User A's contact
    const crossGetRes = await request({
      hostname: 'localhost',
      port: PORT,
      path: `/api/emergency-contacts/${contact1Id}`,
      method: 'GET',
      headers: authHeadersB
    });
    assert(crossGetRes.status === 404, 'User Isolation: User B cannot GET User A contact (404 Not Found)');

    // User B tries to update User A's contact
    const crossUpdateRes = await request({
      hostname: 'localhost',
      port: PORT,
      path: `/api/emergency-contacts/${contact1Id}`,
      method: 'PUT',
      headers: authHeadersB
    }, { name: 'Hacked Contact' });
    assert(crossUpdateRes.status === 404, 'User Isolation: User B cannot UPDATE User A contact (404 Not Found)');

    // User B tries to delete User A's contact
    const crossDeleteRes = await request({
      hostname: 'localhost',
      port: PORT,
      path: `/api/emergency-contacts/${contact1Id}`,
      method: 'DELETE',
      headers: authHeadersB
    });
    assert(crossDeleteRes.status === 404, 'User Isolation: User B cannot DELETE User A contact (404 Not Found)');

    // User B contact list is completely empty
    const listResB = await request({
      hostname: 'localhost',
      port: PORT,
      path: '/api/emergency-contacts',
      method: 'GET',
      headers: authHeadersB
    });
    assert(listResB.data.contacts && listResB.data.contacts.length === 0, 'User Isolation: User B contact list is isolated and empty');

    // 12. Delete Contact with Automatic Priority Normalization
    const deleteRes = await request({
      hostname: 'localhost',
      port: PORT,
      path: `/api/emergency-contacts/${contact1Id}`,
      method: 'DELETE',
      headers: authHeadersA
    });
    assert(deleteRes.status === 200, 'Delete Contact (DELETE /api/emergency-contacts/:id)');

    const finalListRes = await request({
      hostname: 'localhost',
      port: PORT,
      path: '/api/emergency-contacts',
      method: 'GET',
      headers: authHeadersA
    });

    const remaining = finalListRes.data.contacts || [];
    const isNormalized = (
      remaining.length === 2 &&
      remaining[0].id === contact3Id && remaining[0].priority === 1 &&
      remaining[1].id === contact2Id && remaining[1].priority === 2
    );
    assert(isNormalized, 'Post-deletion priority normalization verified (remaining contacts re-numbered 1, 2)');

    console.log('\n====================================================');
    console.log(`🏁 Module 2 Tests Completed: ${passed}/${total} passed`);
    console.log('====================================================\n');

    if (passed === total) {
      console.log('🎉 ALL MODULE 2 TESTS PASSED PERFECTLY!');
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
