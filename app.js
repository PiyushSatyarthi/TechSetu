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
const API_BASE = 'http://127.0.0.1:8000';
const SCREEN_STORAGE_KEY = 'techsetu_current_screen';
const AUTH_STATE_KEY = 'techsetu_auth_state';
const AUTH_DRAFTS_KEY = 'techsetu_auth_drafts';

function readJsonStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (_) {
    return fallback;
  }
}

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
  const ids = [
    'auth-first-name','auth-last-name','auth-state','auth-primary-crop',
    'auth-organisation','auth-phone','auth-otp','auth-email','auth-password','auth-confirm-password'
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
    showScreen('screen-buyer-type');
  } else {
    showScreen('screen-farmer');
  }
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

async function apiPost(path, data) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(data)
  });
  const payload = await res.json().catch(()=>({detail:'Something went wrong'}));
  if(!res.ok) {
    throw new Error(payload.detail || 'Request failed');
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
    throw new Error(payload.detail || 'Request failed');
  }
  return payload;
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

      // ── 1. Phone OTP verification before signup ──
      try {
        await apiPost('/auth/verify-phone', {phone, otp});
      } catch(err) {
        toast(`⚠️ OTP Error: ${err.message}`);
        return;
      }

      const body = {
        role,
        first_name: firstName,
        last_name: lastName,
        email,
        password,
        phone
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
        const loginRes = await apiPost('/auth/login', {email, password});
        if(loginRes.access_token) setToken(loginRes.access_token);
      }
      toast('✅ Signup successful');
      localStorage.removeItem(AUTH_DRAFTS_KEY);
      loginSuccess(role);
      return;
    }

    // ── 4. Store JWT from login response ──
    const loginRes = await apiPost('/auth/login', {email, password});
    if(loginRes.access_token) setToken(loginRes.access_token);
    toast('✅ Login successful');
    localStorage.removeItem(AUTH_DRAFTS_KEY);
    loginSuccess(role);
  } catch (err) {
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
          <div style="flex:1"><label>OTP (use 666666 in dev)</label><input id="auth-otp" type="text" inputmode="numeric" maxlength="6" placeholder="Enter 6-digit OTP" /></div>
          <button type="button" style="padding:10px 14px;background:rgba(255,255,255,.12);color:inherit;border:1px solid rgba(255,255,255,.2);border-radius:8px;cursor:pointer;font-size:12px;white-space:nowrap;font-family:inherit" onclick="toast('OTP sent! Use 666666 in dev mode')">Send OTP</button>
        </div>
      ` : ''}
      <div class="lf"><label>Email Address</label><input id="auth-email" value="${getDraftValue(role, currentLoginTab, 'auth-email')}" type="email" placeholder="${isBuyer ? 'you@company.com' : 'ramesh@farm.com'}" /></div>
      <div class="lf"><label>Password</label><input id="auth-password" value="${getDraftValue(role, currentLoginTab, 'auth-password')}" type="password" placeholder="••••••••" /></div>
      ${!isSignup ? `<div class="login-forgot">Forgot password?</div>` : ''}
      ${isSignup ? `<div class="lf"><label>Confirm Password</label><input id="auth-confirm-password" value="${getDraftValue(role, currentLoginTab, 'auth-confirm-password')}" type="password" placeholder="••••••••" /></div>` : ''}
      <button class="login-btn" onclick="handleAuthSubmit('${role}', ${isSignup ? 'true' : 'false'})">${isSignup ? 'Create Account →' : 'Sign In →'}</button>
      <div class="login-divider">or continue with</div>
      <button class="login-btn" style="background:${isBuyer?'var(--offwhite)':'rgba(255,255,255,.08)'};color:${isBuyer?'var(--text-dark)':'white'};border:1px solid ${isBuyer?'var(--card-border)':'rgba(255,255,255,.15)'}" onclick="toast('Google login can be added with Supabase OAuth setup')">
        <span style="margin-right:6px">G</span> Continue with Google
      </button>
    </div>
    <div class="login-signup-link">${isSignup ? 'Already have an account?' : "Don't have an account?"}
      <span onclick="switchLoginTab('${isSignup?'login':'signup'}','${role}')">${isSignup ? 'Sign in' : 'Sign up free'}</span>
    </div>
  `;

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

  const delivery = subtotal > 0 ? 40 : 0;
  const packaging = subtotal > 0 ? 15 : 0;
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
  const delivery = 40, packaging = 15, total = subtotal + delivery + packaging;
  const el = document.getElementById('pay-order-summary');
  if(el) el.innerHTML = `
    <div class="pay-order-summary-title">Order Summary</div>
    ${keys.map(id=>{const {product:p,qty}=cart[id];return `<div class="pay-row"><span>${p.emoji} ${p.name} ×${qty}kg</span><span>₹${p.price*qty}</span></div>`}).join('')}
    <div class="pay-row"><span>Delivery</span><span>₹${delivery}</span></div>
    <div class="pay-row"><span>Packaging</span><span>₹${packaging}</span></div>
    <div class="pay-row total"><span>Total</span><span>₹${total}</span></div>
  `;
}

function completeOrderAfterPayment() {
  cart = {};
  updateCartCount();
  const now = new Date();
  document.getElementById('order-date').textContent = now.toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'});
  const f = d => d.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'});
  document.getElementById('step1-time').textContent = f(new Date(now-15*60000));
  document.getElementById('step2-time').textContent = f(new Date(now-8*60000));
  document.getElementById('step3-time').textContent = f(new Date(now-3*60000));
  document.getElementById('order-num').textContent = Math.floor(3000+Math.random()*1000);
  showScreen('screen-tracking');
  startCountdown(32*60);
}

function getCheckoutTotal() {
  const keys = Object.keys(cart);
  let subtotal = 0;
  keys.forEach(id => { const {product:p, qty} = cart[id]; subtotal += p.price * qty; });
  return subtotal + (keys.length ? 55 : 0);
}

async function placeOrder() {
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
          completeOrderAfterPayment();
          toast('🎉 Payment successful and verified!');
        } catch (err) {
          toast(`⚠️ ${err.message}`);
        }
      },
      modal: {
        ondismiss: function() {
          toast('Payment cancelled');
        }
      }
    };
    const rz = new Razorpay(options);
    rz.open();
  } catch (err) {
    toast(`⚠️ ${err.message}`);
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

// ─── TOAST ───
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'), 2500);
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
const savedAuthState = readJsonStorage(AUTH_STATE_KEY, {});
if(savedAuthState.currentRole) currentRole = savedAuthState.currentRole;
if(savedAuthState.currentLoginTab) currentLoginTab = savedAuthState.currentLoginTab;
const savedScreen = localStorage.getItem(SCREEN_STORAGE_KEY);
if(savedScreen && savedScreen !== 'page-main' && document.getElementById(savedScreen)) {
  showScreen(savedScreen);
  if(savedScreen === 'screen-login' && currentRole) renderLoginScreen(currentRole);
  if(savedScreen === 'screen-home') renderProducts();
} else {
  showPageMain();
}