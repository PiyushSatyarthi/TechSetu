(function () {
  var API_BASE = (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost')
    ? 'http://127.0.0.1:8000'
    : '';

  function getToken() {
    return localStorage.getItem('token') || null;
  }

  function clearSession() {
    localStorage.removeItem('token');
    localStorage.removeItem('techsetu_auth_state');
    localStorage.removeItem('techsetu_home_role_badge');
    localStorage.removeItem('techsetu_auth_drafts');
  }

  function headers() {
    var token = getToken();
    var h = { 'Content-Type': 'application/json' };
    if (token) h['Authorization'] = 'Bearer ' + token;
    return h;
  }

  function parseApiError(payload, fallback) {
    var detail = payload && payload.detail;
    if (typeof detail === 'string' && detail) return detail;
    if (detail && typeof detail === 'object' && detail.detail) return detail.detail;
    return fallback || 'Request failed';
  }

  async function apiGet(path) {
    var res = await fetch(API_BASE + path, { method: 'GET', headers: headers() });
    var payload = await res.json().catch(function () { return { detail: 'Something went wrong' }; });
    if (!res.ok) {
      var err = new Error(parseApiError(payload, 'Request failed'));
      err.status = res.status;
      err.payload = payload;
      throw err;
    }
    return payload;
  }

  async function apiPatch(path, body) {
    var res = await fetch(API_BASE + path, { method: 'PATCH', headers: headers(), body: JSON.stringify(body) });
    var payload = await res.json().catch(function () { return { detail: 'Something went wrong' }; });
    if (!res.ok) {
      var err = new Error(parseApiError(payload, 'Request failed'));
      err.status = res.status;
      err.payload = payload;
      throw err;
    }
    return payload;
  }

  async function apiPost(path, body) {
    var res = await fetch(API_BASE + path, { method: 'POST', headers: headers(), body: JSON.stringify(body) });
    var payload = await res.json().catch(function () { return { detail: 'Something went wrong' }; });
    if (!res.ok) {
      var err = new Error(parseApiError(payload, 'Request failed'));
      err.status = res.status;
      err.payload = payload;
      throw err;
    }
    return payload;
  }

  function ensureStyles() {
    if (document.getElementById('fp-style')) return;
    var style = document.createElement('style');
    style.id = 'fp-style';
    style.textContent = ""
      + ".fp-overlay{position:fixed;inset:0;background:rgba(0,0,0,.42);display:none;align-items:center;justify-content:center;z-index:1400;padding:16px}"
      + ".fp-overlay.open{display:flex}"
      + ".fp-sheet{width:min(760px,100%);max-height:90vh;overflow-y:auto;background:#fff;border:1px solid #E0E0E0;border-radius:12px;box-shadow:0 16px 40px rgba(0,0,0,.25)}"
      + ".fp-head{padding:14px 16px;border-bottom:1px solid #F0F4F0;display:flex;align-items:center;justify-content:space-between}"
      + ".fp-title{font-family:Georgia,'Times New Roman',serif;font-size:18px;color:#2E2E2E}"
      + ".fp-close{width:30px;height:30px;border-radius:50%;border:1px solid #E0E0E0;background:#fff;color:#616161;cursor:pointer;font-size:18px;line-height:1}"
      + ".fp-body{padding:16px;display:grid;gap:12px}"
      + ".fp-card{border:1px solid #E0E0E0;border-radius:8px;padding:14px;background:#FCFEFC}"
      + ".fp-card h3{font-size:13px;color:#616161;text-transform:uppercase;letter-spacing:.4px;margin-bottom:10px}"
      + ".fp-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}"
      + ".fp-field label{display:block;font-size:11px;color:#616161;margin-bottom:4px}"
      + ".fp-field input{width:100%;border:1px solid #E0E0E0;border-radius:6px;padding:9px 10px;font-size:13px;color:#2E2E2E;outline:none}"
      + ".fp-field input:focus{border-color:#4CAF50}"
      + ".fp-field input:disabled{background:#F3F5F3;color:#7B7B7B}"
      + ".fp-actions{display:flex;gap:8px;flex-wrap:wrap}"
      + ".fp-btn{border:none;border-radius:6px;padding:9px 14px;font-size:12.5px;font-weight:600;cursor:pointer}"
      + ".fp-btn.primary{background:#4CAF50;color:#fff}"
      + ".fp-btn.primary:hover{background:#3E8E41}"
      + ".fp-btn.secondary{background:#fff;color:#4CAF50;border:1px solid #4CAF50}"
      + ".fp-btn.secondary:hover{background:#E8F5E9}"
      + ".fp-btn.logout{background:#D64545;color:#fff;margin-left:auto}"
      + ".fp-btn.logout:hover{background:#B53A3A}"
      + ".fp-btn.otp{background:#fff;color:#4CAF50;border:1px solid #81C784}"
      + ".fp-btn.otp:hover{background:#E8F5E9}"
      + ".fp-status{min-height:18px;font-size:12px;margin-top:8px}"
      + ".fp-status.error{color:#B23A3A}"
      + ".fp-status.success{color:#2E7D32}"
      + ".fp-phone-otp-row{display:none;grid-template-columns:1fr auto;gap:8px;align-items:end}"
      + ".fp-phone-otp-row.show{display:grid}"
      + "@media (max-width:640px){.fp-grid{grid-template-columns:1fr}.fp-phone-otp-row{grid-template-columns:1fr}}";
    document.head.appendChild(style);
  }

  function ensureModal() {
    if (document.getElementById('fpOverlay')) return;
    var html = ''
      + '<div class="fp-overlay" id="fpOverlay" aria-hidden="true">'
      + '  <div class="fp-sheet" role="dialog" aria-modal="true" aria-labelledby="fpTitle">'
      + '    <div class="fp-head">'
      + '      <div class="fp-title" id="fpTitle">Farmer Profile</div>'
      + '      <button type="button" class="fp-close" id="fpClose" aria-label="Close profile">x</button>'
      + '    </div>'
      + '    <div class="fp-body">'
      + '      <div class="fp-card">'
      + '        <h3>Basic Information</h3>'
      + '        <div class="fp-grid">'
      + '          <div class="fp-field"><label for="fpFirstName">First Name</label><input id="fpFirstName" type="text" placeholder="First name"></div>'
      + '          <div class="fp-field"><label for="fpLastName">Last Name</label><input id="fpLastName" type="text" placeholder="Last name"></div>'
      + '          <div class="fp-field"><label for="fpPhone">Phone</label><input id="fpPhone" type="tel" placeholder="+91 98765 43210"></div>'
      + '          <div class="fp-field"><label for="fpEmail">Email</label><input id="fpEmail" type="email" disabled></div>'
      + '          <div class="fp-field"><label for="fpState">State / Region</label><input id="fpState" type="text" placeholder="Maharashtra"></div>'
      + '          <div class="fp-field"><label for="fpCrop">Primary Crop</label><input id="fpCrop" type="text" placeholder="Wheat"></div>'
      + '        </div>'
      + '        <div class="fp-phone-otp-row" id="fpPhoneOtpRow">'
      + '          <div class="fp-field"><label for="fpPhoneOtp">OTP for new number</label><input id="fpPhoneOtp" type="text" inputmode="numeric" maxlength="6" placeholder="Enter OTP"></div>'
      + '          <button type="button" class="fp-btn otp" id="fpSendOtpBtn">Send OTP</button>'
      + '        </div>'
      + '        <div class="fp-status" id="fpOtpStatus"></div>'
      + '        <div class="fp-actions" style="margin-top:10px">'
      + '          <button type="button" class="fp-btn primary" id="fpSaveBtn">Save Profile</button>'
      + '        </div>'
      + '        <div class="fp-status" id="fpSaveStatus"></div>'
      + '      </div>'
      + '      <div class="fp-card">'
      + '        <h3>Password Reset</h3>'
      + '        <div class="fp-grid">'
      + '          <div class="fp-field"><label for="fpCurrentPassword">Current Password</label><input id="fpCurrentPassword" type="password" placeholder="Current password" autocomplete="off" data-lpignore="true"></div>'
      + '          <div class="fp-field"><label for="fpNewPassword">New Password</label><input id="fpNewPassword" type="password" placeholder="New password" autocomplete="new-password" data-lpignore="true"></div>'
      + '        </div>'
      + '        <div class="fp-actions" style="margin-top:10px">'
      + '          <button type="button" class="fp-btn secondary" id="fpPasswordBtn">Update Password</button>'
      + '          <button type="button" class="fp-btn logout" id="fpLogoutBtn">Logout</button>'
      + '        </div>'
      + '        <div class="fp-status" id="fpPasswordStatus"></div>'
      + '      </div>'
      + '    </div>'
      + '  </div>'
      + '</div>';
    document.body.insertAdjacentHTML('beforeend', html);
  }

  function setStatus(id, type, msg) {
    var el = document.getElementById(id);
    if (!el) return;
    el.className = 'fp-status' + (type ? ' ' + type : '');
    el.textContent = msg || '';
  }

  function showToast(msg) {
    if (typeof window.showToast === 'function') {
      window.showToast(msg);
      return;
    }
    if (typeof window.toast === 'function') {
      window.toast(msg);
      return;
    }
    window.alert(msg);
  }

  function setAvatarInitials(firstName, lastName) {
    var initials = ((firstName || '').trim().charAt(0) + (lastName || '').trim().charAt(0)).toUpperCase();
    var avatars = document.querySelectorAll('.nav-avatar');
    avatars.forEach(function (el) {
      if (initials) el.textContent = initials;
    });
  }

  function clearPasswordFields() {
    var current = document.getElementById('fpCurrentPassword');
    var next = document.getElementById('fpNewPassword');
    if (current) current.value = '';
    if (next) next.value = '';

    // Some password managers inject after paint; clear again shortly after open.
    setTimeout(function () {
      if (current) current.value = '';
      if (next) next.value = '';
    }, 80);
  }

  function isPhoneChanged() {
    var phone = document.getElementById('fpPhone');
    if (!phone) return false;
    var current = (phone.value || '').trim();
    var original = (phone.dataset.original || '').trim();
    return current && current !== original;
  }

  function togglePhoneOtpSection() {
    var row = document.getElementById('fpPhoneOtpRow');
    var otp = document.getElementById('fpPhoneOtp');
    if (!row || !otp) return;
    if (isPhoneChanged()) {
      row.classList.add('show');
      return;
    }
    row.classList.remove('show');
    otp.value = '';
    setStatus('fpOtpStatus', '', '');
  }

  async function loadProfile() {
    setStatus('fpSaveStatus', '', '');
    setStatus('fpPasswordStatus', '', '');
    setStatus('fpOtpStatus', '', '');
    try {
      var data = await apiGet('/auth/profile');
      var p = (data && data.profile) || {};
      document.getElementById('fpFirstName').value = p.first_name || '';
      document.getElementById('fpLastName').value = p.last_name || '';
      document.getElementById('fpPhone').value = p.phone || '';
      document.getElementById('fpPhone').dataset.original = p.phone || '';
      document.getElementById('fpEmail').value = p.email || '';
      document.getElementById('fpState').value = p.state || '';
      document.getElementById('fpCrop').value = p.primary_crop || '';
      setAvatarInitials(p.first_name || '', p.last_name || '');
      togglePhoneOtpSection();
    } catch (err) {
      if (err.status === 401 || err.status === 403) {
        setStatus('fpSaveStatus', 'error', 'Session expired. Please log in again.');
      } else {
        setStatus('fpSaveStatus', 'error', err.message || 'Could not load profile.');
      }
    }
  }

  async function sendPhoneOtp() {
    var phone = (document.getElementById('fpPhone').value || '').trim();
    if (!phone) {
      setStatus('fpOtpStatus', 'error', 'Enter new phone number first.');
      return;
    }
    setStatus('fpOtpStatus', '', '');
    try {
      var res = await apiPost('/auth/send-phone-otp', { phone: phone });
      var hint = res && res.dev_mode ? ' (dev mode: use 666666)' : '';
      setStatus('fpOtpStatus', 'success', 'OTP sent' + hint);
    } catch (err) {
      setStatus('fpOtpStatus', 'error', err.message || 'Could not send OTP.');
    }
  }

  async function saveProfile() {
    setStatus('fpSaveStatus', '', '');
    var payload = {
      first_name: (document.getElementById('fpFirstName').value || '').trim(),
      last_name: (document.getElementById('fpLastName').value || '').trim(),
      phone: (document.getElementById('fpPhone').value || '').trim(),
      phone_otp: (document.getElementById('fpPhoneOtp').value || '').trim(),
      state: (document.getElementById('fpState').value || '').trim(),
      primary_crop: (document.getElementById('fpCrop').value || '').trim()
    };

    if (!payload.first_name || !payload.last_name) {
      setStatus('fpSaveStatus', 'error', 'First and last name are required.');
      return;
    }
    if (!payload.phone) {
      setStatus('fpSaveStatus', 'error', 'Phone number is required.');
      return;
    }
    if (!payload.state || !payload.primary_crop) {
      setStatus('fpSaveStatus', 'error', 'State and primary crop are required for farmers.');
      return;
    }
    if (isPhoneChanged() && !payload.phone_otp) {
      setStatus('fpSaveStatus', 'error', 'OTP verification is required for new phone number.');
      return;
    }

    try {
      await apiPatch('/auth/profile', payload);
      document.getElementById('fpPhone').dataset.original = payload.phone;
      document.getElementById('fpPhoneOtp').value = '';
      setAvatarInitials(payload.first_name, payload.last_name);
      togglePhoneOtpSection();
      setStatus('fpSaveStatus', 'success', 'Profile updated successfully.');
      showToast('✅ Profile updated');
    } catch (err) {
      setStatus('fpSaveStatus', 'error', err.message || 'Could not update profile.');
    }
  }

  async function updatePassword() {
    setStatus('fpPasswordStatus', '', '');
    var currentPassword = document.getElementById('fpCurrentPassword').value;
    var newPassword = document.getElementById('fpNewPassword').value;
    if (!currentPassword || !newPassword) {
      setStatus('fpPasswordStatus', 'error', 'Enter current and new password.');
      return;
    }
    if (newPassword.length < 8) {
      setStatus('fpPasswordStatus', 'error', 'New password must be at least 8 characters.');
      return;
    }
    try {
      await apiPost('/auth/change-password', { current_password: currentPassword, new_password: newPassword });
      document.getElementById('fpCurrentPassword').value = '';
      document.getElementById('fpNewPassword').value = '';
      setStatus('fpPasswordStatus', 'success', 'Password updated successfully.');
      showToast('✅ Password updated');
    } catch (err) {
      setStatus('fpPasswordStatus', 'error', err.message || 'Could not update password.');
    }
  }

  function openModal() {
    var overlay = document.getElementById('fpOverlay');
    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden', 'false');
    clearPasswordFields();
    loadProfile();
  }

  function closeModal() {
    var overlay = document.getElementById('fpOverlay');
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden', 'true');
    clearPasswordFields();
  }

  function logout() {
    clearSession();
    closeModal();
    window.location.href = 'index.html';
  }

  function mount() {
    var avatars = document.querySelectorAll('.nav-avatar');
    if (!avatars.length) return;

    ensureStyles();
    ensureModal();

    avatars.forEach(function (avatar) {
      avatar.setAttribute('role', 'button');
      avatar.setAttribute('tabindex', '0');
      avatar.setAttribute('aria-label', 'Open profile');
      avatar.addEventListener('click', openModal);
      avatar.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openModal();
        }
      });
    });

    document.getElementById('fpClose').addEventListener('click', closeModal);
    document.getElementById('fpOverlay').addEventListener('click', function (e) {
      if (e.target.id === 'fpOverlay') closeModal();
    });
    document.getElementById('fpPhone').addEventListener('input', togglePhoneOtpSection);
    document.getElementById('fpSendOtpBtn').addEventListener('click', sendPhoneOtp);
    document.getElementById('fpSaveBtn').addEventListener('click', saveProfile);
    document.getElementById('fpPasswordBtn').addEventListener('click', updatePassword);
    document.getElementById('fpLogoutBtn').addEventListener('click', logout);

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeModal();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
