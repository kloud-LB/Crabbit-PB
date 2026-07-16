/* ================================================================
   sleep.js — 睡眠记录模块
   ================================================================ */

var sleepRecords = [];
var slEditingId = null;
var slSelected = {};

// ---- Helpers ----
function timeToMin(t) {
  if (!t) return 0;
  var parts = t.split(':');
  return parseInt(parts[0]) * 60 + parseInt(parts[1]);
}

function minToTime(m) {
  m = ((m % 1440) + 1440) % 1440; // wrap within 0-1439
  return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
}

function calcDuration(sleepTime, wakeTime) {
  var sm = timeToMin(sleepTime);
  var wm = timeToMin(wakeTime);
  if (wm <= sm) wm += 1440; // crossed midnight
  return wm - sm;
}

function fmtDurationShort(min) {
  var h = Math.floor(min / 60), m = min % 60;
  if (h > 0 && m > 0) return h + 'h' + m + 'm';
  if (h > 0) return h + '小时';
  return m + '分钟';
}

function fmtDuration(min) {
  var h = Math.floor(min / 60);
  var m = min % 60;
  if (h > 0 && m > 0) return h + '小时' + m + '分钟';
  if (h > 0) return h + '小时';
  return m + '分钟';
}

// ---- Data Layer ----
function loadSleepRecords() {
  var cached = authUser ? dbCacheLoad(authUser.id, 'checkin_cache_sleep_records') : null;
  if (cached) { sleepRecords = cached; return; }
  sleepRecords = [];
}

function saveSleepRecordToCache() {
  if (authUser) dbCacheSave(authUser.id, 'checkin_cache_sleep_records', sleepRecords);
}

// ---- Clock Dial ----
function renderClockDial(st, wt, color, size) {
  var sm = timeToMin(st), wm = timeToMin(wt);
  if (wm <= sm) wm += 1440;
  var dur = wm - sm;
  var cx = size / 2, cy = size / 2, r = size / 2 - 6;
  // Convert minutes to radians, 0:00 at top, clockwise
  function toRad(min) { return (min / 1440) * 2 * Math.PI - Math.PI / 2; }
  var a1 = toRad(sm), a2 = toRad(wm);
  var large = (wm - sm) > 720 ? 1 : 0;
  var x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
  var x2 = cx + r * Math.cos(a2), y2 = cy + r * Math.sin(a2);
  var centerLabel = fmtDurationShort(dur);

  return '<svg class="sl-dial-svg" width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '">' +
    '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" class="sl-dial-bg"/>' +
    '<path d="M' + cx + ',' + cy + ' L' + x1.toFixed(1) + ',' + y1.toFixed(1) +
      ' A' + r + ',' + r + ' 0 ' + large + ' 1 ' + x2.toFixed(1) + ',' + y2.toFixed(1) + ' Z" ' +
      'fill="' + color + '" opacity="0.35"/>' +
    '<circle cx="' + x1.toFixed(1) + '" cy="' + y1.toFixed(1) + '" r="3" fill="' + color + '"/>' +
    '<circle cx="' + x2.toFixed(1) + '" cy="' + y2.toFixed(1) + '" r="3.5" fill="' + color + '"/>' +
    (dur < 180 ?
      '<text x="' + cx + '" y="' + (cy - r - 6) + '" class="sl-dial-center" fill="' + color + '">' + centerLabel + '</text>' :
      '<text x="' + cx + '" y="' + (cy + 4) + '" class="sl-dial-center" fill="' + color + '">' + centerLabel + '</text>') +
  '</svg>';
}

// ---- Today Card ----
function renderTodayCard() {
  var container = document.getElementById('slTodayCard');
  if (!container) return;
  var today = todayStr();
  var todayRecords = sleepRecords.filter(function(r) { return r.date === today; });
  var main = todayRecords.filter(function(r) { return r.type === 'main'; });
  // Pick the longest main sleep for today
  var best = null;
  main.forEach(function(r) {
    if (!best || r.duration_min > best.duration_min) best = r;
  });

  if (!best) {
    container.innerHTML = '<div class="sl-card-inner">' +
      '<div class="sl-card-label">今日主睡眠</div>' +
      '<div class="sl-card-empty">暂无记录</div></div>';
  } else {
    var dial = renderClockDial(best.sleep_time.substring(0,5), best.wake_time.substring(0,5), '#8b5cf6', 140);
    container.innerHTML = '<div class="sl-card-inner">' +
      '<div class="sl-card-label">今日主睡眠 <span class="sl-card-date">' + parseInt(today.split('-')[1]) + '月' + parseInt(today.split('-')[2]) + '日</span></div>' +
      '<div class="sl-main-row">' +
        dial +
        '<div class="sl-main-info">' +
          '<div class="sl-main-dur">' + fmtDuration(best.duration_min) + '</div>' +
          '<div class="sl-main-times">' +
            '<span><i class="ri-moon-fill"></i> ' + best.sleep_time.substring(0,5) + '</span>' +
            '<span><i class="ri-sun-fill"></i> ' + best.wake_time.substring(0,5) + '</span>' +
          '</div>' +
          '<div class="sl-tags-row">' +
            (best.rating ? '<span class="sl-tag sl-tag-main">' + best.rating + '</span>' : '') +
            (best.quality ? '<span class="sl-tag sl-tag-main">' + best.quality + '</span>' : '') +
          '</div>' +
          '<button class="sl-card-edit" id="slEditToday"><i class="ri-edit-fill"></i> 编辑</button>' +
        '</div>' +
      '</div></div>';
  }
}

// ---- Nap Card ----
function renderNapCard() {
  var container = document.getElementById('slNapCard');
  if (!container) return;
  var today = todayStr();
  var naps = sleepRecords.filter(function(r) { return r.date === today && r.type === 'nap'; });
  var totalNap = naps.reduce(function(s, r) { return s + r.duration_min; }, 0);

  if (naps.length === 0) {
    container.innerHTML = '<div class="sl-card-inner">' +
      '<div class="sl-card-label sl-nap-label">今日小憩</div>' +
      '<div class="sl-card-empty">暂无记录</div></div>';
  } else {
    var dialsHtml = naps.map(function(n) {
      return '<div class="sl-nap-dial-item">' +
        renderClockDial(n.sleep_time.substring(0,5), n.wake_time.substring(0,5), '#f59e0b', 90) +
        '<div class="sl-nap-dial-time">' + n.sleep_time.substring(0,5) + '-' + n.wake_time.substring(0,5) + '</div>' +
      '</div>';
    }).join('');
    var totalHtml = '<div class="sl-nap-total">合计 ' + fmtDuration(totalNap) + ' · ' + naps.length + '次</div>';
    var tagsHtml = '';
    var lastNap = naps[naps.length - 1];
    if (lastNap.rating || lastNap.quality) {
      tagsHtml = '<div class="sl-tags-row">' +
        (lastNap.rating ? '<span class="sl-tag sl-tag-nap">' + lastNap.rating + '</span>' : '') +
        (lastNap.quality ? '<span class="sl-tag sl-tag-nap">' + lastNap.quality + '</span>' : '') +
      '</div>';
    }
    container.innerHTML = '<div class="sl-card-inner">' +
      '<div class="sl-card-label sl-nap-label">今日小憩 <span class="sl-nap-count">共 ' + naps.length + ' 次</span></div>' +
      totalHtml +
      '<div class="sl-nap-dials">' + dialsHtml + '</div>' +
      tagsHtml + '</div>';
  }
}

// ---- Stats Card ----
function renderStatsCard() {
  var container = document.getElementById('slStatsCard');
  if (!container) return;
  var now = new Date();
  var weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 6);
  var startStr = todayStr(weekAgo);
  var endStr = todayStr(now);

  var weekMains = sleepRecords.filter(function(r) {
    return r.type === 'main' && r.date >= startStr && r.date <= endStr;
  });

  if (weekMains.length === 0) {
    container.innerHTML = '<div class="sl-card-inner">' +
      '<div class="sl-card-label">近一周统计</div>' +
      '<div class="sl-card-empty">暂无数据</div></div>';
    return;
  }

  var totalDur = 0;
  var sleepMins = [];
  var wakeMins = [];
  weekMains.forEach(function(r) {
    totalDur += r.duration_min;
    var sm = timeToMin(r.sleep_time);
    if (sm < 720) sm += 1440; // normalize after-midnight times
    sleepMins.push(sm);
    var wm = timeToMin(r.wake_time);
    if (wm < 720) wm += 1440;
    wakeMins.push(wm);
  });

  var avgDur = Math.round(totalDur / weekMains.length);
  var avgSleep = Math.round(sleepMins.reduce(function(a, b) { return a + b; }, 0) / sleepMins.length);
  var avgWake = Math.round(wakeMins.reduce(function(a, b) { return a + b; }, 0) / wakeMins.length);

  container.innerHTML = '<div class="sl-card-inner">' +
    '<div class="sl-card-label">近一周统计</div>' +
    '<div class="sl-stats-grid">' +
      '<div class="sl-stat-item"><span class="sl-stat-val">' + fmtDuration(avgDur) + '</span><span class="sl-stat-lbl">平均睡眠</span></div>' +
      '<div class="sl-stat-item"><span class="sl-stat-val">' + minToTime(avgSleep) + '</span><span class="sl-stat-lbl">平均入睡</span></div>' +
      '<div class="sl-stat-item"><span class="sl-stat-val">' + minToTime(avgWake) + '</span><span class="sl-stat-lbl">平均起床</span></div>' +
    '</div></div>';
}

// ---- Add/Edit Modal ----
function openSleepModal(editId) {
  slEditingId = editId || null;
  slSelected = { type: 'main', rating: '', quality: '' };

  if (editId) {
    var r = sleepRecords.find(function(x) { return x.id === editId; });
    if (!r) return;
    slSelected = { type: r.type, rating: r.rating || '', quality: r.quality || '' };
    document.getElementById('slDateInput').value = r.date;
    document.getElementById('slSleepTimeInput').value = r.sleep_time.substring(0,5);
    document.getElementById('slWakeTimeInput').value = r.wake_time.substring(0,5);
    document.getElementById('slModalTitle').textContent = '编辑睡眠记录';
  } else {
    document.getElementById('slDateInput').value = todayStr();
    document.getElementById('slSleepTimeInput').value = '23:00';
    document.getElementById('slWakeTimeInput').value = '07:00';
    document.getElementById('slModalTitle').textContent = '新增睡眠记录';
  }

  updateSlTypeUI();
  updateSlOptUI();
  updateSlDurationPreview();
  document.getElementById('slModalOverlay').classList.add('show');
}

function updateSlTypeUI() {
  var btns = document.querySelectorAll('#slTypeToggle .sl-type-opt');
  btns.forEach(function(b) { b.classList.toggle('selected', b.dataset.type === slSelected.type); });
}

function updateSlOptUI() {
  var ratingBtns = document.querySelectorAll('#slRatingRow .sl-opt-btn');
  ratingBtns.forEach(function(b) { b.classList.toggle('selected', b.dataset.val === slSelected.rating); });
  var qualityBtns = document.querySelectorAll('#slQualityRow .sl-opt-btn');
  qualityBtns.forEach(function(b) { b.classList.toggle('selected', b.dataset.val === slSelected.quality); });
}

function updateSlDurationPreview() {
  var st = document.getElementById('slSleepTimeInput').value;
  var wt = document.getElementById('slWakeTimeInput').value;
  var preview = document.getElementById('slDurationPreview');
  if (!st || !wt) { preview.textContent = ''; return; }
  var dur = calcDuration(st, wt);
  preview.textContent = '预计睡眠时长：' + fmtDuration(dur);
}

function closeSleepModal() {
  document.getElementById('slModalOverlay').classList.remove('show');
  slEditingId = null;
}

function saveSleepRecord() {
  var type = slSelected.type;
  var dateVal = document.getElementById('slDateInput').value || todayStr();
  var st = document.getElementById('slSleepTimeInput').value;
  var wt = document.getElementById('slWakeTimeInput').value;
  if (!st || !wt) { showToast('请填写入睡和起床时间'); return; }
  var dur = calcDuration(st, wt);
  if (dur <= 0) { showToast('入睡和起床时间有误'); return; }

  var record = {
    id: slEditingId || Date.now().toString(),
    type: type, sleep_time: st, wake_time: wt, duration_min: dur,
    date: dateVal, rating: slSelected.rating, quality: slSelected.quality,
    createdAt: Date.now()
  };

  if (slEditingId) {
    var idx = sleepRecords.findIndex(function(x) { return x.id === slEditingId; });
    if (idx >= 0) sleepRecords[idx] = record;
  } else {
    sleepRecords.push(record);
  }
  saveSleepRecordToCache();
  closeSleepModal();
  playDing();
  showToast(slEditingId ? '已更新' : '已记录');
  renderSleepView();
}

// ---- Render All ----
function renderSleepView() {
  loadSleepRecords();
  renderTodayCard();
  renderNapCard();
  renderStatsCard();
}

// ---- Module Registration ----
var slState = { records: [] };

DataModule({
  id: 'sleep',
  state: slState,
  views: ['viewSleep'],
  tables: [{
    cacheKey: 'checkin_cache_sleep_records', tableName: 'sleep_records', orderBy: 'date', stateProp: 'records',
    transform: function(rows) {
      return rows.map(function(r) {
        return { id: r.id.toString(), type: r.type, sleep_time: r.sleep_time, wake_time: r.wake_time,
          duration_min: r.duration_min, date: r.date, rating: r.rating, quality: r.quality,
          createdAt: new Date(r.created_at).getTime() };
      });
    }
  }],
  actions: {
    upsertRecord: async function(pb, uid, a) {
      pbUpsert('sleep_records', {
        id: parseInt(a.id), user_id: uid, type: a.type, sleep_time: a.sleep_time,
        wake_time: a.wake_time, duration_min: a.duration_min, date: a.date,
        rating: a.rating, quality: a.quality, created_at: new Date(a.createdAt).toISOString()
      }, 'id="' + pbEscape(String(parseInt(a.id))) + '"');
    },
    deleteRecord: async function(pb, uid, a) {
      await pb.collection('sleep_records').delete(String(a.id));
    }
  },
  init: function() {
    sleepRecords = slState.records || [];
    if (currentView === 'viewSleep') renderSleepView();
  },
  render: function(viewName) {
    if (viewName === 'viewSleep') renderSleepView();
  },
  fabClick: function() { openSleepModal(); },
  onNavigate: function(viewName) {
    if (viewName === 'viewSleep') {
      var fab = document.getElementById('fabBtn');
      if (fab) fab.style.display = '';
    }
  },
  escape: function() {
    if (document.getElementById('slModalOverlay').classList.contains('show')) closeSleepModal();
  },
  bindEvents: function() {
    document.getElementById('slModalOverlay').onclick = function(e) {
      if (e.target === document.getElementById('slModalOverlay')) closeSleepModal();
    };
    document.getElementById('slFormSubmit').onclick = saveSleepRecord;

    // Type toggle
    document.getElementById('slTypeToggle').onclick = function(e) {
      var btn = e.target.closest('.sl-type-opt');
      if (!btn) return;
      slSelected.type = btn.dataset.type;
      updateSlTypeUI();
    };

    // Rating/quality selection
    document.getElementById('slRatingRow').onclick = function(e) {
      var btn = e.target.closest('.sl-opt-btn');
      if (!btn) return;
      slSelected.rating = (slSelected.rating === btn.dataset.val) ? '' : btn.dataset.val;
      updateSlOptUI();
    };
    document.getElementById('slQualityRow').onclick = function(e) {
      var btn = e.target.closest('.sl-opt-btn');
      if (!btn) return;
      slSelected.quality = (slSelected.quality === btn.dataset.val) ? '' : btn.dataset.val;
      updateSlOptUI();
    };

    // Duration preview
    document.getElementById('slSleepTimeInput').addEventListener('input', updateSlDurationPreview);
    document.getElementById('slWakeTimeInput').addEventListener('input', updateSlDurationPreview);

    // Today card edit button (delegated)
    document.getElementById('slTodayCard').onclick = function(e) {
      if (e.target.closest('#slEditToday')) {
        var today = todayStr();
        var main = sleepRecords.filter(function(r) { return r.date === today && r.type === 'main'; });
        var best = null;
        main.forEach(function(r) { if (!best || r.duration_min > best.duration_min) best = r; });
        if (best) openSleepModal(best.id);
      }
    };
  },
  migrate: async function(data, sb, uid) {
    if (!data.sleepRecords) return { inserted: 0, errors: 0 };
    var items = data.sleepRecords, inserted = 0, errors = 0;
    for (var i = 0; i < items.length; i++) {
      var r = items[i];
      var res = pbUpsert('sleep_records', {
        id: parseInt(r.id) || (Date.now() + i), user_id: uid, type: r.type || 'main',
        sleep_time: r.sleep_time, wake_time: r.wake_time,
        duration_min: r.duration_min || 480, date: r.date || todayStr(),
        rating: r.rating, quality: r.quality,
        created_at: new Date(r.createdAt || Date.now()).toISOString()
      }, 'id="' + pbEscape(String(parseInt(r.id) || (Date.now() + i))) + '"');
      inserted++;
    }
    return { inserted: inserted, errors: errors };
  },
  export: function() { return { sleepRecords: slState.records }; }
});
