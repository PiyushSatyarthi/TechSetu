// ─── ORDER FEE CONSTANTS (single source of truth) ───
const DELIVERY_FEE = 40;
const PACKAGING_FEE = 15;
const ORDER_FEES_TOTAL = DELIVERY_FEE + PACKAGING_FEE; // 55

// ─── TICKER ───
const crops = [
  {name:'Tomatoes 🍅',price:'₹20/kg',change:'+2.5%',up:true},
  {name:'Potatoes 🥔',price:'₹15/kg',change:'-1.2%',up:false},
  {name:'Onions 🧅',price:'₹18/kg',change:'+0.8%',up:true},
  {name:'Wheat 🌾',price:'₹28/kg',change:'+3.1%',up:true},
  {name:'Spinach 🥬',price:'₹25/kg',change:'-0.5%',up:false},
  {name:'Carrots 🥕',price:'₹22/kg',change:'+1.4%',up:true},
  {name:'Rice 🌾',price:'₹45/kg',change:'+0.9%',up:true},
  {name:'Chilies 🌶',price:'₹60/kg',change:'-2.0%',up:false},
];
const tickerEl = document.getElementById('ticker');
const makeItems = () => crops.map(c=>`
  <span class="ticker-item">
    <span class="ticker-crop">${c.name}</span>
    <span class="ticker-price">${c.price}</span>
    <span class="ticker-change ${c.up?'ticker-up':'ticker-dn'}">${c.change}</span>
    <span class="ticker-sep">|</span>
  </span>`).join('');
tickerEl.innerHTML = makeItems()+makeItems();

// ─── SCROLL ANIMATIONS ───
const obs=new IntersectionObserver(entries=>{
  entries.forEach(e=>{if(e.isIntersecting)e.target.classList.add('visible')});
},{threshold:.12});
document.querySelectorAll('.fade-up').forEach(el=>obs.observe(el));

// ─── SCREEN SYSTEM ───
let currentRole = null;
let currentLoginTab = 'login';
let currentBuyerType = 'personal';
let currentProduct = null;
const API_BASE = (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost')
  ? 'http://127.0.0.1:8000'
  : '';
const SCREEN_STORAGE_KEY = 'techsetu_current_screen';
const AUTH_STATE_KEY = 'techsetu_auth_state';
const AUTH_DRAFTS_KEY = 'techsetu_auth_drafts';
const HOME_ROLE_BADGE_KEY = 'techsetu_home_role_badge';
const PROFILE_PREV_SCREEN_KEY = 'techsetu_profile_prev_screen';
const FORGOT_PASSWORD_COOLDOWN_MS = 60000;
const FORGOT_PASSWORD_COOLDOWN_UNTIL_KEY = 'techsetu_forgot_cooldown_until';
const OTP_BUTTON_DEFAULT_COOLDOWN_SECONDS = 60;

let forgotPasswordCooldownUntil = 0;
let forgotPasswordTimer = null;
let pendingGoogleRole = 'buyer';
const otpButtonCooldowns = {};

function readJsonStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (_) {
    return fallback;
  }
}

// Scrub any password values that may have been stored by older versions of this app.
(function purgeLegacyPasswordDrafts() {
  try {
    const drafts = JSON.parse(localStorage.getItem(AUTH_DRAFTS_KEY) || '{}');
    let changed = false;
    for(const key of Object.keys(drafts)) {
      if(drafts[key] && ('auth-password' in drafts[key] || 'auth-confirm-password' in drafts[key])) {
        delete drafts[key]['auth-password'];
        delete drafts[key]['auth-confirm-password'];
        changed = true;
      }
    }
    if(changed) localStorage.setItem(AUTH_DRAFTS_KEY, JSON.stringify(drafts));
  } catch(_) {}
})();

function writeJsonStorage(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function getAuthKey(role, tab) {
  return `${role || 'buyer'}:${tab || 'login'}`;
}

function saveAuthState() {
  writeJsonStorage(AUTH_STATE_KEY, {currentRole, currentLoginTab});
}

function snapshotAuthInputs() {
  if(!currentRole) return;
  // Deliberately exclude password fields — never persist passwords to localStorage.
  const ids = [
    'auth-first-name','auth-last-name','auth-state','auth-primary-crop',
    'auth-organisation','auth-phone','auth-otp','auth-email'
  ];
  const key = getAuthKey(currentRole, currentLoginTab);
  const drafts = readJsonStorage(AUTH_DRAFTS_KEY, {});
  const values = {};
  ids.forEach(id => {
    const el = document.getElementById(id);
    if(el) values[id] = el.value;
  });
  drafts[key] = {...(drafts[key] || {}), ...values};
  writeJsonStorage(AUTH_DRAFTS_KEY, drafts);
}

function getDraftValue(role, tab, field) {
  const drafts = readJsonStorage(AUTH_DRAFTS_KEY, {});
  const key = getAuthKey(role, tab);
  return drafts[key]?.[field] || '';
}

function showScreen(id) {
  // Hide page-main if needed
  document.getElementById('page-main').style.display = 'none';
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  const el = document.getElementById(id);
  if(el) el.classList.add('active');
  localStorage.setItem(SCREEN_STORAGE_KEY, id);
  window.scrollTo(0,0);
}

function showPageMain() {
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.getElementById('page-main').style.display = 'block';
  localStorage.setItem(SCREEN_STORAGE_KEY, 'page-main');
}

function showRoleSelect() {
  showScreen('screen-role-select');
}

function openTransport() {
  window.location.href = 'techsetu-request-transport.html';
}

function openFarmerPage(page) {
  const routes = {
    dashboard: 'techsetu_farmer_dashboard.html',
    listing: 'techsetu-add-listing.html',
    offers: 'techsetu-incoming-buyer-offers.html',
    payments: 'techsetu-payment-history.html',
    transport: 'techsetu-request-transport.html',
  };
  if(routes[page]) {
    window.location.href = routes[page];
  }
}

function goToLogin(role) {
  snapshotAuthInputs();
  currentRole = role;
  currentLoginTab = 'login';
  saveAuthState();
  showScreen('screen-login');
  renderLoginScreen(role);
}

function goBack(fromScreen, toId) {
  document.getElementById(fromScreen).classList.remove('active');
  if(toId === 'page-main') {
    showPageMain();
  } else {
    showScreen(toId);
  }
}

function loginSuccess(role) {
  if(role === 'buyer') {
    window.location.href = 'customer-home.html';
  } else {
    window.location.href = 'techsetu_farmer_dashboard.html';
  }
}

function setHomeRoleBadge(role) {
  const badge = document.getElementById('buyer-type-badge');
  if(!badge) return;
  badge.textContent = role === 'farmer' ? 'Farmer' : 'Customer';
}

function saveHomeRoleBadge(role) {
  localStorage.setItem(HOME_ROLE_BADGE_KEY, role === 'farmer' ? 'farmer' : 'buyer');
}

function applySavedHomeRoleBadge() {
  const savedRole = localStorage.getItem(HOME_ROLE_BADGE_KEY);
  if(savedRole === 'farmer' || savedRole === 'buyer') {
    setHomeRoleBadge(savedRole);
  }
}

function clearSavedHomeRoleBadge() {
  localStorage.removeItem(HOME_ROLE_BADGE_KEY);
}

function getCurrentAppRole() {
  if(currentRole === 'buyer' || currentRole === 'farmer') return currentRole;
  const badgeRole = localStorage.getItem(HOME_ROLE_BADGE_KEY);
  if(badgeRole === 'buyer' || badgeRole === 'farmer') return badgeRole;
  return 'buyer';
}

function escapeHtml(value) {
  return (value || '').replace(/[&<>"']/g, function(char) {
    return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[char];
  });
}

function googleLoginSuccess(role) {
  currentRole = role;
  saveAuthState();
  saveHomeRoleBadge(role);
  setHomeRoleBadge(role);
  if(role === 'farmer') {
    window.location.href = 'techsetu_farmer_dashboard.html';
    return;
  }
  window.location.href = 'customer-home.html';
}

function switchLoginTab(tab, role) {
  snapshotAuthInputs();
  currentLoginTab = tab;
  saveAuthState();
  renderLoginScreen(role);
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validatePasswordStrength(password) {
  return /[a-z]/.test(password) && /[A-Z]/.test(password) && /[0-9]/.test(password) && password.length >= 8;
}

// ─── API HELPERS (JWT-based) ───
function getToken() {
  return localStorage.getItem('token') || null;
}

function setToken(token) {
  if(token) localStorage.setItem('token', token);
}

function clearToken() {
  localStorage.removeItem('token');
}

function authHeaders() {
  const token = getToken();
  const headers = {'Content-Type': 'application/json'};
  if(token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

function parseApiError(payload, fallback = 'Request failed') {
  const detail = payload?.detail;
  if(Array.isArray(detail) && detail.length) {
    const first = detail[0] || {};
    const loc = Array.isArray(first.loc) ? first.loc.join('.') : '';
    const msg = first.msg || fallback;
    const field = Array.isArray(first.loc) ? first.loc[first.loc.length - 1] : null;
    const code = field ? `VALIDATION_${String(field).toUpperCase()}` : 'VALIDATION_ERROR';
    return {
      code,
      message: loc ? `${msg} (${loc})` : msg,
    };
  }
  if(detail && typeof detail === 'object') {
    return {
      code: detail.error_code || payload?.error_code || null,
      message: detail.detail || fallback,
    };
  }
  return {
    code: payload?.error_code || null,
    message: typeof detail === 'string' ? detail : fallback,
  };
}

async function apiPost(path, data) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(data)
  });
  const payload = await res.json().catch(()=>({detail:'Something went wrong'}));
  if(!res.ok) {
    const err = new Error('Request failed');
    const parsed = parseApiError(payload, 'Request failed');
    err.code = parsed.code;
    err.message = parsed.message;
    err.payload = payload;
    err.status = res.status;
    throw err;
  }
  return payload;
}

async function apiPatch(path, data) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(data)
  });
  const payload = await res.json().catch(()=>({detail:'Something went wrong'}));
  if(!res.ok) {
    const err = new Error('Request failed');
    const parsed = parseApiError(payload, 'Request failed');
    err.code = parsed.code;
    err.message = parsed.message;
    err.payload = payload;
    err.status = res.status;
    throw err;
  }
  return payload;
}

async function apiGet(path) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'GET',
    headers: authHeaders(),
  });
  const payload = await res.json().catch(()=>({detail:'Something went wrong'}));
  if(!res.ok) {
    const err = new Error('Request failed');
    const parsed = parseApiError(payload, 'Request failed');
    err.code = parsed.code;
    err.message = parsed.message;
    err.payload = payload;
    err.status = res.status;
    throw err;
  }
  return payload;
}

function cleanOAuthUrl() {
  if(window.history && window.history.replaceState) {
    window.history.replaceState({}, document.title, window.location.pathname);
  }
}

function setSimpleStatus(id, type, message) {
  const el = document.getElementById(id);
  if(!el) return;
  el.className = `simple-inline-status ${type || ''}`.trim();
  el.textContent = message || '';
}

function getOtpButtonCooldownSeconds(buttonId) {
  const state = otpButtonCooldowns[buttonId];
  if(!state || !state.until) return 0;
  const remainingMs = state.until - Date.now();
  if(remainingMs <= 0) return 0;
  return Math.ceil(remainingMs / 1000);
}

function renderOtpButtonCooldown(buttonId) {
  const btn = document.getElementById(buttonId);
  if(!btn) return;
  const defaultLabel = btn.dataset.defaultLabel || 'Send OTP';
  const seconds = getOtpButtonCooldownSeconds(buttonId);
  if(seconds > 0) {
    btn.disabled = true;
    btn.textContent = `Resend in ${seconds}s`;
    return;
  }
  btn.disabled = false;
  btn.textContent = defaultLabel;
}

function startOtpButtonCooldown(buttonId, seconds) {
  if(!buttonId || !seconds || seconds <= 0) return;
  const existing = otpButtonCooldowns[buttonId];
  if(existing?.timerId) clearInterval(existing.timerId);

  otpButtonCooldowns[buttonId] = {
    until: Date.now() + (seconds * 1000),
    timerId: null,
  };

  renderOtpButtonCooldown(buttonId);

  const timerId = setInterval(() => {
    renderOtpButtonCooldown(buttonId);
    if(getOtpButtonCooldownSeconds(buttonId) <= 0) {
      clearInterval(timerId);
      delete otpButtonCooldowns[buttonId];
      renderOtpButtonCooldown(buttonId);
    }
  }, 1000);

  otpButtonCooldowns[buttonId].timerId = timerId;
}

function refreshOtpButtonCooldown(buttonId) {
  renderOtpButtonCooldown(buttonId);
  const seconds = getOtpButtonCooldownSeconds(buttonId);
  if(seconds > 0) {
    startOtpButtonCooldown(buttonId, seconds);
  }
}

async function sendPhoneOtp(phone, statusId, buttonId) {
  setSimpleStatus(statusId, '', '');
  try {
    const res = await apiPost('/auth/send-phone-otp', {phone});
    const hint = res?.dev_mode ? ' (dev mode: use 666666)' : '';
    setSimpleStatus(statusId, 'success', `OTP sent${hint}`);
    startOtpButtonCooldown(buttonId, OTP_BUTTON_DEFAULT_COOLDOWN_SECONDS);
    return true;
  } catch (err) {
    if(err.code === 'INVALID_PHONE') {
      setSimpleStatus(statusId, 'error', 'Enter a valid phone number with country code.');
      return false;
    }
    if(err.code === 'OTP_SEND_FAILED') {
      setSimpleStatus(statusId, 'error', 'Could not send OTP. Please try again.');
      return false;
    }
    if(err.code === 'OTP_SEND_RATE_LIMIT') {
      const retryAfter = err?.payload?.detail?.retry_after_seconds;
      const waitSeconds = retryAfter || OTP_BUTTON_DEFAULT_COOLDOWN_SECONDS;
      setSimpleStatus(statusId, 'error', `Please wait ${waitSeconds}s before requesting another OTP.`);
      startOtpButtonCooldown(buttonId, waitSeconds);
      return false;
    }
    setSimpleStatus(statusId, 'error', err.message || 'Could not send OTP.');
    return false;
  }
}

async function sendSignupOtp() {
  const phone = document.getElementById('auth-phone')?.value.trim() || '';
  if(!phone) {
    setSimpleStatus('signup-otp-status', 'error', 'Enter phone number first.');
    return;
  }
  await sendPhoneOtp(phone, 'signup-otp-status', 'signup-send-otp-btn');
}

function renderGooglePhoneVerifyScreen(role, profile = {}) {
  pendingGoogleRole = role || 'buyer';
  currentRole = pendingGoogleRole;
  saveAuthState();

  const isBuyer = pendingGoogleRole === 'buyer';
  const left = document.getElementById('google-phone-left');
  if(!left) return;
  left.className = `login-left ${isBuyer ? 'buyer-theme' : 'farmer-theme'} google-phone-left`;

  const first = escapeHtml(profile.first_name || '');
  const last = escapeHtml(profile.last_name || '');
  const phone = escapeHtml(profile.phone || '');
  const state = escapeHtml(profile.state || '');
  const crop = escapeHtml(profile.primary_crop || '');
  const org = escapeHtml(profile.organisation || '');

  left.innerHTML = `
    <button class="login-back" onclick="showRoleSelect()">← Back</button>
    <span class="login-role-badge">${isBuyer ? '🛒 CUSTOMER' : '🌾 FARMER'}</span>
    <div class="login-title">Complete signup</div>
    <div class="login-sub">Phone verification is required, including Google signup.</div>
    <div class="lf-row">
      <div class="lf"><label>First Name</label><input id="gpv-first-name" value="${first}" placeholder="Ramesh"/></div>
      <div class="lf"><label>Last Name</label><input id="gpv-last-name" value="${last}" placeholder="Patil"/></div>
    </div>
    ${isBuyer
      ? `<div class="lf"><label>Organisation / Business Name</label><input id="gpv-organisation" value="${org}" placeholder="e.g. Sharma Traders"/></div>`
      : `<div class="lf"><label>State / Region</label><input id="gpv-state" value="${state}" placeholder="e.g. Maharashtra"/></div>
         <div class="lf"><label>Primary Crop</label><input id="gpv-primary-crop" value="${crop}" placeholder="e.g. Tomatoes"/></div>`}
    <div class="lf"><label>Mobile Number</label><input id="gpv-phone" value="${phone}" type="tel" placeholder="+91 98765 43210"/></div>
    <div class="lf" style="display:flex;gap:8px;align-items:flex-end">
      <div style="flex:1"><label>OTP</label><input id="gpv-otp" type="text" inputmode="numeric" maxlength="6" placeholder="Enter 6-digit OTP"/></div>
      <button type="button" class="otp-action-btn" id="gpv-send-otp-btn" data-default-label="Send OTP" onclick="sendGooglePhoneOtp()">Send OTP</button>
    </div>
    <div class="simple-inline-status" id="gpv-otp-status"></div>
    <button class="login-btn" onclick="submitGooglePhoneVerification()">Verify & Continue →</button>
    <div class="simple-inline-status" id="gpv-submit-status"></div>
  `;

  refreshOtpButtonCooldown('gpv-send-otp-btn');
}

async function sendGooglePhoneOtp() {
  const phone = document.getElementById('gpv-phone')?.value.trim() || '';
  if(!phone) {
    setSimpleStatus('gpv-otp-status', 'error', 'Enter phone number first.');
    return;
  }
  await sendPhoneOtp(phone, 'gpv-otp-status', 'gpv-send-otp-btn');
}

async function submitGooglePhoneVerification() {
  const role = pendingGoogleRole || currentRole || 'buyer';
  const firstName = document.getElementById('gpv-first-name')?.value.trim() || '';
  const lastName = document.getElementById('gpv-last-name')?.value.trim() || '';
  const phone = document.getElementById('gpv-phone')?.value.trim() || '';
  const otp = document.getElementById('gpv-otp')?.value.trim() || '';
  const state = document.getElementById('gpv-state')?.value.trim() || '';
  const primaryCrop = document.getElementById('gpv-primary-crop')?.value.trim() || '';
  const organisation = document.getElementById('gpv-organisation')?.value.trim() || '';

  setSimpleStatus('gpv-submit-status', '', '');
  if(firstName.length < 2 || !lastName) {
    setSimpleStatus('gpv-submit-status', 'error', 'Please enter valid first and last name.');
    return;
  }
  if(!phone || !otp) {
    setSimpleStatus('gpv-submit-status', 'error', 'Please enter phone and OTP.');
    return;
  }
  if(role === 'farmer' && (!state || !primaryCrop)) {
    setSimpleStatus('gpv-submit-status', 'error', 'State and primary crop are required for farmers.');
    return;
  }
  if(role === 'buyer' && !organisation) {
    setSimpleStatus('gpv-submit-status', 'error', 'Organisation is required for customers.');
    return;
  }

  try {
    const payload = {
      role,
      first_name: firstName,
      last_name: lastName,
      phone,
      otp,
      state,
      primary_crop: primaryCrop,
      organisation,
    };
    await apiPost('/auth/google/complete-signup', payload);
    setSimpleStatus('gpv-submit-status', 'success', 'Signup completed successfully.');
    toast('✅ Google signup completed');
    localStorage.removeItem(AUTH_DRAFTS_KEY);
    googleLoginSuccess(role);
  } catch (err) {
    if(err.code === 'INVALID_OTP') {
      setSimpleStatus('gpv-submit-status', 'error', 'Invalid OTP. Please try again.');
      return;
    }
    if(err.code === 'PHONE_NOT_VERIFIED') {
      setSimpleStatus('gpv-submit-status', 'error', err.message || 'Phone verification is required.');
      return;
    }
    if(err.code === 'MISSING_FARMER_FIELDS' || err.code === 'MISSING_BUYER_ORGANISATION') {
      setSimpleStatus('gpv-submit-status', 'error', err.message || 'Please complete required fields.');
      return;
    }
    if(err.code === 'GOOGLE_SIGNUP_PROFILE_WRITE_FAILED') {
      setSimpleStatus('gpv-submit-status', 'error', 'Could not complete signup profile. Please retry.');
      return;
    }
    setSimpleStatus('gpv-submit-status', 'error', err.message || 'Could not complete signup.');
  }
}

async function ensureGooglePhoneVerified(role) {
  try {
    const profileRes = await apiGet('/auth/profile');
    const profile = profileRes?.profile || {};
    const resolvedRole = profile.role || role || 'buyer';
    if(profile.phone && String(profile.phone).trim()) {
      googleLoginSuccess(resolvedRole);
      return;
    }
    renderGooglePhoneVerifyScreen(resolvedRole, profile);
    showScreen('screen-google-phone-verify');
  } catch (err) {
    if(err.code === 'PROFILE_NOT_FOUND') {
      renderGooglePhoneVerifyScreen(role || 'buyer', {});
      showScreen('screen-google-phone-verify');
      return;
    }
    // Only clear the token for definitive auth failures (401/403).
    // For transient errors (network down, 5xx), preserve the token and show a retry message.
    const status = err?.payload?.status || err?.status;
    if(status === 401 || status === 403) {
      clearToken();
      toast('⚠️ Session invalid. Please log in again.');
      showRoleSelect();
    } else {
      toast('⚠️ Could not verify account status. Please try again.');
      showRoleSelect();
    }
  }
}

function setRecoveryStatus(type, message) {
  const el = document.getElementById('recovery-inline-status');
  if(!el) return;
  el.className = `recovery-inline-status ${type || ''}`.trim();
  el.textContent = message || '';
}

function showRecoveryResetScreen(role) {
  currentRole = role || currentRole || 'buyer';
  saveAuthState();
  showScreen('screen-recovery-reset');
  setRecoveryStatus('', '');
}

async function submitRecoveryPasswordReset() {
  const newPassword = document.getElementById('recovery-new-password')?.value || '';
  const confirmPassword = document.getElementById('recovery-confirm-password')?.value || '';

  setRecoveryStatus('', '');
  if(!validatePasswordStrength(newPassword)) {
    setRecoveryStatus('error', 'Use 8+ chars with upper, lower, and number.');
    return;
  }
  if(newPassword !== confirmPassword) {
    setRecoveryStatus('error', 'Passwords do not match.');
    return;
  }

  try {
    await apiPost('/auth/change-password', {new_password: newPassword});
    setRecoveryStatus('success', 'Password updated. Please log in with your new password.');
    toast('✅ Password reset successful');
    clearToken();
    setTimeout(() => {
      currentLoginTab = 'login';
      saveAuthState();
      showScreen('screen-login');
      renderLoginScreen(currentRole || 'buyer');
      setLoginStatus('success', 'Password updated. Please log in with your new password.');
    }, 900);
  } catch (err) {
    if(err.code === 'PASSWORD_CHANGE_UNAVAILABLE') {
      setRecoveryStatus('error', 'Password reset is not configured on server yet.');
      return;
    }
    if(err.code === 'PASSWORD_CHANGE_FAILED') {
      setRecoveryStatus('error', 'Reset link may be expired. Please request a new one.');
      return;
    }
    setRecoveryStatus('error', err.message || 'Could not update password.');
  }
}

async function handleGoogleAuth(role) {
  currentRole = role;
  saveAuthState();
  try {
    const startRes = await apiPost('/auth/google/start', {role});
    if(!startRes.url) {
      throw new Error('Unable to start Google login');
    }
    window.location.href = startRes.url;
  } catch (err) {
    if(err.code === 'OAUTH_START_FAILED' || err.code === 'OAUTH_URL_MISSING') {
      toast('⚠️ Google login setup issue. Please try again in a moment.');
      return;
    }
    toast(`⚠️ ${err.message}`);
  }
}

async function handleOAuthRedirect() {
  const queryParams = new URLSearchParams(window.location.search);
  const hashText = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : '';
  const hashParams = new URLSearchParams(hashText);
  const role = queryParams.get('oauth_role') || currentRole || 'buyer';
  const flowType = hashParams.get('type') || queryParams.get('type') || '';

  const oauthError = hashParams.get('error_description') || hashParams.get('error') || queryParams.get('error_description') || queryParams.get('error');
  if(oauthError) {
    cleanOAuthUrl();
    toast(`⚠️ Google login failed: ${oauthError}`);
    showRoleSelect();
    return true;
  }

  const oauthCode = queryParams.get('code');
  if(oauthCode) {
    try {
      const redirectTo = `${window.location.origin}${window.location.pathname}?oauth_role=${encodeURIComponent(role)}`;
      const exchangeRes = await apiPost('/auth/google/exchange', {
        auth_code: oauthCode,
        redirect_to: redirectTo,
      });
      if(!exchangeRes.access_token) {
        throw new Error('Google code exchange failed');
      }
      setToken(exchangeRes.access_token);
      cleanOAuthUrl();
      await apiGet('/auth/me');
      toast('✅ Logged in with Google');
      localStorage.removeItem(AUTH_DRAFTS_KEY);
      const resolvedRole = (exchangeRes.user && exchangeRes.user.role) ? exchangeRes.user.role : role;
      await ensureGooglePhoneVerified(resolvedRole);
    } catch (err) {
      clearToken();
      cleanOAuthUrl();
      if(err.code === 'OAUTH_EXCHANGE_FAILED' || err.code === 'OAUTH_TOKEN_MISSING') {
        toast('⚠️ Google login session expired. Please try again.');
        showRoleSelect();
        return true;
      }
      toast('⚠️ Google login could not be completed. Please try again.');
      showRoleSelect();
    }
    return true;
  }

  const token = hashParams.get('access_token') || queryParams.get('access_token');
  if(!token) return false;

  setToken(token);
  cleanOAuthUrl();

  if(flowType === 'recovery') {
    try {
      await apiGet('/auth/me');
      showRecoveryResetScreen(role);
    } catch (_) {
      clearToken();
      toast('⚠️ Password reset link is invalid or expired.');
      showRoleSelect();
    }
    return true;
  }

  try {
    await apiGet('/auth/me');
    toast('✅ Logged in with Google');
    localStorage.removeItem(AUTH_DRAFTS_KEY);
    await ensureGooglePhoneVerified(role);
  } catch (_) {
    clearToken();
    toast('⚠️ Google login could not be verified. Please try again.');
    showRoleSelect();
  }
  return true;
}

async function handleAuthSubmit(role, isSignup) {
  try {
    const email = document.getElementById('auth-email')?.value.trim() || '';
    const password = document.getElementById('auth-password')?.value || '';
    if(!isValidEmail(email)) {
      toast('Please enter a valid email address');
      return;
    }
    if(!validatePasswordStrength(password)) {
      toast('Password must have 8+ chars, upper, lower, number');
      return;
    }

    if(isSignup) {
      const firstName = document.getElementById('auth-first-name')?.value.trim() || '';
      const lastName = document.getElementById('auth-last-name')?.value.trim() || '';
      const confirmPassword = document.getElementById('auth-confirm-password')?.value || '';
      const phone = document.getElementById('auth-phone')?.value.trim() || '';
      const otp = document.getElementById('auth-otp')?.value.trim() || '';

      if(firstName.length < 2 || !lastName) {
        toast('Please enter valid first and last name');
        return;
      }
      // ── 2. Password confirmation check ──
      if(password !== confirmPassword) {
        toast('⚠️ Passwords do not match');
        return;
      }
      if(!phone) {
        toast('Please enter your mobile number');
        return;
      }
      if(!otp) {
        toast('Please enter the OTP sent to your phone');
        return;
      }

      const body = {
        role,
        first_name: firstName,
        last_name: lastName,
        email,
        password,
        phone,
        otp,
      };
      if(role === 'farmer') {
        body.state = document.getElementById('auth-state')?.value || '';
        body.primary_crop = document.getElementById('auth-primary-crop')?.value.trim() || '';
      } else {
        body.organisation = document.getElementById('auth-organisation')?.value.trim() || '';
      }

      // ── 4. Store JWT from signup response ──
      const signupRes = await apiPost('/auth/signup', body);
      if(signupRes.access_token) {
        setToken(signupRes.access_token);
      } else {
        // If signup returns no session (e.g. provider config), sign in immediately.
        const loginRes = await apiPost('/auth/login', {email, password, expected_role: role});
        if(loginRes.access_token) setToken(loginRes.access_token);
      }
      toast('✅ Signup successful');
      localStorage.removeItem(AUTH_DRAFTS_KEY);
      loginSuccess(role);
      return;
    }

    // ── 4. Store JWT from login response ──
    const loginRes = await apiPost('/auth/login', {email, password, expected_role: role});
    if(loginRes.access_token) setToken(loginRes.access_token);
    toast('✅ Login successful');
    localStorage.removeItem(AUTH_DRAFTS_KEY);
    loginSuccess((loginRes.user && loginRes.user.role) ? loginRes.user.role : role);
  } catch (err) {
    if(err.code === 'MISSING_FARMER_FIELDS') {
      toast('⚠️ Please select state and primary crop for farmer signup.');
      return;
    }
    if(err.code === 'MISSING_BUYER_ORGANISATION') {
      toast('⚠️ Organisation is required for customer signup.');
      return;
    }
    if(err.code === 'EMAIL_ALREADY_REGISTERED') {
      toast('⚠️ Email already registered. Please log in instead.');
      return;
    }
    if(err.code === 'ROLE_MISMATCH') {
      const actualRole = err?.payload?.detail?.actual_role;
      toast(`⚠️ This email is registered as ${actualRole || 'another role'}. Please use the correct login.`);
      return;
    }
    if(err.code === 'INVALID_OTP') {
      toast('⚠️ Invalid OTP. Please try again.');
      return;
    }
    if(err.code === 'VALIDATION_OTP') {
      toast('⚠️ OTP is required. Please enter the OTP sent to your phone.');
      return;
    }
    if(err.code === 'INVALID_PHONE') {
      toast('⚠️ Please enter a valid phone number.');
      return;
    }
    if(err.code === 'PHONE_NOT_VERIFIED') {
      toast('⚠️ Verify your phone number before creating account.');
      return;
    }
    if(err.code === 'INVALID_CREDENTIALS') {
      toast('⚠️ Invalid email or password.');
      return;
    }
    if(err.code === 'EMAIL_NOT_CONFIRMED') {
      toast('⚠️ Email not confirmed. Please verify your email first.');
      return;
    }
    if(err.code === 'SIGNUP_PROFILE_WRITE_FAILED') {
      toast('⚠️ Account created but profile setup failed. Please retry.');
      return;
    }
    toast(`⚠️ ${err.message}`);
  }
}

async function ensureCheckoutAuth() {
  const token = getToken();
  if(!token) {
    toast('Please login to continue payment');
    showRoleSelect();
    return false;
  }
  try {
    await apiGet('/auth/me');
    return true;
  } catch (_) {
    clearToken();
    toast('Session expired. Please login again.');
    showRoleSelect();
    return false;
  }
}

function profileField(label, id, value, placeholder, type = 'text') {
  return `<div class="profile-field"><label>${label}</label><input id="${id}" type="${type}" value="${escapeHtml(value)}" placeholder="${placeholder}"/><div class="field-error" id="${id}-error"></div></div>`;
}

function clearFieldError(fieldId) {
  const errorEl = document.getElementById(`${fieldId}-error`);
  const inputEl = document.getElementById(fieldId);
  if(errorEl) errorEl.textContent = '';
  if(inputEl) inputEl.classList.remove('has-error');
}

function setFieldError(fieldId, message) {
  const errorEl = document.getElementById(`${fieldId}-error`);
  const inputEl = document.getElementById(fieldId);
  if(errorEl) errorEl.textContent = message;
  if(inputEl) inputEl.classList.add('has-error');
}

function clearProfileFieldErrors() {
  [
    'profile-first-name','profile-last-name','profile-phone','profile-state',
    'profile-primary-crop','profile-organisation','profile-phone-otp','profile-current-password',
    'profile-new-password','profile-confirm-password'
  ].forEach(clearFieldError);
}

function isProfilePhoneChanged() {
  const phoneInput = document.getElementById('profile-phone');
  if(!phoneInput) return false;
  const currentPhone = (phoneInput.value || '').trim();
  const originalPhone = (phoneInput.dataset.originalPhone || '').trim();
  return currentPhone !== originalPhone;
}

function updateProfilePhoneOtpVisibility() {
  const wrapper = document.getElementById('profile-phone-otp-wrapper');
  const otpInput = document.getElementById('profile-phone-otp');
  const otpStatus = document.getElementById('profile-phone-otp-status');
  if(!wrapper) return;

  if(isProfilePhoneChanged()) {
    wrapper.style.display = 'grid';
    return;
  }

  wrapper.style.display = 'none';
  if(otpInput) otpInput.value = '';
  if(otpStatus) {
    otpStatus.className = 'simple-inline-status';
    otpStatus.textContent = '';
  }
  clearFieldError('profile-phone-otp');
}

function setInlineStatus(id, type, message) {
  const el = document.getElementById(id);
  if(!el) return;
  el.className = `inline-status ${type || ''}`.trim();
  el.textContent = message || '';
}

function setLoginStatus(type, message) {
  const el = document.getElementById('login-inline-status');
  if(!el) return;
  el.className = `login-inline-status ${type || ''}`.trim();
  el.textContent = message || '';
}

async function sendProfilePhoneOtp() {
  const phone = document.getElementById('profile-phone')?.value.trim() || '';
  if(!phone) {
    setSimpleStatus('profile-phone-otp-status', 'error', 'Enter new phone number first.');
    return;
  }
  await sendPhoneOtp(phone, 'profile-phone-otp-status', 'profile-send-otp-btn');
}

function getForgotCooldownSeconds() {
  const remainingMs = forgotPasswordCooldownUntil - Date.now();
  if(remainingMs <= 0) return 0;
  return Math.ceil(remainingMs / 1000);
}

function stopForgotCooldownTicker() {
  if(forgotPasswordTimer) {
    clearInterval(forgotPasswordTimer);
    forgotPasswordTimer = null;
  }
}

function persistForgotCooldownUntil(timestampMs) {
  forgotPasswordCooldownUntil = timestampMs || 0;
  if(forgotPasswordCooldownUntil > Date.now()) {
    localStorage.setItem(FORGOT_PASSWORD_COOLDOWN_UNTIL_KEY, String(forgotPasswordCooldownUntil));
    return;
  }
  forgotPasswordCooldownUntil = 0;
  localStorage.removeItem(FORGOT_PASSWORD_COOLDOWN_UNTIL_KEY);
}

function restoreForgotCooldownUntil() {
  const raw = localStorage.getItem(FORGOT_PASSWORD_COOLDOWN_UNTIL_KEY);
  const parsed = raw ? parseInt(raw, 10) : 0;
  if(Number.isNaN(parsed) || parsed <= Date.now()) {
    persistForgotCooldownUntil(0);
    return;
  }
  persistForgotCooldownUntil(parsed);
}

function refreshForgotPasswordUi() {
  const forgotBtn = document.getElementById('login-forgot-btn');
  if(!forgotBtn) return;
  const seconds = getForgotCooldownSeconds();
  if(seconds > 0) {
    forgotBtn.disabled = true;
    forgotBtn.textContent = `Resend in ${seconds}s`;
    return;
  }
  forgotBtn.disabled = false;
  forgotBtn.textContent = 'Forgot password?';
}

function startForgotCooldownTicker() {
  stopForgotCooldownTicker();
  refreshForgotPasswordUi();
  forgotPasswordTimer = setInterval(() => {
    refreshForgotPasswordUi();
    if(getForgotCooldownSeconds() <= 0) {
      persistForgotCooldownUntil(0);
      stopForgotCooldownTicker();
    }
  }, 1000);
}

async function handleForgotPassword(role) {
  setLoginStatus('', '');
  const cooldownSeconds = getForgotCooldownSeconds();
  if(cooldownSeconds > 0) {
    setLoginStatus('error', `Please wait ${cooldownSeconds}s before requesting another reset email.`);
    refreshForgotPasswordUi();
    return;
  }
  const email = document.getElementById('auth-email')?.value.trim() || '';
  if(!isValidEmail(email)) {
    setLoginStatus('error', 'Enter a valid email first.');
    return;
  }
  try {
    await apiPost('/auth/forgot-password', {email, role});
    persistForgotCooldownUntil(Date.now() + FORGOT_PASSWORD_COOLDOWN_MS);
    startForgotCooldownTicker();
    // Generic message regardless of whether the email exists — prevents user enumeration.
    setLoginStatus('success', 'If this email is registered, a reset link has been sent.');
    toast('✅ Password reset email sent');
  } catch (err) {
    if(err.code === 'PASSWORD_RESET_UNAVAILABLE') {
      setLoginStatus('error', 'Password reset is not configured on server yet.');
      return;
    }
    if(err.code === 'PASSWORD_RESET_CHECK_FAILED') {
      setLoginStatus('error', 'Could not verify this email right now. Please try again.');
      return;
    }
    if(err.code === 'PASSWORD_RESET_EMAIL_FAILED') {
      setLoginStatus('error', 'Could not send reset email. Please retry.');
      return;
    }
    setLoginStatus('error', err.message || 'Unable to send reset email.');
  }
}

function renderProfile(profile) {
  const role = profile?.role || getCurrentAppRole();
  currentRole = role;
  saveAuthState();
  saveHomeRoleBadge(role);
  setHomeRoleBadge(role);

  const body = document.getElementById('profile-body');
  if(!body) return;

  const roleLabel = role === 'farmer' ? 'Farmer' : 'Customer';
  const roleIcon = role === 'farmer' ? '🌾' : '🛒';
  const roleSpecificFields = role === 'farmer'
    ? `${profileField('State / Region', 'profile-state', profile?.state || '', 'e.g. Maharashtra')}
       ${profileField('Primary Crop', 'profile-primary-crop', profile?.primary_crop || '', 'e.g. Tomatoes')}`
    : `${profileField('Organisation / Business', 'profile-organisation', profile?.organisation || '', 'e.g. Sharma Traders')}`;

  body.innerHTML = `
    <div class="profile-role-card">
      <div class="profile-role-left">
        <span class="profile-role-icon">${roleIcon}</span>
        <div>
          <div class="profile-role-title">${roleLabel} Profile</div>
          <div class="profile-role-sub">Manage your account details and security settings.</div>
        </div>
      </div>
    </div>

    <div class="profile-card">
      <div class="profile-card-title">Basic Information</div>
      <div class="profile-grid">
        ${profileField('First Name', 'profile-first-name', profile?.first_name || '', 'First name')}
        ${profileField('Last Name', 'profile-last-name', profile?.last_name || '', 'Last name')}
      </div>
      <div class="profile-grid">
        ${profileField('Phone Number', 'profile-phone', profile?.phone || '', '+91 98765 43210', 'tel')}
        ${profileField('Email', 'profile-email', profile?.email || '', '', 'email')}
      </div>
      <div class="profile-grid profile-grid-single">
        <div class="profile-phone-otp-row" id="profile-phone-otp-wrapper" style="display:none">
          ${profileField('OTP For New Phone (only if changing number)', 'profile-phone-otp', '', 'Enter OTP received on new number')}
          <button type="button" class="otp-action-btn profile-otp-btn" id="profile-send-otp-btn" data-default-label="Send OTP" onclick="sendProfilePhoneOtp()">Send OTP</button>
        </div>
        <div class="simple-inline-status" id="profile-phone-otp-status"></div>
      </div>
      <div class="profile-grid profile-grid-single">
        ${roleSpecificFields}
      </div>
      <button class="profile-btn primary" onclick="saveProfile()">Save Profile</button>
      <div class="inline-status" id="profile-save-status"></div>
    </div>

    <div class="profile-card">
      <div class="profile-card-title">Password Reset</div>
      <div class="profile-grid">
        ${profileField('Current Password', 'profile-current-password', '', 'Current password', 'password')}
        ${profileField('New Password', 'profile-new-password', '', 'Min 8 chars, upper/lower/number', 'password')}
      </div>
      <div class="profile-grid profile-grid-single">
        ${profileField('Confirm New Password', 'profile-confirm-password', '', 'Confirm new password', 'password')}
      </div>
      <button class="profile-btn secondary" onclick="changePassword()">Update Password</button>
      <div class="inline-status" id="profile-password-status"></div>
    </div>

    <div class="profile-card profile-danger-card">
      <div class="profile-card-title">Session</div>
      <p class="profile-danger-text">Logging out clears your current session on this device.</p>
      <button class="profile-btn danger" onclick="logoutUser()">Logout</button>
    </div>
  `;

  const emailInput = document.getElementById('profile-email');
  if(emailInput) emailInput.disabled = true;
  const phoneInput = document.getElementById('profile-phone');
  if(phoneInput) {
    phoneInput.dataset.originalPhone = (profile?.phone || '').trim();
    phoneInput.addEventListener('input', updateProfilePhoneOtpVisibility);
  }
  updateProfilePhoneOtpVisibility();
  refreshOtpButtonCooldown('profile-send-otp-btn');
}

async function openProfile() {
  const active = localStorage.getItem(SCREEN_STORAGE_KEY);
  const fallback = getCurrentAppRole() === 'farmer' ? 'screen-farmer' : 'screen-home';
  const prevScreen = (active && active !== 'screen-profile') ? active : fallback;
  localStorage.setItem(PROFILE_PREV_SCREEN_KEY, prevScreen);
  showScreen('screen-profile');
  const body = document.getElementById('profile-body');
  if(body) body.innerHTML = '<div class="profile-loading">Loading profile...</div>';
  try {
    const data = await apiGet('/auth/profile');
    renderProfile(data.profile || {});
  } catch (err) {
    if(err.code === 'PROFILE_NOT_FOUND') {
      toast('⚠️ Profile not found for this account.');
    } else if(err.code === 'PROFILE_FETCH_FAILED') {
      toast('⚠️ Unable to load profile right now.');
    } else {
      toast(`⚠️ ${err.message}`);
    }
    closeProfile();
  }
}

function closeProfile() {
  const prev = localStorage.getItem(PROFILE_PREV_SCREEN_KEY);
  if(prev && document.getElementById(prev)) {
    showScreen(prev);
    return;
  }
  if(getCurrentAppRole() === 'farmer') {
    showScreen('screen-farmer');
  } else {
    showScreen('screen-home');
  }
}

async function saveProfile() {
  const role = getCurrentAppRole();
  clearProfileFieldErrors();
  setInlineStatus('profile-save-status', '', '');
  const payload = {
    first_name: document.getElementById('profile-first-name')?.value.trim() || '',
    last_name: document.getElementById('profile-last-name')?.value.trim() || '',
    phone: document.getElementById('profile-phone')?.value.trim() || '',
    phone_otp: document.getElementById('profile-phone-otp')?.value.trim() || '',
    state: document.getElementById('profile-state')?.value.trim() || '',
    primary_crop: document.getElementById('profile-primary-crop')?.value.trim() || '',
    organisation: document.getElementById('profile-organisation')?.value.trim() || '',
  };

  let hasError = false;
  if(payload.first_name.length < 2) {
    setFieldError('profile-first-name', 'First name must be at least 2 characters.');
    hasError = true;
  }
  if(!payload.last_name) {
    setFieldError('profile-last-name', 'Last name is required.');
    hasError = true;
  }
  if(!/^\+?[0-9\s-]{10,20}$/.test(payload.phone)) {
    setFieldError('profile-phone', 'Enter a valid phone number.');
    hasError = true;
  }
  if(isProfilePhoneChanged() && !payload.phone_otp) {
    setFieldError('profile-phone-otp', 'Enter OTP for the new number.');
    hasError = true;
  }
  if(role === 'farmer' && !payload.state) {
    setFieldError('profile-state', 'State is required for farmers.');
    hasError = true;
  }
  if(role === 'farmer' && !payload.primary_crop) {
    setFieldError('profile-primary-crop', 'Primary crop is required for farmers.');
    hasError = true;
  }
  if(role === 'buyer' && !payload.organisation) {
    setFieldError('profile-organisation', 'Organisation is required for customers.');
    hasError = true;
  }
  if(hasError) {
    setInlineStatus('profile-save-status', 'error', 'Please fix the highlighted fields.');
    return;
  }

  try {
    const data = await apiPatch('/auth/profile', payload);
    const preservedEmail = document.getElementById('profile-email')?.value || '';
    renderProfile({
      ...payload,
      ...(data.profile || {}),
      email: preservedEmail,
      role,
    });
    setInlineStatus('profile-save-status', 'success', 'Profile updated successfully.');
    toast('✅ Profile updated');
  } catch (err) {
    if(err.code === 'MISSING_FARMER_FIELDS') {
      setInlineStatus('profile-save-status', 'error', 'State and primary crop are required for farmers.');
      return;
    }
    if(err.code === 'MISSING_BUYER_ORGANISATION') {
      setInlineStatus('profile-save-status', 'error', 'Organisation is required for customers.');
      return;
    }
    if(err.code === 'PROFILE_UPDATE_FAILED') {
      setInlineStatus('profile-save-status', 'error', 'Could not update profile. Try again.');
      return;
    }
    if(err.code === 'PHONE_OTP_REQUIRED') {
      setFieldError('profile-phone-otp', 'Enter OTP for the new number.');
      setInlineStatus('profile-save-status', 'error', 'Please verify OTP for new phone number.');
      return;
    }
    if(err.code === 'INVALID_OTP') {
      setFieldError('profile-phone-otp', 'Invalid OTP for new number.');
      setInlineStatus('profile-save-status', 'error', 'Invalid OTP for new phone number.');
      return;
    }
    setInlineStatus('profile-save-status', 'error', err.message || 'Could not update profile.');
    toast(`⚠️ ${err.message}`);
  }
}

async function changePassword() {
  const role = getCurrentAppRole();
  clearProfileFieldErrors();
  setInlineStatus('profile-password-status', '', '');
  const currentPassword = document.getElementById('profile-current-password')?.value || '';
  const newPassword = document.getElementById('profile-new-password')?.value || '';
  const confirmPassword = document.getElementById('profile-confirm-password')?.value || '';
  const email = document.getElementById('profile-email')?.value || '';

  let hasError = false;
  if(!currentPassword) {
    setFieldError('profile-current-password', 'Current password is required.');
    hasError = true;
  }
  if(!validatePasswordStrength(newPassword)) {
    setFieldError('profile-new-password', 'Use 8+ chars with upper, lower, and number.');
    hasError = true;
  }
  if(newPassword !== confirmPassword) {
    setFieldError('profile-confirm-password', 'Passwords do not match.');
    hasError = true;
  }
  if(hasError) {
    setInlineStatus('profile-password-status', 'error', 'Please fix the highlighted password fields.');
    return;
  }

  try {
    await apiPost('/auth/change-password', {current_password: currentPassword, new_password: newPassword});
    document.getElementById('profile-current-password').value = '';
    document.getElementById('profile-new-password').value = '';
    document.getElementById('profile-confirm-password').value = '';
    setInlineStatus('profile-password-status', 'success', 'Password updated successfully.');
    toast('✅ Password updated successfully');
  } catch (err) {
    if(err.code === 'INVALID_CREDENTIALS') {
      setFieldError('profile-current-password', 'Current password is incorrect.');
      setInlineStatus('profile-password-status', 'error', 'Current password is incorrect.');
      return;
    }
    if(err.code === 'PASSWORD_CHANGE_UNAVAILABLE') {
      setInlineStatus('profile-password-status', 'error', 'Password reset is not configured on server yet.');
      return;
    }
    if(err.code === 'PASSWORD_CHANGE_FAILED') {
      setInlineStatus('profile-password-status', 'error', 'Could not update password. Please try again.');
      return;
    }
    setInlineStatus('profile-password-status', 'error', err.message || 'Could not update password.');
    toast(`⚠️ ${err.message}`);
  }
}

async function logoutUser() {
  try {
    await apiPost('/auth/logout', {});
  } catch (_) {
    // Ignore logout API failures and clear local session anyway.
  }
  clearToken();
  clearSavedHomeRoleBadge();
  localStorage.removeItem(SCREEN_STORAGE_KEY);
  localStorage.removeItem(PROFILE_PREV_SCREEN_KEY);
  localStorage.removeItem(AUTH_STATE_KEY);
  currentRole = null;
  currentLoginTab = 'login';
  toast('Logged out successfully');
  showRoleSelect();
}

function renderLoginScreen(role) {
  const isBuyer = role === 'buyer';
  const theme = isBuyer ? 'buyer-theme' : 'farmer-theme';
  const ll = document.getElementById('login-left');
  const lr = document.getElementById('login-right');
  ll.className = 'login-left ' + theme;
  lr.className = 'login-right ' + (isBuyer ? 'buyer-right' : 'farmer-right');

  const isSignup = currentLoginTab === 'signup';

  ll.innerHTML = `
    <button class="login-back" onclick="showScreen('screen-role-select')">← Back</button>
    <span class="login-role-badge">${isBuyer ? '🛒 CUSTOMER' : '🌾 FARMER'}</span>
    <div class="login-title">${isSignup ? 'Create account' : 'Welcome back'}</div>
    <div class="login-sub">${isSignup
      ? (isBuyer ? 'Start sourcing fresh produce directly from farmers.' : 'Start listing your crops and reach buyers directly.')
      : (isBuyer ? 'Sign in to browse produce and track your orders.' : 'Sign in to manage your listings and offers.')
    }</div>
    <div class="login-tabs">
      <button class="login-tab ${!isSignup?'active':''}" onclick="switchLoginTab('login','${role}')">Login</button>
      <button class="login-tab ${isSignup?'active':''}" onclick="switchLoginTab('signup','${role}')">Sign Up</button>
    </div>
    <div>
      ${isSignup ? `
        <div class="lf-row">
          <div class="lf"><label>First Name</label><input id="auth-first-name" value="${getDraftValue(role, currentLoginTab, 'auth-first-name')}" placeholder="Ramesh" /></div>
          <div class="lf"><label>Last Name</label><input id="auth-last-name" value="${getDraftValue(role, currentLoginTab, 'auth-last-name')}" placeholder="${isBuyer ? 'Gupta' : 'Patil'}" /></div>
        </div>
        ${!isBuyer ? `<div class="lf"><label>State / Region</label>
          <select id="auth-state">
            ${['Maharashtra','Punjab','Uttar Pradesh','Tamil Nadu','Rajasthan'].map(s=>`<option ${getDraftValue(role, currentLoginTab, 'auth-state')===s?'selected':''}>${s}</option>`).join('')}
          </select>
        </div>
        <div class="lf"><label>Primary Crop</label><input id="auth-primary-crop" value="${getDraftValue(role, currentLoginTab, 'auth-primary-crop')}" placeholder="e.g. Tomatoes, Wheat, Onions" /></div>` : `
        <div class="lf"><label>Organisation / Business Name</label><input id="auth-organisation" value="${getDraftValue(role, currentLoginTab, 'auth-organisation')}" placeholder="e.g. Sharma Traders" /></div>`}
        <div class="lf"><label>Mobile Number</label><input id="auth-phone" value="${getDraftValue(role, currentLoginTab, 'auth-phone')}" type="tel" placeholder="+91 98765 43210" /></div>
        <div class="lf" style="display:flex;gap:8px;align-items:flex-end">
          <div style="flex:1"><label>OTP</label><input id="auth-otp" type="text" inputmode="numeric" maxlength="6" placeholder="Enter 6-digit OTP" /></div>
          <button type="button" class="otp-action-btn" id="signup-send-otp-btn" data-default-label="Send OTP" onclick="sendSignupOtp()">Send OTP</button>
        </div>
        <div class="simple-inline-status" id="signup-otp-status"></div>
      ` : ''}
      <div class="lf"><label>Email Address</label><input id="auth-email" value="${getDraftValue(role, currentLoginTab, 'auth-email')}" type="email" placeholder="${isBuyer ? 'you@company.com' : 'ramesh@farm.com'}" /></div>
      <div class="lf"><label>Password</label><input id="auth-password" value="${getDraftValue(role, currentLoginTab, 'auth-password')}" type="password" placeholder="••••••••" /></div>
      ${!isSignup ? `<button type="button" class="login-forgot" id="login-forgot-btn" onclick="handleForgotPassword('${role}')">Forgot password?</button><div class="login-inline-status" id="login-inline-status"></div>` : ''}
      ${isSignup ? `<div class="lf"><label>Confirm Password</label><input id="auth-confirm-password" value="${getDraftValue(role, currentLoginTab, 'auth-confirm-password')}" type="password" placeholder="••••••••" /></div>` : ''}
      <button class="login-btn" onclick="handleAuthSubmit('${role}', ${isSignup ? 'true' : 'false'})">${isSignup ? 'Create Account →' : 'Sign In →'}</button>
      <div class="login-divider">or continue with</div>
      <button class="login-btn" style="background:${isBuyer?'var(--offwhite)':'rgba(255,255,255,.08)'};color:${isBuyer?'var(--text-dark)':'white'};border:1px solid ${isBuyer?'var(--card-border)':'rgba(255,255,255,.15)'}" onclick="handleGoogleAuth('${role}')">
        <span style="margin-right:6px">G</span> Continue with Google
      </button>
    </div>
    <div class="login-signup-link">${isSignup ? 'Already have an account?' : "Don't have an account?"}
      <span onclick="switchLoginTab('${isSignup?'login':'signup'}','${role}')">${isSignup ? 'Sign in' : 'Sign up free'}</span>
    </div>
  `;

  if(!isSignup) {
    refreshForgotPasswordUi();
    if(getForgotCooldownSeconds() > 0) {
      startForgotCooldownTicker();
    }
  } else {
    refreshOtpButtonCooldown('signup-send-otp-btn');
  }

  // Right side: vegetable image + stats
  const vegImg = isBuyer
    ? 'https://images.unsplash.com/photo-1540420773420-3366772f4999?w=600&q=80'
    : 'https://images.unsplash.com/photo-1500651230702-0e2d8a49d4ad?w=600&q=80';

  lr.innerHTML = `
    <div class="login-right-title">${isBuyer ? 'Source smarter,<br/>not harder.' : 'Your crops.<br/>Your price.<br/>Your profit.'}</div>
    <img src="${vegImg}" class="login-veg-img" alt="${isBuyer ? 'Fresh vegetables' : 'Farm fresh produce'}" onerror="this.style.display='none'"/>
    <div class="login-right-stats">
      ${isBuyer ? `
      <div class="lrs"><div class="lrs-icon">🌾</div><div><div class="lrs-val">2,400+</div><div class="lrs-lbl">Verified farmers</div></div></div>
      <div class="lrs"><div class="lrs-icon">📦</div><div><div class="lrs-val">15,000+</div><div class="lrs-lbl">Orders fulfilled</div></div></div>
      <div class="lrs"><div class="lrs-icon">💰</div><div><div class="lrs-val">22% avg.</div><div class="lrs-lbl">Cost savings vs. market</div></div></div>
      ` : `
      <div class="lrs"><div class="lrs-icon">📈</div><div><div class="lrs-val">18%</div><div class="lrs-lbl">Average income increase</div></div></div>
      <div class="lrs"><div class="lrs-icon">⚡</div><div><div class="lrs-val">48 hrs</div><div class="lrs-lbl">Avg. time to first offer</div></div></div>
      <div class="lrs"><div class="lrs-icon">🔒</div><div><div class="lrs-val">100%</div><div class="lrs-lbl">Secure direct payments</div></div></div>
      `}
    </div>
  `;

  saveAuthState();
}

// ─── BUYER TYPE ───
const buyerTypeNames = {personal:'Personal',retailer:'Retailer',wholesale:'Wholesaler'};
function selectBuyerType(type) {
  clearSavedHomeRoleBadge();
  currentBuyerType = type;
  document.getElementById('buyer-type-badge').textContent = buyerTypeNames[type];
  renderProducts();
  showScreen('screen-home');
}

// ─── PRODUCTS ───
const allProducts = [
  {id:1,name:'Tomatoes',emoji:'🍅',category:'Vegetables',price:20,mrp:25,origin:'Nashik, MH',farmer:'Ramesh Patil',rating:4.8,reviews:124,harvest:'2 days ago',desc:'Fresh, juicy tomatoes grown organically in Nashik. Perfect for cooking, salads, and gravies. No pesticides used.'},
  {id:2,name:'Potatoes',emoji:'🥔',category:'Vegetables',price:15,mrp:18,origin:'Agra, UP',farmer:'Suresh Kumar',rating:4.6,reviews:98,harvest:'3 days ago',desc:'Premium quality potatoes from Agra. Ideal for all cooking purposes. Smooth skin, firm texture, long shelf life.'},
  {id:3,name:'Onions',emoji:'🧅',category:'Vegetables',price:18,mrp:22,origin:'Lasalgaon, MH',farmer:'Vijay Shinde',rating:4.7,reviews:87,harvest:'1 day ago',desc:'Top-grade Lasalgaon onions — India\'s largest onion market. Pungent, fresh, and great for every Indian dish.'},
  {id:4,name:'Wheat',emoji:'🌾',category:'Grains',price:28,mrp:32,origin:'Amritsar, PB',farmer:'Gurpreet Singh',rating:4.9,reviews:156,harvest:'5 days ago',desc:'Premium Punjab wheat — golden, full-grained, and freshly harvested. Best for rotis, bread, and flour production.'},
  {id:5,name:'Spinach',emoji:'🥬',category:'Leafy',price:25,mrp:30,origin:'Pune, MH',farmer:'Anita Desai',rating:4.9,reviews:72,harvest:'Today',desc:'Ultra-fresh organic spinach from Pune. Rich in iron and vitamins. Harvested this morning, delivered to you today.'},
  {id:6,name:'Carrots',emoji:'🥕',category:'Vegetables',price:22,mrp:28,origin:'Ooty, TN',farmer:'Murugan Krishnan',rating:4.5,reviews:64,harvest:'2 days ago',desc:'Crisp, sweet Ooty carrots from the Nilgiris. Ideal for juicing, salads, and cooking. High beta-carotene content.'},
  {id:7,name:'Bananas',emoji:'🍌',category:'Fruits',price:40,mrp:50,origin:'Jalgaon, MH',farmer:'Prakash Bane',rating:4.7,reviews:112,harvest:'1 day ago',desc:'Robusta bananas from Jalgaon — India\'s banana capital. Naturally ripened, sweet, and nutritious.'},
  {id:8,name:'Mangoes',emoji:'🥭',category:'Fruits',price:120,mrp:160,origin:'Ratnagiri, MH',farmer:'Deepak Sawant',rating:4.9,reviews:203,harvest:'3 days ago',desc:'Authentic Alphonso mangoes from Ratnagiri. GI-tagged, buttery, sweet and aromatic. The king of mangoes.'},
  {id:9,name:'Green Chillies',emoji:'🌶️',category:'Spices',price:60,mrp:75,origin:'Guntur, AP',farmer:'Venkat Rao',rating:4.6,reviews:91,harvest:'2 days ago',desc:'Guntur green chillies — one of the spiciest in India. Fresh, vibrant, perfect for pickles and curries.'},
  {id:10,name:'Rice',emoji:'🍚',category:'Grains',price:45,mrp:55,origin:'Bastar, CG',farmer:'Hemant Nag',rating:4.8,reviews:134,harvest:'7 days ago',desc:'Organic Bastar rice — short-grain, fragrant, grown in tribal heartland. Zero pesticides, 100% natural.'},
  {id:11,name:'Cauliflower',emoji:'🥦',category:'Vegetables',price:35,mrp:45,origin:'Delhi NCR',farmer:'Mohan Lal',rating:4.4,reviews:56,harvest:'Today',desc:'Fresh white cauliflower, dense and crisp. Perfect for aloo-gobi, soups, and stir-fries.'},
  {id:12,name:'Coriander',emoji:'🌿',category:'Leafy',price:15,mrp:20,origin:'Indore, MP',farmer:'Kiran Joshi',rating:4.7,reviews:78,harvest:'Today',desc:'Aromatic fresh coriander leaves from Indore. Essential for Indian cooking — chutney, garnish, and more.'},
];

let cart = {};
let activeCat = 'All';
let searchQuery = '';

function setCat(cat, el) {
  activeCat = cat;
  document.querySelectorAll('.cat-chip').forEach(c=>c.classList.remove('active'));
  el.classList.add('active');
  renderProducts();
}

function filterProducts() {
  searchQuery = document.getElementById('search-input').value.toLowerCase();
  renderProducts();
}

function renderProducts() {
  const grid = document.getElementById('prod-grid');
  if(!grid) return;
  const filtered = allProducts.filter(p => {
    const matchCat = activeCat === 'All' || p.category === activeCat;
    const matchSearch = !searchQuery || p.name.toLowerCase().includes(searchQuery) || p.origin.toLowerCase().includes(searchQuery) || p.farmer.toLowerCase().includes(searchQuery);
    return matchCat && matchSearch;
  });
  grid.innerHTML = filtered.map(p=>`
    <div class="prod-tile" onclick="openProduct(${p.id})">
      <div class="prod-tile-emoji">${p.emoji}</div>
      <div class="prod-tile-body">
        <div class="prod-tile-name">${p.name}</div>
        <div class="prod-tile-origin">${p.origin} · 👨‍🌾 ${p.farmer}</div>
        <div class="prod-tile-bottom">
          <div>
            <div class="prod-tile-price">₹${p.price}/kg</div>
            <div class="prod-tile-rating">⭐${p.rating} (${p.reviews})</div>
          </div>
          <button class="add-btn" onclick="event.stopPropagation();addToCart(${p.id},1)">+</button>
        </div>
      </div>
    </div>
  `).join('');
}

// ─── PRODUCT DETAIL ───
let detailQty = 1;
function openProduct(id) {
  currentProduct = allProducts.find(p=>p.id===id);
  if(!currentProduct) return;
  detailQty = 1;
  const p = currentProduct;
  document.getElementById('prod-detail-title').textContent = p.name;
  const savings = p.mrp - p.price;
  const savePct = Math.round(savings/p.mrp*100);
  const stars = '★'.repeat(Math.floor(p.rating)) + (p.rating%1>0?'☆':'');
  document.getElementById('prod-detail-body').innerHTML = `
    <div class="prod-detail-img-wrap">
      <span style="font-size:80px">${p.emoji}</span>
      <div class="prod-detail-harvest">🌱 Harvested ${p.harvest}</div>
    </div>
    <div class="prod-detail-name">${p.name}</div>
    <div class="prod-detail-origin">📍 ${p.origin}</div>
    <div class="prod-detail-rating">
      <span class="stars">${stars}</span>
      <span class="rating-val">${p.rating}</span>
      <span class="rating-count">(${p.reviews} reviews)</span>
    </div>
    <div class="price-section">
      <div style="display:flex;align-items:baseline;flex-wrap:wrap;gap:4px">
        <span class="price-main">₹${p.price}</span>
        <span class="price-mrp">₹${p.mrp}</span>
        <span class="price-save">Save ₹${savings} (${savePct}% off)</span>
      </div>
      <div class="price-per">per kilogram · MRP comparison vs market rate</div>
    </div>
    <div class="farmer-card-mini">
      <div class="farmer-avatar">👨‍🌾</div>
      <div>
        <div class="farmer-name-text">${p.farmer}</div>
        <div class="farmer-location">📍 ${p.origin}</div>
        <div class="farmer-verified">✓ Verified Farmer on TechSetu</div>
      </div>
    </div>
    <div style="margin-bottom:16px">
      <div style="font-size:14px;font-weight:500;color:var(--navy);margin-bottom:8px">About this Produce</div>
      <div style="font-size:13px;color:var(--text-mid);line-height:1.7">${p.desc}</div>
    </div>
    <div class="qty-section">
      <div class="qty-label">Select Quantity</div>
      <div class="qty-controls">
        <button class="qty-btn" onclick="changeDetailQty(-1)">−</button>
        <input class="qty-input" id="qty-input-field" type="number" value="${detailQty}" min="1" onchange="setDetailQty(this.value)"/>
        <span class="qty-unit">kg</span>
        <button class="qty-btn" onclick="changeDetailQty(1)">+</button>
      </div>
      <div style="font-size:12px;color:var(--text-mid);margin-top:8px">Total: ₹<span id="qty-total">${p.price}</span></div>
    </div>
  `;
  showScreen('screen-product');
}

function changeDetailQty(delta) {
  detailQty = Math.max(1, detailQty + delta);
  document.getElementById('qty-input-field').value = detailQty;
  document.getElementById('qty-total').textContent = (currentProduct.price * detailQty);
}

function setDetailQty(val) {
  detailQty = Math.max(1, parseInt(val)||1);
  document.getElementById('qty-input-field').value = detailQty;
  document.getElementById('qty-total').textContent = (currentProduct.price * detailQty);
}

function addCurrentToCart() {
  if(!currentProduct) return;
  addToCart(currentProduct.id, detailQty);
  toast(`🛒 ${currentProduct.emoji} ${currentProduct.name} ×${detailQty} added to cart!`);
  showScreen('screen-home');
}

// ─── CART ───
function addToCart(id, qty) {
  const p = allProducts.find(x=>x.id===id);
  if(!p) return;
  if(cart[id]) {
    cart[id].qty += qty;
  } else {
    cart[id] = {product:p, qty};
  }
  updateCartCount();
  toast(`${p.emoji} ${p.name} added to cart!`);
}

function updateCartCount() {
  const count = Object.values(cart).reduce((a,v)=>a+v.qty,0);
  const badge = document.getElementById('cart-badge-count');
  const fCart = document.getElementById('floating-cart');
  const fCount = document.getElementById('floating-cart-count');
  if(count>0) {
    badge.style.display='flex';badge.textContent=count;
    fCart.classList.add('show');fCount.textContent=count;
  } else {
    badge.style.display='none';
    fCart.classList.remove('show');
  }
}

function renderCart() {
  const body = document.getElementById('cart-body');
  if(!body) return;
  const keys = Object.keys(cart);
  if(!keys.length) {
    body.innerHTML = `<div style="text-align:center;padding:60px 20px"><div style="font-size:60px;margin-bottom:16px">🛒</div><div style="font-size:18px;font-weight:500;color:var(--navy);margin-bottom:8px">Your cart is empty</div><div style="font-size:14px;color:var(--text-mid);margin-bottom:24px">Add some fresh produce to get started!</div><button style="padding:12px 28px;background:var(--navy);color:white;border:none;border-radius:50px;font-size:14px;cursor:pointer;font-family:'DM Sans',sans-serif" onclick="showScreen('screen-home')">Browse Products →</button></div>`;
    return;
  }
  let subtotal = 0;
  const items = keys.map(id => {
    const {product:p, qty} = cart[id];
    subtotal += p.price * qty;
    return `<div class="cart-item">
      <div class="cart-item-emoji">${p.emoji}</div>
      <div class="cart-item-info">
        <div class="cart-item-name">${p.name}</div>
        <div class="cart-item-price">₹${p.price}/kg · ${p.origin}</div>
      </div>
      <div class="cart-item-controls">
        <button class="cart-qty-btn" onclick="updateCartQty(${id},-1)">−</button>
        <span class="cart-qty-val">${qty}</span>
        <button class="cart-qty-btn" onclick="updateCartQty(${id},1)">+</button>
        <div style="min-width:54px;text-align:right;font-size:13px;font-weight:600;color:var(--navy)">₹${p.price*qty}</div>
      </div>
    </div>`;
  }).join('');

  const delivery = subtotal > 0 ? DELIVERY_FEE : 0;
  const packaging = subtotal > 0 ? PACKAGING_FEE : 0;
  const total = subtotal + delivery + packaging;

  body.innerHTML = `
    <div class="cart-items-list">${items}</div>
    <div class="cart-summary">
      <div class="cart-summary-title">Order Summary</div>
      <div class="cart-summary-row"><span>Subtotal (${Object.values(cart).reduce((a,v)=>a+v.qty,0)} items)</span><span>₹${subtotal}</span></div>
      <div class="cart-summary-row"><span>🚚 Delivery charges</span><span>₹${delivery}</span></div>
      <div class="cart-summary-row"><span>📦 Packaging</span><span>₹${packaging}</span></div>
      <div class="cart-summary-row total"><span>Total</span><span>₹${total}</span></div>
    </div>
    <button class="cart-checkout-btn" onclick="proceedToCheckout()">Proceed to Checkout →</button>
  `;
}

function updateCartQty(id, delta) {
  if(!cart[id]) return;
  cart[id].qty = Math.max(0, cart[id].qty + delta);
  if(cart[id].qty === 0) delete cart[id];
  updateCartCount();
  renderCart();
}

function proceedToCheckout() {
  const keys = Object.keys(cart);
  if(!keys.length) { toast('Your cart is empty!'); return; }
  showScreen('screen-address');
}

// Address selection
function selectAddr(el) {
  document.querySelectorAll('.addr-card').forEach(c=>{
    c.classList.remove('selected');
    c.querySelector('.addr-card-check').textContent='';
  });
  el.classList.add('selected');
  el.querySelector('.addr-card-check').textContent='✓';
}

// Render payment summary
function renderPaySummary() {
  const keys = Object.keys(cart);
  let subtotal = 0;
  keys.forEach(id => { const {product:p, qty} = cart[id]; subtotal += p.price * qty; });
  const delivery = DELIVERY_FEE, packaging = PACKAGING_FEE, total = subtotal + delivery + packaging;
  const el = document.getElementById('pay-order-summary');
  if(el) el.innerHTML = `
    <div class="pay-order-summary-title">Order Summary</div>
    ${keys.map(id=>{const {product:p,qty}=cart[id];return `<div class="pay-row"><span>${p.emoji} ${p.name} ×${qty}kg</span><span>₹${p.price*qty}</span></div>`}).join('')}
    <div class="pay-row"><span>Delivery</span><span>₹${delivery}</span></div>
    <div class="pay-row"><span>Packaging</span><span>₹${packaging}</span></div>
    <div class="pay-row total"><span>Total</span><span>₹${total}</span></div>
  `;
}

function completeOrderAfterPayment(razorpayOrderId) {
  cart = {};
  updateCartCount();
  const now = new Date();
  document.getElementById('order-date').textContent = now.toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'});
  const f = d => d.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'});
  document.getElementById('step1-time').textContent = f(new Date(now-15*60000));
  document.getElementById('step2-time').textContent = f(new Date(now-8*60000));
  document.getElementById('step3-time').textContent = f(new Date(now-3*60000));
  // Display the real Razorpay order ID (last 8 chars for brevity) so users can reference it in support.
  const displayId = razorpayOrderId ? razorpayOrderId.slice(-8).toUpperCase() : '—';
  document.getElementById('order-num').textContent = displayId;
  showScreen('screen-tracking');
  startCountdown(32*60);
}

function getCheckoutTotal() {
  const keys = Object.keys(cart);
  let subtotal = 0;
  keys.forEach(id => { const {product:p, qty} = cart[id]; subtotal += p.price * qty; });
  return subtotal + (keys.length ? ORDER_FEES_TOTAL : 0);
}

let _placeOrderInFlight = false;

async function placeOrder() {
  if(_placeOrderInFlight) return;
  const total = getCheckoutTotal();
  if(total <= 0) {
    toast('Your cart is empty!');
    return;
  }
  const isAuthed = await ensureCheckoutAuth();
  if(!isAuthed) return;
  if(typeof Razorpay === 'undefined') {
    toast('Razorpay SDK failed to load');
    return;
  }

  _placeOrderInFlight = true;
  const placeBtn = document.getElementById('place-order-btn');
  if(placeBtn) { placeBtn.disabled = true; placeBtn.textContent = 'Processing…'; }

  try {
    toast('🔒 Creating secure Razorpay order...');
    const orderRes = await apiPost('/payments/create-order', {amount_inr: total});
    const {order, key_id} = orderRes;
    const options = {
      key: key_id,
      amount: order.amount,
      currency: order.currency,
      name: 'TechSetu',
      description: 'Farm fresh order payment',
      order_id: order.id,
      theme: {color: '#1F3A60'},
      handler: async function (response) {
        try {
          await apiPost('/payments/verify', response);
          completeOrderAfterPayment(order.id);
          toast('🎉 Payment successful and verified!');
        } catch (err) {
          toast(`⚠️ ${err.message}`);
        } finally {
          _placeOrderInFlight = false;
          if(placeBtn) { placeBtn.disabled = false; placeBtn.textContent = 'Pay Now →'; }
        }
      },
      modal: {
        ondismiss: function() {
          toast('Payment cancelled');
          _placeOrderInFlight = false;
          if(placeBtn) { placeBtn.disabled = false; placeBtn.textContent = 'Pay Now →'; }
        }
      }
    };
    const rz = new Razorpay(options);
    rz.open();
  } catch (err) {
    toast(`⚠️ ${err.message}`);
    _placeOrderInFlight = false;
    if(placeBtn) { placeBtn.disabled = false; placeBtn.textContent = 'Pay Now →'; }
  }
}

// ─── COUNTDOWN ───
let countdownInterval = null;
function startCountdown(seconds) {
  clearInterval(countdownInterval);
  countdownInterval = setInterval(()=>{
    if(seconds <= 0) { clearInterval(countdownInterval); return; }
    seconds--;
    const m = Math.floor(seconds/60);
    const s = seconds%60;
    document.getElementById('countdown-min').textContent = m;
    document.getElementById('countdown-sec').textContent = s.toString().padStart(2,'0');
    document.getElementById('eta-time').textContent = `${m} min`;
  }, 1000);
}

// ─── SCREEN INTERCEPTS ───
// Override showScreen to add side effects
const _showScreen = showScreen;
window.showScreen = function(id) {
  if(id === 'screen-cart') renderCart();
  if(id === 'screen-payment') renderPaySummary();
  _showScreen(id);
};

// ─── OFFERS ───
function offerAction(btn, action) {
  const card = btn.closest('.farmer-offer-card');
  const crop = card.querySelector('.farmer-offer-crop').textContent.trim();
  card.style.opacity='0.4';
  card.querySelectorAll('button').forEach(b=>b.disabled=true);
  toast(action==='accepted'?'✅ Offer accepted — '+crop:'❌ Offer declined — '+crop);
}

// ─── TOAST (queue-based — rapid calls no longer overwrite each other) ───
const _toastQueue = [];
let _toastActive = false;

function toast(msg) {
  _toastQueue.push(msg);
  if(!_toastActive) _processToastQueue();
}

function _processToastQueue() {
  if(!_toastQueue.length) { _toastActive = false; return; }
  _toastActive = true;
  const msg = _toastQueue.shift();
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => {
    t.classList.remove('show');
    // Small gap between toasts so the hide transition completes cleanly.
    setTimeout(_processToastQueue, 200);
  }, 2500);
}

// ─── FARMER MODAL ───
function openFarmerModal() {
  document.getElementById('modal-content').innerHTML = `
    <div class="modal-title">Add Crop Listing</div>
    <div class="modal-sub">List your produce and start receiving offers from verified buyers.</div>
    <div style="background:rgba(247,207,89,.15);border:1px solid rgba(247,207,89,.4);border-radius:8px;padding:10px 12px;margin-bottom:16px;font-size:12px;color:#7a5e00">
      💡 <strong>AI Suggestion:</strong> Current demand for Tomatoes is high. Suggested price: ₹22–24/kg.
    </div>
    <div class="form-field"><label>Crop Name</label><input placeholder="e.g. Tomatoes" id="f-crop"/></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <div class="form-field"><label>Price (₹/kg)</label><input type="number" placeholder="e.g. 22" id="f-price"/></div>
      <div class="form-field"><label>Quantity (kg)</label><input type="number" placeholder="e.g. 500" id="f-qty"/></div>
    </div>
    <div class="form-field"><label>Category</label>
      <select><option>Vegetables</option><option>Fruits</option><option>Grains</option><option>Spices</option></select>
    </div>
    <div class="form-field"><label>Harvest Date</label><input type="date" id="f-date"/></div>
    <div class="form-field"><label>Location / Village</label><input placeholder="e.g. Nashik, Maharashtra" id="f-loc"/></div>
    <button class="modal-btn green" onclick="submitListing()">Submit Listing →</button>
  `;
  document.getElementById('modal').classList.add('open');
}

function submitListing() {
  const crop = document.getElementById('f-crop')?.value.trim();
  const price = document.getElementById('f-price')?.value;
  if(!crop||!price){toast('Please fill in crop name and price');return;}
  toast('🌾 '+crop+' listed at ₹'+price+'/kg!');
  closeModal();
}

function closeModal() { document.getElementById('modal').classList.remove('open'); }
function closeModalOutside(e) { if(e.target===document.getElementById('modal')) closeModal(); }

// ─── INIT ───
renderProducts();
updateCartCount();
restoreForgotCooldownUntil();
const savedAuthState = readJsonStorage(AUTH_STATE_KEY, {});
if(savedAuthState.currentRole) currentRole = savedAuthState.currentRole;
if(savedAuthState.currentLoginTab) currentLoginTab = savedAuthState.currentLoginTab;

(async function initApp() {
  const handledOAuth = await handleOAuthRedirect();
  if(handledOAuth) return;

  const savedScreen = localStorage.getItem(SCREEN_STORAGE_KEY);
  if(savedScreen && savedScreen !== 'page-main' && document.getElementById(savedScreen)) {
    if(savedScreen === 'screen-login') {
      showScreen(savedScreen);
      renderLoginScreen(currentRole || 'buyer');
      return;
    }

    if(savedScreen === 'screen-google-phone-verify') {
      const token = getToken();
      if(!token) {
        localStorage.removeItem(SCREEN_STORAGE_KEY);
        showRoleSelect();
        return;
      }
      try {
        await ensureGooglePhoneVerified(currentRole || getCurrentAppRole());
      } catch(_) {
        localStorage.removeItem(SCREEN_STORAGE_KEY);
        showRoleSelect();
      }
      return;
    }

    if(savedScreen === 'screen-profile') {
      openProfile();
      return;
    }

    // For any protected screen, verify the token is still valid before restoring.
    const protectedScreens = [
      'screen-home','screen-farmer','screen-buyer-type','screen-cart',
      'screen-product','screen-address','screen-payment','screen-tracking','screen-profile'
    ];
    if(protectedScreens.includes(savedScreen)) {
      const token = getToken();
      if(!token) {
        // No token at all — go to login.
        showPageMain();
        return;
      }
      try {
        await apiGet('/auth/me');
      } catch(_) {
        // Token invalid or expired — clear and restart.
        clearToken();
        localStorage.removeItem(SCREEN_STORAGE_KEY);
        showPageMain();
        return;
      }
    }

    showScreen(savedScreen);
    if(savedScreen === 'screen-home') {
      renderProducts();
      applySavedHomeRoleBadge();
    }
  } else {
    showPageMain();
  }
})();