/**
 * js/auth.js — SHE-GUARD Authentication & Profile Manager
 * Handles Registration, OTP Verification, Login, JWT Session, Medical Info, and Emergency Details.
 */

// Determine API base URL (works seamlessly when served by backend or standalone Live Server)
const API_BASE_URL = (window.location.protocol === 'file:' || window.location.port === '5500' || window.location.port === '3000')
  ? 'http://localhost:5000'
  : window.location.origin;

let _authCooldownTimer = null;
let _cooldownSecondsRemaining = 0;
let _tempRegData = null; // In-memory cache during registration steps

// ── API CLIENT WRAPPER ─────────────────────────────────
async function sgApiRequest(endpoint, method = 'GET', body = null, requiresAuth = false) {
  const url = `${API_BASE_URL}${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
  };

  const token = localStorage.getItem('sg_auth_token');
  if (requiresAuth || token) {
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }

  const options = {
    method,
    headers,
  };

  if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
    options.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(url, options);
    const data = await response.json();

    if (!response.ok) {
      // If token is invalid or expired
      if (response.status === 401 && requiresAuth) {
        sgLog('Session expired or unauthorized. Logging out.', 'warning');
        sgHandleSessionExpired();
      }
      const error = new Error(data.message || `Request failed with status ${response.status}`);
      error.status = response.status;
      error.data = data;
      throw error;
    }

    return data;
  } catch (err) {
    if (err.name === 'TypeError' && err.message.includes('Failed to fetch')) {
      throw new Error(`Cannot connect to SHE-GUARD server at ${API_BASE_URL}. Please make sure the backend is running.`);
    }
    throw err;
  }
}

// ── SESSION EXPIRED HANDLER ────────────────────────────
function sgHandleSessionExpired() {
  localStorage.removeItem('sg_auth_token');
  localStorage.removeItem('sg_auth_user');
  localStorage.removeItem('sg_profile');
  if (typeof userProfile !== 'undefined') userProfile = null;
  sgShowAuthModal('login');
  showToast('Session expired. Please log in again.', 'warning');
}

// ── CHECK AUTH STATE ON APP STARTUP ───────────────────
async function sgCheckAuthState() {
  const token = localStorage.getItem('sg_auth_token');
  if (!token) {
    sgShowAuthModal('login');
    return false;
  }

  try {
    const res = await sgApiRequest('/api/auth/me', 'GET', null, true);
    if (res.success && res.user) {
      sgSyncUserData(res.user);
      sgHideAuthModal();
      return true;
    } else {
      sgShowAuthModal('login');
      return false;
    }
  } catch (err) {
    sgLog(`Auth check failed: ${err.message}`, 'warning');
    // Fallback to local profile if server is briefly unreachable
    const cachedUser = JSON.parse(localStorage.getItem('sg_auth_user') || 'null');
    if (cachedUser) {
      sgSyncUserData(cachedUser);
      sgHideAuthModal();
      return true;
    }
    sgShowAuthModal('login');
    return false;
  }
}

// ── SYNC USER DATA ACROSS STATE & STORAGE ──────────────
function sgSyncUserData(user) {
  if (!user) return;
  localStorage.setItem('sg_auth_user', JSON.stringify(user));

  // Map to legacy / dashboard profile schema
  const profile = {
    id: user.id,
    name: user.fullName || user.name || '',
    email: user.email || '',
    phone: user.mobileNumber || user.phone || '',
    age: user.age || '',
    blood: user.bloodGroup || 'Unknown',
    address: user.address || '',
    city: user.city || '',
    state: user.state || '',
    pin: user.pin || '',
    medicalConditions: user.medicalConditions || '',
    allergies: user.allergies || '',
    currentMedication: user.currentMedication || '',
    additionalMedicalInformation: user.additionalMedicalInformation || '',
    emname: user.emergencyContactName || '',
    emphone: user.emergencyContactNumber || '',
    emrel: user.emergencyContactRelationship || 'Family',
    emergencyInformation: user.emergencyInformation || '',
  };

  localStorage.setItem('sg_profile', JSON.stringify(profile));
  if (typeof userProfile !== 'undefined') {
    userProfile = profile;
  }

  // Seed emergency contact for SOS if present
  if (profile.emname && profile.emphone) {
    let currContacts = JSON.parse(localStorage.getItem('sg_contacts') || '[]');
    const exists = currContacts.some(c => c.phone === profile.emphone);
    if (!exists) {
      currContacts.unshift({
        id: Date.now(),
        name: profile.emname,
        phone: profile.emphone,
        rel: profile.emrel || 'Family',
      });
      localStorage.setItem('sg_contacts', JSON.stringify(currContacts));
      if (typeof contacts !== 'undefined') contacts = currContacts;
    }
  }

  // Update UI user header badge
  sgUpdateHeaderUserBadge(profile);

  // Re-render views if they exist
  if (typeof renderContacts === 'function') renderContacts();
  if (typeof renderProfileView === 'function') renderProfileView();
}

// ── HEADER USER BADGE & LOGOUT ─────────────────────────
function sgUpdateHeaderUserBadge(profile) {
  const wrap = document.getElementById('userHeaderWrap');
  if (!wrap) return;
  if (profile && profile.name) {
    const initials = profile.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    wrap.innerHTML = `
      <div class="user-pill" title="${profile.name} (${profile.phone || profile.email})">
        <div class="user-avatar-mini">${initials}</div>
        <span class="user-pill-name">${profile.name.split(' ')[0]}</span>
        <button class="btn-logout-icon" onclick="sgLogout()" title="Log out">
          <i class="fas fa-sign-out-alt"></i>
        </button>
      </div>
    `;
    wrap.classList.remove('hidden');
  } else {
    wrap.classList.add('hidden');
  }
}

// ── AUTH MODAL VIEW SWITCHER ───────────────────────────
function sgShowAuthModal(tab = 'login') {
  const modal = document.getElementById('authModal');
  if (!modal) return;
  modal.classList.remove('hidden');
  sgSwitchAuthTab(tab);
}

function sgHideAuthModal() {
  const modal = document.getElementById('authModal');
  if (modal) modal.classList.add('hidden');
}

function sgSwitchAuthTab(tab) {
  const tabLogin = document.getElementById('authTabBtnLogin');
  const tabReg = document.getElementById('authTabBtnReg');
  const formLogin = document.getElementById('authLoginForm');
  const formReg = document.getElementById('authRegForm');

  if (tab === 'login') {
    tabLogin?.classList.add('active');
    tabReg?.classList.remove('active');
    formLogin?.classList.remove('hidden');
    formReg?.classList.add('hidden');
  } else {
    tabReg?.classList.add('active');
    tabLogin?.classList.remove('active');
    formReg?.classList.remove('hidden');
    formLogin?.classList.add('hidden');
    sgGoRegStep(1);
  }
}

// ── LOGIN HANDLER ──────────────────────────────────────
async function sgHandleLogin(event) {
  if (event) event.preventDefault();
  const identEl = document.getElementById('loginIdentifier');
  const passEl = document.getElementById('loginPassword');
  const btn = document.getElementById('loginSubmitBtn');
  const errEl = document.getElementById('loginErrorAlert');

  if (errEl) errEl.classList.add('hidden');

  const identifier = identEl ? identEl.value.trim() : '';
  const password = passEl ? passEl.value : '';

  if (!identifier) {
    sgShowAuthError('loginErrorAlert', 'Please enter your Mobile Number or Email Address.');
    return;
  }
  if (!password) {
    sgShowAuthError('loginErrorAlert', 'Please enter your Password.');
    return;
  }

  try {
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Logging in…';
    }

    const res = await sgApiRequest('/api/auth/login', 'POST', { identifier, password });

    if (res.success && res.token) {
      localStorage.setItem('sg_auth_token', res.token);
      sgSyncUserData(res.user);
      sgHideAuthModal();
      showToast(`Welcome back, ${res.user.fullName || 'User'}! 💗`);

      // Initialize permissions & monitoring
      setTimeout(() => {
        if (typeof perms !== 'undefined' && (!perms.mic || !perms.loc || !perms.motion)) {
          const permModal = document.getElementById('permissionModal');
          if (permModal) {
            permModal.classList.remove('hidden');
            if (typeof syncPermUI === 'function') syncPermUI();
          }
        } else {
          if (typeof startAllMonitoring === 'function') startAllMonitoring();
          if (typeof checkNightMode === 'function') checkNightMode();
        }
      }, 400);
    }
  } catch (err) {
    console.error('Login error:', err);
    sgShowAuthError('loginErrorAlert', err.message || 'Login failed. Please check your credentials.');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = 'Login <i class="fas fa-arrow-right"></i>';
    }
  }
}

// ── LOGOUT HANDLER ─────────────────────────────────────
async function sgLogout() {
  try {
    await sgApiRequest('/api/auth/logout', 'POST').catch(() => {});
  } catch (e) {}

  localStorage.removeItem('sg_auth_token');
  localStorage.removeItem('sg_auth_user');
  localStorage.removeItem('sg_profile');

  if (typeof userProfile !== 'undefined') userProfile = null;
  if (typeof sgStopVoiceRecognition === 'function') sgStopVoiceRecognition();
  if (typeof sgStopMotionMonitor === 'function') sgStopMotionMonitor();
  if (typeof sgStopTracking === 'function') sgStopTracking();

  sgUpdateHeaderUserBadge(null);
  sgShowAuthModal('login');
  showToast('You have been logged out safely.', 'info');
}

// ── REGISTRATION: STEP CONTROLLER ──────────────────────
function sgGoRegStep(step) {
  const step1 = document.getElementById('regStep1');
  const step2 = document.getElementById('regStep2');
  const step3 = document.getElementById('regStep3');

  const dot1 = document.getElementById('regDot1');
  const dot2 = document.getElementById('regDot2');
  const dot3 = document.getElementById('regDot3');

  [step1, step2, step3].forEach(s => {
    if (s) {
      s.classList.remove('active');
      s.classList.add('hidden');
    }
  });
  [dot1, dot2, dot3].forEach(d => {
    if (d) {
      d.classList.remove('active');
      d.classList.remove('done');
    }
  });

  if (step === 1 && step1) {
    step1.classList.remove('hidden');
    step1.classList.add('active');
    dot1?.classList.add('active');
  } else if (step === 2 && step2) {
    step2.classList.remove('hidden');
    step2.classList.add('active');
    dot2?.classList.add('active');
    dot1?.classList.add('done');
  } else if (step === 3 && step3) {
    step3.classList.remove('hidden');
    step3.classList.add('active');
    dot3?.classList.add('active');
    dot1?.classList.add('done');
    dot2?.classList.add('done');
  }
}

// ── REGISTRATION STEP 1: SEND OTP ──────────────────────
async function sgSubmitRegStep1(event) {
  if (event) event.preventDefault();
  const nameEl = document.getElementById('regFullName');
  const phoneEl = document.getElementById('regMobile');
  const emailEl = document.getElementById('regEmail');
  const passEl = document.getElementById('regPassword');
  const cpassEl = document.getElementById('regConfirmPassword');
  const btn = document.getElementById('regSendOtpBtn');
  const errEl = document.getElementById('regStep1Error');

  if (errEl) errEl.classList.add('hidden');

  const fullName = nameEl ? nameEl.value.trim() : '';
  const mobileNumber = phoneEl ? phoneEl.value.trim() : '';
  const email = emailEl ? emailEl.value.trim() : '';
  const password = passEl ? passEl.value : '';
  const confirmPassword = cpassEl ? cpassEl.value : '';

  // Validations
  if (!fullName) {
    sgShowAuthError('regStep1Error', 'Please enter your Full Name.');
    return;
  }
  const cleanMobile = mobileNumber.replace(/\D/g, '').slice(-10);
  if (cleanMobile.length !== 10) {
    sgShowAuthError('regStep1Error', 'Please enter a valid 10-digit mobile number.');
    return;
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email)) {
    sgShowAuthError('regStep1Error', 'Please enter a valid email address.');
    return;
  }
  if (!password || password.length < 6) {
    sgShowAuthError('regStep1Error', 'Password must be at least 6 characters long.');
    return;
  }
  if (password !== confirmPassword) {
    sgShowAuthError('regStep1Error', 'Passwords do not match.');
    return;
  }

  // Cache data
  _tempRegData = {
    fullName,
    mobileNumber: cleanMobile,
    email,
    password,
    confirmPassword,
  };

  try {
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending OTP…';
    }

    const res = await sgApiRequest('/api/auth/send-otp', 'POST', {
      mobileNumber: cleanMobile,
      checkExisting: true,
    });

    if (res.success) {
      showToast('OTP generated for +91 ' + cleanMobile + ' 📲');

      // Update Step 2 UI with mobile number
      const displayPhone = document.getElementById('regOtpPhoneDisplay');
      if (displayPhone) displayPhone.textContent = `+91 ${cleanMobile}`;

      // Dev helper notification if in development mode
      if (res.devOtp) {
        sgShowDevOtpBanner(res.devOtp);
      }

      sgStartOtpCooldown(res.cooldownSeconds || 60);
      sgGoRegStep(2);

      // Focus first OTP input box
      setTimeout(() => {
        const firstOtpInput = document.querySelector('.otp-input');
        if (firstOtpInput) firstOtpInput.focus();
      }, 200);
    }
  } catch (err) {
    console.error('Send OTP error:', err);
    if (err.status === 429 || (err.data && err.data.cooldownRemaining)) {
      showToast('OTP already generated. Entering verification…', 'info');
      const displayPhone = document.getElementById('regOtpPhoneDisplay');
      if (displayPhone) displayPhone.textContent = `+91 ${cleanMobile}`;

      if (err.data && err.data.devOtp) {
        sgShowDevOtpBanner(err.data.devOtp);
      }

      sgStartOtpCooldown(err.data.cooldownRemaining || 60);
      sgGoRegStep(2);
      return;
    }
    sgShowAuthError('regStep1Error', err.message || 'Failed to send OTP.');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = 'Verify Mobile &amp; Continue <i class="fas fa-arrow-right"></i>';
    }
  }
}

// ── DEV OTP BANNER HELPER ──────────────────────────────
function sgShowDevOtpBanner(otpCode) {
  window._lastDevOtp = otpCode;
  const devNotice = document.getElementById('devOtpNotice');
  if (devNotice) {
    devNotice.innerHTML = `
      <div class="dev-otp-box">
        <div class="dev-otp-title"><i class="fas fa-key"></i> Verification Code:</div>
        <div class="dev-otp-code-wrap">
          <span class="dev-otp-code-val">${otpCode}</span>
          <button type="button" class="btn-autofill-action" onclick="sgAutoFillOtp('${otpCode}')">
            <i class="fas fa-magic"></i> Auto-fill OTP
          </button>
        </div>
        <div class="dev-otp-expl">
          <i class="fas fa-info-circle"></i> SMS Gateway is in dev-safe mode (Fast2SMS requires DLT registration for live telecom delivery). Use the code above.
        </div>
      </div>
    `;
    devNotice.classList.remove('hidden');
  }
}

function sgAutoFillOtp(code) {
  const targetCode = String(code || window._lastDevOtp || '');
  if (!targetCode) return;
  const inputs = document.querySelectorAll('.otp-input');
  for (let i = 0; i < targetCode.length && i < inputs.length; i++) {
    inputs[i].value = targetCode[i];
  }
  if (inputs.length > 0) inputs[inputs.length - 1].focus();
  showToast('OTP auto-filled ✓');
}

// ── REGISTRATION STEP 2: VERIFY OTP & CREATE ACCOUNT ──
async function sgSubmitRegStep2(event) {
  if (event) event.preventDefault();
  const btn = document.getElementById('regVerifyOtpBtn');
  const errEl = document.getElementById('regStep2Error');
  if (errEl) errEl.classList.add('hidden');

  if (!_tempRegData) {
    sgShowAuthError('regStep2Error', 'Session timed out. Please start registration again.');
    sgGoRegStep(1);
    return;
  }

  // Collect 6 OTP digits
  const inputs = document.querySelectorAll('.otp-input');
  let otpCode = '';
  inputs.forEach(input => {
    otpCode += input.value.trim();
  });

  if (otpCode.length !== 6) {
    sgShowAuthError('regStep2Error', 'Please enter the complete 6-digit OTP.');
    return;
  }

  try {
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verifying…';
    }

    // 1. Verify OTP
    const verifyRes = await sgApiRequest('/api/auth/verify-otp', 'POST', {
      mobileNumber: _tempRegData.mobileNumber,
      otpCode,
    });

    if (!verifyRes.success) {
      throw new Error(verifyRes.message || 'Invalid OTP.');
    }

    // 2. Register Account
    const regRes = await sgApiRequest('/api/auth/register', 'POST', _tempRegData);

    if (regRes.success && regRes.token) {
      localStorage.setItem('sg_auth_token', regRes.token);
      sgSyncUserData(regRes.user);
      showToast('Mobile verified & account created! ✓');

      // Pre-fill Step 3 with default info
      const nameEl = document.getElementById('regProfileName');
      if (nameEl) nameEl.value = _tempRegData.fullName;
      const phoneEl = document.getElementById('regProfilePhone');
      if (phoneEl) phoneEl.value = _tempRegData.mobileNumber;

      sgGoRegStep(3);
    }
  } catch (err) {
    console.error('Verify OTP error:', err);
    sgShowAuthError('regStep2Error', err.message || 'OTP verification failed.');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = 'Verify &amp; Create Account <i class="fas fa-shield-check"></i>';
    }
  }
}

// ── RESEND OTP ─────────────────────────────────────────
async function sgResendOtp() {
  if (_cooldownSecondsRemaining > 0) return;
  if (!_tempRegData || !_tempRegData.mobileNumber) {
    sgGoRegStep(1);
    return;
  }

  const resendBtn = document.getElementById('regResendOtpBtn');
  const errEl = document.getElementById('regStep2Error');
  if (errEl) errEl.classList.add('hidden');

  try {
    if (resendBtn) resendBtn.textContent = 'Resending…';
    const res = await sgApiRequest('/api/auth/send-otp', 'POST', {
      mobileNumber: _tempRegData.mobileNumber,
      checkExisting: false,
    });

    if (res.success) {
      showToast('New OTP sent to +91 ' + _tempRegData.mobileNumber + ' 📲');
      if (res.devOtp) {
        const devNotice = document.getElementById('devOtpNotice');
        if (devNotice) {
          devNotice.innerHTML = `<i class="fas fa-code"></i> Dev Mode OTP: <strong>${res.devOtp}</strong>`;
          devNotice.classList.remove('hidden');
        }
      }
      sgStartOtpCooldown(res.cooldownSeconds || 60);
    }
  } catch (err) {
    sgShowAuthError('regStep2Error', err.message || 'Failed to resend OTP.');
  }
}

function sgStartOtpCooldown(seconds) {
  _cooldownSecondsRemaining = seconds;
  const resendBtn = document.getElementById('regResendOtpBtn');
  const timerText = document.getElementById('otpCooldownTimer');

  if (resendBtn) resendBtn.disabled = true;

  if (_authCooldownTimer) clearInterval(_authCooldownTimer);

  _authCooldownTimer = setInterval(() => {
    _cooldownSecondsRemaining--;
    if (_cooldownSecondsRemaining <= 0) {
      clearInterval(_authCooldownTimer);
      _authCooldownTimer = null;
      if (resendBtn) {
        resendBtn.disabled = false;
        resendBtn.innerHTML = '<i class="fas fa-redo"></i> Resend OTP';
      }
      if (timerText) timerText.textContent = '';
    } else {
      if (timerText) timerText.textContent = `(in ${_cooldownSecondsRemaining}s)`;
    }
  }, 1000);
}

// ── REGISTRATION STEP 3: COMPLETE PROFILE ──────────────
async function sgSubmitRegStep3(event) {
  if (event) event.preventDefault();
  const btn = document.getElementById('regCompleteProfileBtn');
  const errEl = document.getElementById('regStep3Error');
  if (errEl) errEl.classList.add('hidden');

  const age = document.getElementById('regAge')?.value.trim();
  const bloodGroup = document.getElementById('regBlood')?.value;
  const address = document.getElementById('regAddress')?.value.trim();
  const city = document.getElementById('regCity')?.value.trim();
  const state = document.getElementById('regState')?.value.trim();
  const pin = document.getElementById('regPin')?.value.trim();

  // Medical fields
  const medicalConditions = document.getElementById('regConditions')?.value.trim();
  const allergies = document.getElementById('regAllergies')?.value.trim();
  const currentMedication = document.getElementById('regMedication')?.value.trim();
  const additionalMedicalInformation = document.getElementById('regMedicalNotes')?.value.trim();

  // Emergency contact fields
  const emergencyContactName = document.getElementById('regEmName')?.value.trim();
  const emergencyContactNumber = document.getElementById('regEmPhone')?.value.trim();
  const emergencyContactRelationship = document.getElementById('regEmRel')?.value || 'Family';
  const emergencyInformation = document.getElementById('regEmNotes')?.value.trim();

  if (!emergencyContactName || !emergencyContactNumber) {
    sgShowAuthError('regStep3Error', 'Emergency contact name and phone number are required for safety.');
    return;
  }

  try {
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving Profile…';
    }

    // Update Personal & Address Profile
    await sgApiRequest('/api/profile', 'PUT', {
      age,
      address,
      city,
      state,
      pin,
    }, true);

    // Update Medical Info
    await sgApiRequest('/api/profile/medical', 'PUT', {
      bloodGroup: bloodGroup || 'Unknown',
      medicalConditions,
      allergies,
      currentMedication,
      additionalMedicalInformation,
    }, true);

    // Update Emergency Contact
    const emRes = await sgApiRequest('/api/profile/emergency', 'PUT', {
      emergencyContactName,
      emergencyContactNumber,
      emergencyContactRelationship,
      emergencyInformation,
    }, true);

    if (emRes.success && emRes.user) {
      sgSyncUserData(emRes.user);
    }

    sgHideAuthModal();
    showToast(`Welcome to SHE-GUARD! Safety profile active 🛡️`);

    // Permissions modal
    setTimeout(() => {
      if (typeof perms !== 'undefined' && (!perms.mic || !perms.loc || !perms.motion)) {
        document.getElementById('permissionModal')?.classList.remove('hidden');
        if (typeof syncPermUI === 'function') syncPermUI();
      } else {
        if (typeof startAllMonitoring === 'function') startAllMonitoring();
        if (typeof checkNightMode === 'function') checkNightMode();
      }
    }, 400);

  } catch (err) {
    console.error('Save profile step error:', err);
    sgShowAuthError('regStep3Error', err.message || 'Error saving profile details.');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = 'Complete Setup &amp; Enter SHE-GUARD <i class="fas fa-shield-heart"></i>';
    }
  }
}

// ── PROFILE TAB: UPDATE PERSONAL PROFILE ───────────────
async function sgUpdatePersonalProfile() {
  const name = document.getElementById('ep_name')?.value.trim();
  const email = document.getElementById('ep_email')?.value.trim();
  const age = document.getElementById('ep_age')?.value.trim();
  const address = document.getElementById('ep_address')?.value.trim();
  const city = document.getElementById('ep_city')?.value.trim();
  const state = document.getElementById('ep_state')?.value.trim();
  const pin = document.getElementById('ep_pin')?.value.trim();

  if (!name) {
    showToast('Name is required', 'error');
    return;
  }

  try {
    const res = await sgApiRequest('/api/profile', 'PUT', {
      fullName: name,
      email,
      age,
      address,
      city,
      state,
      pin,
    }, true);

    if (res.success && res.user) {
      sgSyncUserData(res.user);
      if (typeof closeEditProfile === 'function') closeEditProfile();
      showToast('Personal details updated ✓');
    }
  } catch (err) {
    showToast(err.message || 'Failed to update personal details.', 'error');
  }
}

// ── PROFILE TAB: UPDATE MEDICAL INFORMATION ────────────
async function sgUpdateMedicalInfo() {
  const bloodGroup = document.getElementById('med_blood')?.value;
  const medicalConditions = document.getElementById('med_conditions')?.value.trim();
  const allergies = document.getElementById('med_allergies')?.value.trim();
  const currentMedication = document.getElementById('med_medication')?.value.trim();
  const additionalMedicalInformation = document.getElementById('med_notes')?.value.trim();

  try {
    const res = await sgApiRequest('/api/profile/medical', 'PUT', {
      bloodGroup: bloodGroup || 'Unknown',
      medicalConditions,
      allergies,
      currentMedication,
      additionalMedicalInformation,
    }, true);

    if (res.success && res.user) {
      sgSyncUserData(res.user);
      document.getElementById('editMedicalModal')?.classList.add('hidden');
      showToast('Medical information saved ✓');
    }
  } catch (err) {
    showToast(err.message || 'Failed to update medical details.', 'error');
  }
}

// ── PROFILE TAB: UPDATE EMERGENCY DETAILS ──────────────
async function sgUpdateEmergencyDetails() {
  const emergencyContactName = document.getElementById('em_name')?.value.trim();
  const emergencyContactNumber = document.getElementById('em_phone')?.value.trim();
  const emergencyContactRelationship = document.getElementById('em_rel')?.value || 'Family';
  const emergencyInformation = document.getElementById('em_notes')?.value.trim();

  if (!emergencyContactName || !emergencyContactNumber) {
    showToast('Emergency contact name and phone are required', 'error');
    return;
  }

  try {
    const res = await sgApiRequest('/api/profile/emergency', 'PUT', {
      emergencyContactName,
      emergencyContactNumber,
      emergencyContactRelationship,
      emergencyInformation,
    }, true);

    if (res.success && res.user) {
      sgSyncUserData(res.user);
      document.getElementById('editEmergencyModal')?.classList.add('hidden');
      showToast('Emergency details updated ✓');
    }
  } catch (err) {
    showToast(err.message || 'Failed to update emergency details.', 'error');
  }
}

// ── ERROR MESSAGE DISPLAY HELPER ───────────────────────
function sgShowAuthError(elementId, message) {
  const el = document.getElementById(elementId);
  if (el) {
    el.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${message}`;
    el.classList.remove('hidden');
  } else {
    showToast(message, 'error');
  }
}

// ── OTP INPUT AUTO-ADVANCE & BACKSPACE HANDLER ─────────
function sgInitOtpInputListeners() {
  const inputs = document.querySelectorAll('.otp-input');
  inputs.forEach((input, index) => {
    input.addEventListener('input', (e) => {
      input.value = input.value.replace(/\D/g, ''); // numbers only
      if (input.value && index < inputs.length - 1) {
        inputs[index + 1].focus();
      }
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !input.value && index > 0) {
        inputs[index - 1].focus();
      }
    });

    input.addEventListener('paste', (e) => {
      e.preventDefault();
      const text = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '').slice(0, 6);
      if (text) {
        for (let i = 0; i < text.length && i < inputs.length; i++) {
          inputs[i].value = text[i];
        }
        if (text.length < inputs.length) {
          inputs[text.length].focus();
        } else {
          inputs[inputs.length - 1].focus();
        }
      }
    });
  });
}

// Document load init for OTP handlers
document.addEventListener('DOMContentLoaded', () => {
  sgInitOtpInputListeners();
});
