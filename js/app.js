/* ================================================================
   app.js — 应用入口（常量、状态、主题、音效、路由、初始化）
   ================================================================ */

// ---- Shortcuts ----
const $ = function(s, p) { return (p || document).querySelector(s); };
const $$ = function(s, p) { return [].slice.call((p || document).querySelectorAll(s)); };

// ---- Constants ----
const COLORS = ['#6b7db3','#ec4899','#f59e0b','#22c55e','#06b6d4','#ef4444','#8b5cf6','#f97316'];
const MONTHS = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
const DAY_LABELS = ['日','一','二','三','四','五','六'];
const DEBOUNCE_MS = 300;

// ---- State ----
let tasks = [];
let history = {};
let currentView = 'viewHome';
let previousView = null;
let statsYear = new Date().getFullYear();
let editingTaskId = null;
let backfillTaskId = null;
let lastClickTime = {};
let confirmCallback = null;
let audioCtx = null;
let toastTimer = null;
let todoCategories = [];
let todoItems = [];
let todoFilterCategory = 'all';
let editingTodoId = null;
let editingCatId = null;
let postponeTodoId = null;

// ---- Helpers ----
function todayStr(d) {
  var t = d || new Date();
  return t.getFullYear() + '-' + String(t.getMonth()+1).padStart(2,'0') + '-' + String(t.getDate()).padStart(2,'0');
}
function fmtDate(str) {
  var parts = str.split('-');
  return parts[0] + '年' + parseInt(parts[1]) + '月' + parseInt(parts[2]) + '日';
}
function weekday(str) { return DAY_LABELS[new Date(str).getDay()]; }

function escHtml(s) {
  var d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

// ---- Export / Import (v2: exports from local cache) ----
function exportData() {
  var data = dbExportAll();
  var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'checkin_backup_' + todayStr() + '.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('数据已导出为 JSON 文件');
}

// ---- Theme ----
function initTheme() {
  var saved = localStorage.getItem('checkin_theme');
  var theme;
  if (saved === 'dark' || saved === 'light') theme = saved;
  else theme = window.matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light';
  applyTheme(theme);
}

function applyTheme(theme) {
  document.body.dataset.theme = theme;
  var btn = $('#themeBtn');
  if (btn) { btn.innerHTML = theme === 'dark' ? '<i class="ri-sun-fill"></i>' : '<i class="ri-moon-fill"></i>'; }
  localStorage.setItem('checkin_theme', theme);
}

function toggleTheme() {
  var next = document.body.dataset.theme === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  if (currentView === 'viewCheckin') renderStats();
}

// ---- Sound ----
function playDing() {
  try {
    var C = window.AudioContext || window.webkitAudioContext;
    if (!C) return;
    if (!audioCtx) audioCtx = new C();
    var o = audioCtx.createOscillator();
    var g = audioCtx.createGain();
    o.connect(g); g.connect(audioCtx.destination);
    o.type = 'sine';
    o.frequency.setValueAtTime(1200, audioCtx.currentTime);
    o.frequency.exponentialRampToValueAtTime(600, audioCtx.currentTime + 0.08);
    g.gain.setValueAtTime(0.18, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.25);
    o.start(audioCtx.currentTime);
    o.stop(audioCtx.currentTime + 0.25);
  } catch(e) {}
}

function playUndo() {
  try {
    var C = window.AudioContext || window.webkitAudioContext;
    if (!C) return;
    if (!audioCtx) audioCtx = new C();
    var o = audioCtx.createOscillator();
    var g = audioCtx.createGain();
    o.connect(g); g.connect(audioCtx.destination);
    o.type = 'sine';
    o.frequency.setValueAtTime(500, audioCtx.currentTime);
    o.frequency.exponentialRampToValueAtTime(300, audioCtx.currentTime + 0.1);
    g.gain.setValueAtTime(0.12, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.2);
    o.start(audioCtx.currentTime);
    o.stop(audioCtx.currentTime + 0.2);
  } catch(e) {}
}

// ---- Toast ----
function showToast(msg, duration) {
  duration = duration || 1800;
  var el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function() { el.classList.remove('show'); }, duration);
}

// ---- Checkmark Animation ----
function showCheckmark(card) {
  var rect = card.getBoundingClientRect();
  var cx = rect.left + rect.width / 2;
  var cy = rect.top + rect.height / 2;
  var div = document.createElement('div');
  div.className = 'checkmark-anim';
  div.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;z-index:50;pointer-events:none';
  var circle = document.createElement('div');
  circle.className = 'circle';
  circle.style.cssText = 'position:absolute;left:' + (cx - 30) + 'px;top:' + (cy - 30) + 'px';
  circle.innerHTML = '<span class="check">✓</span>';
  div.appendChild(circle);
  document.body.appendChild(div);
  setTimeout(function() { div.remove(); }, 600);
}

// ---- Navigation ----
const VIEW_TITLES = {
  'viewHome': '主页',
  'viewCheckin': '打卡',
  'viewTodo': '待办',
  'viewBookkeeping': '记账',
  'viewBookkeepingDetail': '记账详情',
  'viewBodyMeasurement': '身材管理',
  'viewDiet': '吃喝拉撒',
  'viewSleep': '睡眠记录',
  'viewAgentChat': '🦀 蟹老板'
};

function navigateTo(viewName) {
  previousView = currentView;
  currentView = viewName;

  // Update views
  $$('.view').forEach(function(v) { v.classList.remove('active'); });
  var target = document.getElementById(viewName);
  if (target) target.classList.add('active');

  // Update back button
  var backBtn = $('#backBtn');
  if (viewName === 'viewHome') {
    backBtn.classList.remove('visible');
  } else {
    backBtn.classList.add('visible');
  }

  // Update header title
  var title = $('#headerTitle');
  if (title) title.textContent = VIEW_TITLES[viewName] || '';

  // Update FAB visibility
  updateFabVisibility(viewName);

  // Notify modules to render
  dbRenderView(viewName);

  // Module-specific after-navigate hooks
  for (var modId in __modules) {
    var mod = __modules[modId];
    if (typeof mod.onNavigate === 'function') {
      try { mod.onNavigate(viewName, previousView); } catch(e) {}
    }
  }
}

function navigateBack() {
  if (currentView === 'viewHome') return;
  // If on bookkeeping detail, go back to bookkeeping
  if (currentView === 'viewBookkeepingDetail') {
    navigateTo('viewBookkeeping');
    return;
  }
  navigateTo('viewHome');
}

function updateFabVisibility(viewName) {
  var fab = $('#fabBtn');
  if (!fab) return;
  if (viewName === 'viewHome') {
    fab.style.display = 'none';
  } else {
    fab.style.display = '';
  }
}

function switchView(viewName) {
  // Legacy compatibility — delegate to navigateTo
  navigateTo(viewName);
}

// ---- Event Bindings ----
function bindEvents() {
  $('#themeBtn').onclick = toggleTheme;
  $('#backBtn').onclick = navigateBack;

  // Home card clicks
  $$('.home-card').forEach(function(card) {
    card.onclick = function() {
      var nav = card.dataset.nav;
      if (nav === 'checkin') navigateTo('viewCheckin');
      else if (nav === 'todo') navigateTo('viewTodo');
      else if (nav === 'bookkeeping') navigateTo('viewBookkeeping');
      else if (nav === 'body') navigateTo('viewBodyMeasurement');
      else if (nav === 'diet') navigateTo('viewDiet');
      else if (nav === 'sleep') navigateTo('viewSleep');
      else if (nav === 'agent') navigateTo('viewAgentChat');
    };
    // Ripple effect
    card.addEventListener('pointerdown', function(e) {
      if (card.classList.contains('disabled')) return;
      var ripple = document.createElement('div');
      ripple.className = 'ripple';
      ripple.style.cssText = 'position:absolute;border-radius:50%;background:rgba(107,125,179,0.2);animation:ripple 0.6s ease-out forwards;pointer-events:none';
      var rect = card.getBoundingClientRect();
      var size = Math.max(rect.width, rect.height);
      ripple.style.width = ripple.style.height = size + 'px';
      ripple.style.left = (e.clientX - rect.left - size/2) + 'px';
      ripple.style.top = (e.clientY - rect.top - size/2) + 'px';
      card.appendChild(ripple);
      setTimeout(function() { ripple.remove(); }, 600);
    });
  });

  // FAB
  $('#fabBtn').onclick = function(e) {
    var ripple = document.createElement('div');
    ripple.className = 'ripple';
    e.currentTarget.appendChild(ripple);
    setTimeout(function() { ripple.remove(); }, 600);
    for (var modId in __modules) {
      var mod = __modules[modId];
      if (mod.views && mod.views.indexOf(currentView) !== -1 && mod.fabClick) {
        mod.fabClick();
        return;
      }
    }
    // Default: go home
    navigateTo('viewHome');
  };

  // Confirm dialog (shared)
  $('#confirmCancel').onclick = function() { $('#confirmDialog').classList.remove('show'); confirmCallback = null; };
  $('#confirmOk').onclick = function() { if (confirmCallback) confirmCallback(); };
  $('#confirmDialog').onclick = function(e) {
    if (e.target === $('#confirmDialog')) { $('#confirmDialog').classList.remove('show'); confirmCallback = null; }
  };

  // Stats year switcher
  $('#yearPrev').onclick = function() { statsYear--; renderStats(); };
  $('#yearNext').onclick = function() { statsYear++; renderStats(); };

  // Export / Import — moved to user panel

  // Keyboard
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      if ($('#confirmDialog').classList.contains('show')) { $('#confirmDialog').classList.remove('show'); confirmCallback = null; return; }
      if ($('#userPanelOverlay').classList.contains('show')) { closeUserPanel(); return; }
      if ($('#avatarPickerOverlay').classList.contains('show')) { closeAvatarPicker(); return; }
      if ($('#nicknameEditOverlay').classList.contains('show')) { closeNicknameEdit(); return; }
      for (var modId in __modules) {
        if (__modules[modId].escape) __modules[modId].escape();
      }
    }
  });

  // System theme change
  window.matchMedia('(prefers-color-scheme:dark)').addEventListener('change', function(e) {
    var saved = localStorage.getItem('checkin_theme');
    if (!saved || saved === 'auto') {
      applyTheme(e.matches ? 'dark' : 'light');
      if (currentView === 'viewCheckin') renderStats();
    }
  });
}

// ---- Init ----
async function init() {
  initTheme();
  initOffline();

  // Format header date
  var now = new Date();
  var hd = $('#headerDate');
  if (hd) hd.textContent = now.getFullYear() + '年' + (now.getMonth()+1) + '月' + now.getDate() + '日 周' + DAY_LABELS[now.getDay()];

  // Default: show home
  navigateTo('viewHome');

  bindEvents();
  bindModuleEvents();
  bindUserPanelEvents();

  // Auth required — login via PocketBase
  var loggedIn = await initAuth();
  if (!loggedIn) return;

  onUserReady();

  // V3: 页面可见时自动刷新数据（Agent 可能在后台写入了新数据）
  document.addEventListener('visibilitychange', function() {
    if (!document.hidden && authUser) {
      try {
        var pb = getPB();
        dbRefreshAllCaches(pb, authUser.id).then(function() {
          // 重新装载
          for (var modId in __modules) {
            var mod = __modules[modId];
            if (!mod.tables) continue;
            mod.tables.forEach(function(t) {
              var fresh = dbCacheLoad(authUser.id, t.cacheKey);
              if (fresh !== null && fresh !== undefined) {
                mod.state[t.stateProp] = fresh;
              }
            });
          }
          dbEmit('data-refreshed', {});
          if (typeof renderStats === 'function') renderStats();
        });
      } catch(e) {}
    }
  });

  // V3: 连接 Agent WebSocket（PWA 内嵌对话窗口）
  if (typeof agentConnect === 'function') {
    setTimeout(function() { agentConnect(); }, 2000);
  }

  // Bind migration import
  bindMigrateImport();
}

function bindModuleEvents() {
  for (var modId in __modules) {
    var mod = __modules[modId];
    if (typeof mod.bindEvents === 'function') {
      try { mod.bindEvents(); } catch(e) {}
    }
  }
}

document.addEventListener('DOMContentLoaded', init);
