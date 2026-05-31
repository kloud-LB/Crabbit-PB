/* ================================================================
   auth.js — Supabase 用户认证 + 用户资料（昵称 + 头像）
   ================================================================ */

var authUser = null;
var userProfile = { nickname: '', avatar: '👤' };

const AVATAR_EMOJIS = [
  '👤', '😊', '😎', '🤓', '👨', '👩', '🧑', '👻',
  '🐱', '🐶', '🦊', '🐼', '🐨', '🦁', '🐯', '🐸',
  '🦄', '🐙', '🌈', '⭐', '🔥', '💎', '🎯', '🚀',
  '🎨', '🌸', '🍀', '💪', '🧠', '🎵', '🌙', '☀️'
];

// ---- User Profile Data Layer ----
async function loadUserProfile(uid) {
  // Try cache first
  var cached = dbCacheLoad(uid, 'checkin_cache_profile');
  if (cached) {
    userProfile = cached;
    updateAvatarBtn();
    return;
  }
  // Fetch from server
  if (isOnline) {
    try {
      var sb = getSupabase();
      var res = await sb.from('user_profiles').select('*').eq('user_id', uid).maybeSingle();
      if (!res.error && res.data) {
        userProfile = { nickname: res.data.nickname, avatar: res.data.avatar || '👤' };
        dbCacheSave(uid, 'checkin_cache_profile', userProfile);
        updateAvatarBtn();
      }
    } catch(e) { /* use defaults */ }
  }
}

async function saveUserProfile() {
  if (!authUser) return;
  var uid = authUser.id;
  dbCacheSave(uid, 'checkin_cache_profile', userProfile);
  if (isOnline) {
    try {
      await getSupabase().from('user_profiles').upsert({
        user_id: uid,
        nickname: userProfile.nickname,
        avatar: userProfile.avatar,
        updated_at: new Date().toISOString()
      });
    } catch(e) { /* offline queue */ }
  }
}

// ---- Avatar Button ----
function updateAvatarBtn() {
  var btn = document.getElementById('avatarBtn');
  if (!btn) return;
  if (authUser && userProfile.avatar) {
    btn.textContent = userProfile.avatar;
    btn.classList.remove('guest');
  } else {
    btn.textContent = '👤';
    btn.classList.add('guest');
  }
}

function toggleUserPanel() {
  // Auth bypassed — always show user panel (guest mode)
  if (!authUser) {
    showToast('本地模式，无需登录');
    return;
  }
  var overlay = document.getElementById('userPanelOverlay');
  if (!overlay) return;
  if (overlay.classList.contains('show')) {
    closeUserPanel();
    return;
  }
  // Update panel content
  document.getElementById('userPanelAvatar').textContent = userProfile.avatar || '👤';
  document.getElementById('userPanelNickname').textContent = userProfile.nickname || '未设置昵称';
  document.getElementById('userPanelEmail').textContent = authUser ? authUser.email : '';
  overlay.classList.add('show');
}

function closeUserPanel() {
  var overlay = document.getElementById('userPanelOverlay');
  if (overlay) overlay.classList.remove('show');
}

// ---- Avatar Picker ----
function openAvatarPicker() {
  var grid = document.getElementById('emojiGrid');
  grid.innerHTML = AVATAR_EMOJIS.map(function(e) {
    var sel = e === userProfile.avatar ? ' selected' : '';
    return '<button class="emoji-option' + sel + '" data-emoji="' + e + '">' + e + '</button>';
  }).join('');
  document.getElementById('avatarPickerOverlay').classList.add('show');

  grid.onclick = function(e) {
    var btn = e.target.closest('.emoji-option');
    if (!btn) return;
    userProfile.avatar = btn.dataset.emoji;
    saveUserProfile();
    updateAvatarBtn();
    document.getElementById('userPanelAvatar').textContent = userProfile.avatar;
    closeAvatarPicker();
  };
}

function closeAvatarPicker() {
  document.getElementById('avatarPickerOverlay').classList.remove('show');
}

// ---- Nickname Edit ----
function openNicknameEdit() {
  document.getElementById('nicknameEditInput').value = userProfile.nickname || '';
  document.getElementById('nicknameEditOverlay').classList.add('show');
  setTimeout(function() { document.getElementById('nicknameEditInput').focus(); }, 350);
}

function saveNicknameEdit() {
  var name = document.getElementById('nicknameEditInput').value.trim();
  if (!name) { showToast('昵称不能为空'); return; }
  userProfile.nickname = name;
  saveUserProfile();
  updateAvatarBtn();
  document.getElementById('userPanelNickname').textContent = name;
  document.getElementById('nicknameEditOverlay').classList.remove('show');
  showToast('昵称已更新');
}

function closeNicknameEdit() {
  document.getElementById('nicknameEditOverlay').classList.remove('show');
}

// ---- Session Management ----
async function initAuth() {
  try {
    var sb = getSupabase();
    var resp = await sb.auth.getUser();
    authUser = resp.data.user || null;
  } catch(e) {
    authUser = null;
  }
  // Listen for auth state changes
  getSupabase().auth.onAuthStateChange(function(event, session) {
    authUser = session ? session.user : null;
    if (authUser) {
      document.body.classList.remove('is-guest');
      document.body.classList.add('is-authed');
      hideAuthUI();
      onUserReady();
    } else {
      document.body.classList.add('is-guest');
      document.body.classList.remove('is-authed');
      userProfile = { nickname: '', avatar: '👤' };
      updateAvatarBtn();
      showAuthUI();
    }
  });
  // Restore session
  if (authUser) {
    document.body.classList.remove('is-guest');
    document.body.classList.add('is-authed');
    hideAuthUI();
    return true;
  } else {
    document.body.classList.add('is-guest');
    showAuthUI();
    return false;
  }
}

// ---- Auth UI ----
function getAuthHTML() {
  return '<div class="auth-container" id="authContainer">' +
    // ====== Login Card ======
    '<div class="auth-card" id="authLoginCard">' +
      '<div class="auth-header">' +
        '<div style="font-size:2rem">📋</div>' +
        '<h2 style="margin:8px 0 4px;font-size:1.2rem">每日打卡</h2>' +
        '<p style="font-size:0.8rem;color:var(--text-secondary)">登录以同步数据到云端</p>' +
      '</div>' +
      '<div class="form-group">' +
        '<label class="form-label">邮箱</label>' +
        '<input class="form-input" id="loginEmail" type="email" placeholder="your@email.com" autocomplete="email">' +
      '</div>' +
      '<div class="form-group">' +
        '<label class="form-label">密码</label>' +
        '<input class="form-input" id="loginPassword" type="password" placeholder="至少6位" autocomplete="current-password">' +
      '</div>' +
      '<div class="auth-err" id="loginError"></div>' +
      '<button class="form-submit" id="authSignInBtn">登录</button>' +
      '<p style="text-align:center;font-size:0.82rem;color:var(--text-secondary);margin-top:16px">' +
        '还没有账号？<a role="button" id="goRegister" style="color:#6b7db3;cursor:pointer;font-weight:600">点击注册</a>' +
      '</p>' +
      '<p style="text-align:center;font-size:0.65rem;color:var(--text-tertiary);margin-top:12px">' +
        '你的数据仅属于你，通过 Row Level Security 隔离' +
      '</p>' +
    '</div>' +
    // ====== Register Card ======
    '<div class="auth-card" id="authRegisterCard" style="display:none">' +
      '<div class="auth-header">' +
        '<div style="font-size:2rem">📋</div>' +
        '<h2 style="margin:8px 0 4px;font-size:1.2rem">创建账号</h2>' +
        '<p style="font-size:0.8rem;color:var(--text-secondary)">设置昵称头像，数据云端同步</p>' +
      '</div>' +
      '<div class="form-group">' +
        '<label class="form-label">昵称</label>' +
        '<input class="form-input" id="regNickname" type="text" placeholder="给自己起个名字" maxlength="20">' +
      '</div>' +
      '<div class="form-group">' +
        '<label class="form-label">头像</label>' +
        '<div class="auth-avatar-pick" id="authAvatarPick"></div>' +
      '</div>' +
      '<div class="form-group">' +
        '<label class="form-label">邮箱</label>' +
        '<input class="form-input" id="regEmail" type="email" placeholder="your@email.com" autocomplete="email">' +
      '</div>' +
      '<div class="form-group">' +
        '<label class="form-label">密码</label>' +
        '<input class="form-input" id="regPassword" type="password" placeholder="至少6位" autocomplete="new-password">' +
      '</div>' +
      '<div class="auth-err" id="regError"></div>' +
      '<button class="form-submit" id="authSignUpBtn">注册新账号</button>' +
      '<p style="text-align:center;font-size:0.82rem;color:var(--text-secondary);margin-top:16px">' +
        '已有账号？<a role="button" id="goLogin" style="color:#6b7db3;cursor:pointer;font-weight:600">点击登录</a>' +
      '</p>' +
      '<p style="text-align:center;font-size:0.65rem;color:var(--text-tertiary);margin-top:12px">' +
        '你的数据仅属于你，通过 Row Level Security 隔离' +
      '</p>' +
    '</div>' +
  '</div>';
}

var _authAvatarSelected = '👤';

function showAuthUI() {
  var existing = document.getElementById('authContainer');
  if (existing) {
    existing.style.display = '';
    // Always reset to login card
    switchAuthCard('login');
  } else {
    var div = document.createElement('div');
    div.innerHTML = getAuthHTML();
    document.body.appendChild(div.firstElementChild);
    bindAuthEvents();
  }
  document.getElementById('app').style.display = 'none';
  document.getElementById('fabBtn').style.display = 'none';
}

function hideAuthUI() {
  var el = document.getElementById('authContainer');
  if (el) el.style.display = 'none';
  document.getElementById('app').style.display = '';
  document.getElementById('fabBtn').style.display = '';
}

function switchAuthCard(mode) {
  var loginCard = document.getElementById('authLoginCard');
  var regCard = document.getElementById('authRegisterCard');
  if (!loginCard || !regCard) return;

  // Clear errors on both cards
  var le = document.getElementById('loginError'); if (le) { le.textContent = ''; le.style.display = 'none'; }
  var re = document.getElementById('regError'); if (re) { re.textContent = ''; re.style.display = 'none'; }

  if (mode === 'login') {
    // Copy email from register → login if register has a value
    var regEmail = document.getElementById('regEmail');
    var loginEmail = document.getElementById('loginEmail');
    if (regEmail && loginEmail && regEmail.value.trim()) {
      loginEmail.value = regEmail.value.trim();
    }
    loginCard.style.display = '';
    regCard.style.display = 'none';
  } else {
    // Copy email from login → register if login has a value
    var lgEmail = document.getElementById('loginEmail');
    var rgEmail = document.getElementById('regEmail');
    if (lgEmail && rgEmail && lgEmail.value.trim()) {
      rgEmail.value = lgEmail.value.trim();
    }
    loginCard.style.display = 'none';
    regCard.style.display = '';
    renderAuthAvatarPicker();
  }
}

function renderAuthAvatarPicker() {
  var container = document.getElementById('authAvatarPick');
  if (!container) return;
  var picks = AVATAR_EMOJIS.slice(0, 16);
  container.innerHTML = picks.map(function(e) {
    return '<button class="auth-avatar-opt' + (e === _authAvatarSelected ? ' selected' : '') +
      '" data-emoji="' + e + '">' + e + '</button>';
  }).join('');

  container.onclick = function(e) {
    var btn = e.target.closest('.auth-avatar-opt');
    if (!btn) return;
    _authAvatarSelected = btn.dataset.emoji;
    renderAuthAvatarPicker();
  };
}

var LOGIN_TIMEOUT_MS = 15000;

function withTimeout(promise, ms) {
  var t = new Promise(function(_, reject) {
    setTimeout(function() { reject(new Error('TIMEOUT')); }, ms);
  });
  return Promise.race([promise, t]);
}

function showAuthLoading(btn) {
  btn.classList.add('loading');
  btn.disabled = true;
}

function hideAuthLoading(btn, text) {
  btn.classList.remove('loading');
  btn.disabled = false;
  btn.textContent = text;
}

function bindAuthEvents() {
  renderAuthAvatarPicker();

  // ---- Card switching ----
  document.getElementById('goRegister').onclick = function() { switchAuthCard('register'); };
  document.getElementById('goLogin').onclick = function() { switchAuthCard('login'); };

  // ---- Helper for login errors ----
  function showLoginErr(msg) {
    var el = document.getElementById('loginError');
    el.textContent = msg; el.style.display = '';
  }
  function showRegErr(msg) {
    var el = document.getElementById('regError');
    el.textContent = msg; el.style.display = '';
  }

  // ---- Sign In ----
  document.getElementById('authSignInBtn').onclick = async function() {
    var btn = document.getElementById('authSignInBtn');
    showLoginErr('');
    var email = document.getElementById('loginEmail').value.trim();
    var pass = document.getElementById('loginPassword').value;
    if (!email || !pass) { showLoginErr('请填写邮箱和密码'); return; }
    if (pass.length < 6) { showLoginErr('密码至少6位'); return; }
    showAuthLoading(btn);
    try {
      var resp = await withTimeout(getSupabase().auth.signInWithPassword({ email: email, password: pass }), LOGIN_TIMEOUT_MS);
      if (resp.error) {
        showLoginErr('邮箱或密码错误');
        hideAuthLoading(btn, '登录');
        return;
      }
      // Success → onAuthStateChange fires → hideAuthUI + onUserReady
      // Keep loading state until redirect completes
    } catch(e) {
      if (e.message === 'TIMEOUT') {
        showLoginErr('登录超时，请检查网络后重试');
      } else {
        showLoginErr('登录失败，请检查网络');
      }
      hideAuthLoading(btn, '登录');
    }
  };

  // ---- Sign Up ----
  document.getElementById('authSignUpBtn').onclick = async function() {
    var btn = document.getElementById('authSignUpBtn');
    showRegErr('');
    var nickname = document.getElementById('regNickname').value.trim();
    var email = document.getElementById('regEmail').value.trim();
    var pass = document.getElementById('regPassword').value;
    if (!nickname) { showRegErr('请填写昵称'); return; }
    if (!email || !pass) { showRegErr('请填写邮箱和密码'); return; }
    if (pass.length < 6) { showRegErr('密码至少6位'); return; }
    showAuthLoading(btn);
    try {
      var resp = await withTimeout(getSupabase().auth.signUp({ email: email, password: pass }), LOGIN_TIMEOUT_MS);

      // Error: email already registered
      if (resp.error) {
        if (resp.error.message && resp.error.message.toLowerCase().indexOf('already') !== -1) {
          showRegErr('该邮箱已注册，请直接登录');
          hideAuthLoading(btn, '注册新账号');
          setTimeout(function() { switchAuthCard('login'); }, 800);
        } else {
          showRegErr(resp.error.message);
          hideAuthLoading(btn, '注册新账号');
        }
        return;
      }

      // Write user profile
      var uid = resp.data.user ? resp.data.user.id : null;
      if (uid) {
        userProfile = { nickname: nickname, avatar: _authAvatarSelected };
        try {
          await getSupabase().from('user_profiles').upsert({
            user_id: uid, nickname: nickname, avatar: _authAvatarSelected,
            updated_at: new Date().toISOString()
          });
          dbCacheSave(uid, 'checkin_cache_profile', userProfile);
        } catch(e) { /* profile write failed, non-critical */ }
        updateAvatarBtn();
      }

      // Auto-login or email confirmation
      if (resp.data.session) {
        // Email confirm disabled — onAuthStateChange fires automatically, no action needed
        // Keep loading state until redirect completes
      } else {
        // Email confirm enabled — session is null, user must confirm first
        showRegErr('注册成功！请查收确认邮件后登录');
        hideAuthLoading(btn, '注册新账号');
        setTimeout(function() { switchAuthCard('login'); }, 1500);
      }
    } catch(e) {
      if (e.message === 'TIMEOUT') {
        showRegErr('注册超时，请检查网络后重试');
      } else {
        showRegErr('注册失败，请检查网络');
      }
      hideAuthLoading(btn, '注册新账号');
    }
  };
}

// ---- User Panel Events ----
function bindUserPanelEvents() {
  var overlay = document.getElementById('userPanelOverlay');
  if (!overlay) return;

  document.getElementById('avatarBtn').onclick = toggleUserPanel;

  overlay.onclick = function(e) {
    if (e.target === overlay) closeUserPanel();
  };

  document.getElementById('userPanelAvatarBtn').onclick = function() {
    openAvatarPicker();
  };

  document.getElementById('userPanelEditAvatar').onclick = function() {
    openAvatarPicker();
  };

  document.getElementById('userPanelEditName').onclick = function() {
    closeUserPanel();
    setTimeout(function() { openNicknameEdit(); }, 300);
  };

  document.getElementById('userPanelLogout').onclick = function() {
    closeUserPanel();
    showToast('本地模式，无需登出');
  };

  document.getElementById('userPanelExport').onclick = function() {
    closeUserPanel();
    exportData();
  };

  document.getElementById('userPanelImport').onclick = function() {
    closeUserPanel();
    document.getElementById('importFileInput').click();
  };

  // Avatar picker modal
  document.getElementById('avatarPickerOverlay').onclick = function(e) {
    if (e.target === document.getElementById('avatarPickerOverlay')) closeAvatarPicker();
  };

  // Nickname edit modal
  document.getElementById('nicknameEditOverlay').onclick = function(e) {
    if (e.target === document.getElementById('nicknameEditOverlay')) closeNicknameEdit();
  };
  document.getElementById('nicknameEditSubmit').onclick = saveNicknameEdit;
}

async function signOutUser() {
  try {
    await getSupabase().auth.signOut();
    authUser = null;
  } catch(e) { /* ignore */ }
}

// Stub: called when user is authenticated and ready
function onUserReady() {
  if (authUser) {
    loadUserProfile(authUser.id).then(function() {
      updateAvatarBtn();
    });
    if (typeof dbLoadAll === 'function') {
      dbLoadAll(authUser.id);
    }
    if (typeof syncOfflineQueue === 'function') syncOfflineQueue();
  }
}
