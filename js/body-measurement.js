/* ================================================================
   body-measurement.js — 身材管理模块
   ================================================================ */

var MEASUREMENT_TYPES = [
  { id: 'weight', name: '体重', unit: 'kg', icon: 'ri-scales-3-fill', color: '#6b7db3' },
  { id: 'waist',  name: '腰围', unit: 'cm', icon: 'ri-contrast-drop-fill', color: '#ec4899' },
  { id: 'arm',    name: '臂围', unit: 'cm', icon: 'ri-user-voice-fill', color: '#22c55e' },
  { id: 'chest',  name: '胸围', unit: 'cm', icon: 'ri-t-shirt-fill', color: '#f59e0b' },
  { id: 'hip',    name: '臀围', unit: 'cm', icon: 'ri-run-fill', color: '#8b5cf6' }
];

var bmRecords = [];
var bmSelectedType = 'weight';
var bmTimeRange = '7d';

function getBmTypeMeta(typeId) {
  return MEASUREMENT_TYPES.find(function(t) { return t.id === typeId; }) || MEASUREMENT_TYPES[0];
}

// ---- Data Layer ----
async function loadBmRecordsOnline() {
  if (isOnline) {
    try {
      var sb = getSupabase();
      var uid = authUser.id;
      var res = await sb.from('body_measurements').select('*').eq('user_id', uid).order('date', { ascending: false });
      if (!res.error) {
        bmRecords = res.data.map(function(r) {
          return { id: r.id.toString(), type: r.type, value: parseFloat(r.value), date: r.date, createdAt: new Date(r.created_at).getTime() };
        });
        if (uid) dbCacheSave(uid, 'checkin_cache_bm_records', bmRecords);
        return;
      }
    } catch(e) {}
  }
  if (authUser) {
    var cached = dbCacheLoad(authUser.id, 'checkin_cache_bm_records');
    if (cached) { bmRecords = cached; return; }
  }
  bmRecords = [];
}

async function saveBmRecordToServer(record) {
  if (isOnline) {
    try {
      await getSupabase().from('body_measurements').upsert({
        id: parseInt(record.id), user_id: authUser.id, type: record.type,
        value: record.value, date: record.date, created_at: new Date(record.createdAt).toISOString()
      });
    } catch(e) {
      queuePush({ _module: 'bodyMeasurement', type: 'upsertRecord', id: parseInt(record.id), type2: record.type, value: record.value, date: record.date, createdAt: record.createdAt });
    }
  } else {
    queuePush({ _module: 'bodyMeasurement', type: 'upsertRecord', id: parseInt(record.id), type2: record.type, value: record.value, date: record.date, createdAt: record.createdAt });
  }
  if (authUser) dbCacheSave(authUser.id, 'checkin_cache_bm_records', bmRecords);
}

async function deleteBmRecordFromServer(recordId) {
  if (isOnline) {
    try { await getSupabase().from('body_measurements').delete().eq('id', parseInt(recordId)).eq('user_id', authUser.id); }
    catch(e) { queuePush({ _module: 'bodyMeasurement', type: 'deleteRecord', id: parseInt(recordId) }); }
  } else { queuePush({ _module: 'bodyMeasurement', type: 'deleteRecord', id: parseInt(recordId) }); }
  if (authUser) dbCacheSave(authUser.id, 'checkin_cache_bm_records', bmRecords);
}

// ---- Time Range Helpers ----
function getBmDateRange() {
  var today = new Date();
  today.setHours(23, 59, 59, 999);
  var start = new Date(today);
  if (bmTimeRange === '7d') start.setDate(start.getDate() - 7);
  else if (bmTimeRange === '30d') start.setDate(start.getDate() - 30);
  else start.setFullYear(start.getFullYear() - 1);
  start.setHours(0, 0, 0, 0);
  return { start: start, end: today };
}

function getBmFilteredRecords(typeId) {
  var range = getBmDateRange();
  var startStr = todayStr(range.start);
  var endStr = todayStr(range.end);
  return bmRecords.filter(function(r) {
    return r.type === typeId && r.date >= startStr && r.date <= endStr;
  }).sort(function(a, b) {
    return a.date.localeCompare(b.date);
  });
}

// ---- SVG Chart Rendering ----
function renderBmChart(container, typeMeta) {
  var records = getBmFilteredRecords(typeMeta.id);
  var color = typeMeta.color;

  // Header
  var latestVal = '--';
  if (records.length > 0) latestVal = records[records.length - 1].value + ' ' + typeMeta.unit;

  var headerHtml = '<div class="bm-chart-header">' +
    '<span class="bm-chart-icon" style="color:' + color + '"><i class="' + typeMeta.icon + '"></i></span>' +
    '<span class="bm-chart-title">' + typeMeta.name + ' (' + typeMeta.unit + ')</span>' +
    '<span class="bm-chart-latest">最新: ' + latestVal + '</span>' +
  '</div>';

  if (records.length === 0) {
    container.innerHTML = headerHtml + '<div class="bm-chart-empty">暂无数据</div>';
    return;
  }

  // Chart dimensions
  var W = 600, H = 160, padL = 48, padR = 16, padT = 12, padB = 26;
  var plotW = W - padL - padR, plotH = H - padT - padB;

  // Y-axis range
  var values = records.map(function(r) { return r.value; });
  var minVal = Math.min.apply(null, values);
  var maxVal = Math.max.apply(null, values);
  if (minVal === maxVal) { minVal = minVal - 1; maxVal = maxVal + 1; }
  var yRange = maxVal - minVal;
  var yPad = yRange * 0.15;
  var yMin = Math.max(0, minVal - yPad);
  var yMax = maxVal + yPad;

  function yPos(v) { return padT + plotH - ((v - yMin) / (yMax - yMin)) * plotH; }
  function xPos(i) { return padL + (records.length === 1 ? plotW / 2 : (i / (records.length - 1)) * plotW); }

  // Y-axis ticks
  var yTicks = 4;
  var yStep = (yMax - yMin) / (yTicks - 1);
  var yTickHtml = '';
  for (var t = 0; t < yTicks; t++) {
    var yv = yMin + yStep * t;
    var yy = yPos(yv);
    yTickHtml += '<text x="' + (padL - 6) + '" y="' + (yy + 4) + '" class="bm-y-label">' + yv.toFixed(1) + ' ' + typeMeta.unit + '</text>';
    yTickHtml += '<line x1="' + padL + '" y1="' + yy.toFixed(1) + '" x2="' + (W - padR) + '" y2="' + yy.toFixed(1) + '" class="bm-grid-line"/>';
  }

  // Line path + dots
  var points = records.map(function(r, i) { return { x: xPos(i), y: yPos(r.value) }; });
  var lineD = points.map(function(p, i) { return (i === 0 ? 'M' : 'L') + p.x.toFixed(1) + ',' + p.y.toFixed(1); }).join(' ');
  var dotsHtml = points.map(function(p) {
    return '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="4" class="bm-dot" fill="' + color + '"/>';
  }).join('');

  // X-axis labels
  var labelHtml = '';
  if (bmTimeRange === '7d') {
    records.forEach(function(r, i) {
      var parts = r.date.split('-');
      labelHtml += '<text x="' + xPos(i).toFixed(1) + '" y="' + (H - 6) + '" class="bm-x-label">' + parseInt(parts[1]) + '/' + parseInt(parts[2]) + '</text>';
    });
  } else if (bmTimeRange === '30d') {
    records.forEach(function(r, i) {
      if (i % Math.max(1, Math.floor(records.length / 7)) === 0 || i === records.length - 1) {
        var parts = r.date.split('-');
        labelHtml += '<text x="' + xPos(i).toFixed(1) + '" y="' + (H - 6) + '" class="bm-x-label">' + parseInt(parts[1]) + '/' + parseInt(parts[2]) + '</text>';
      }
    });
  } else {
    // 1y: show month labels at unique month transitions
    var seenMonths = {};
    records.forEach(function(r, i) {
      var m = r.date.substring(0, 7);
      if (!seenMonths[m]) {
        seenMonths[m] = true;
        var parts = r.date.split('-');
        labelHtml += '<text x="' + xPos(i).toFixed(1) + '" y="' + (H - 6) + '" class="bm-x-label">' + parseInt(parts[1]) + '月</text>';
      }
    });
  }

  var svgHtml = '<svg class="bm-chart-svg" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet">' +
    yTickHtml +
    '<path d="' + lineD + '" class="bm-line" stroke="' + color + '"/>' +
    dotsHtml +
    labelHtml +
  '</svg>';

  container.innerHTML = headerHtml + '<div class="bm-chart-wrap">' + svgHtml + '</div>';
}

function renderAllBmCharts() {
  var container = document.getElementById('bmCharts');
  if (!container) return;
  var html = '';
  MEASUREMENT_TYPES.forEach(function(typeMeta) {
    html += '<div class="bm-chart-section" id="bmChartSection_' + typeMeta.id + '"></div>';
  });
  container.innerHTML = html;
  MEASUREMENT_TYPES.forEach(function(typeMeta) {
    var section = document.getElementById('bmChartSection_' + typeMeta.id);
    if (section) renderBmChart(section, typeMeta);
  });
}

// ---- Add Data Modal ----
function renderBmTypeGrid() {
  var grid = document.getElementById('bmTypeGrid');
  if (!grid) return;
  grid.innerHTML = MEASUREMENT_TYPES.map(function(t) {
    var sel = t.id === bmSelectedType ? ' selected' : '';
    return '<button class="bm-type-opt' + sel + '" data-type="' + t.id + '" style="--cat-color:' + t.color + '">' +
      '<i class="' + t.icon + '" style="color:' + t.color + '"></i>' +
      '<span>' + t.name + '</span></button>';
  }).join('');
  grid.onclick = function(e) {
    var btn = e.target.closest('.bm-type-opt');
    if (!btn) return;
    bmSelectedType = btn.dataset.type;
    renderBmTypeGrid();
  };
}

function openBmAddModal() {
  bmSelectedType = 'weight';
  renderBmTypeGrid();
  document.getElementById('bmValueInput').value = '';
  document.getElementById('bmDateInput').value = todayStr();
  document.getElementById('bmModalOverlay').classList.add('show');
  setTimeout(function() { document.getElementById('bmValueInput').focus(); }, 350);
}

function closeBmModal() {
  document.getElementById('bmModalOverlay').classList.remove('show');
}

async function saveBmRecord() {
  var value = parseFloat(document.getElementById('bmValueInput').value);
  if (isNaN(value) || value <= 0) { showToast('请输入有效数值'); return; }
  if (value > 999) { showToast('数值过大'); return; }
  var dateVal = document.getElementById('bmDateInput').value || todayStr();
  var record = { id: Date.now().toString(), type: bmSelectedType, value: value, date: dateVal, createdAt: Date.now() };
  bmRecords.unshift(record);
  await saveBmRecordToServer(record);
  closeBmModal();
  playDing();
  var meta = getBmTypeMeta(bmSelectedType);
  showToast('已记录：' + meta.name + ' ' + value + ' ' + meta.unit);
  renderAllBmCharts();
}

// ---- Module Registration ----
var bmState = { records: [] };

DataModule({
  id: 'bodyMeasurement',
  state: bmState,
  views: ['viewBodyMeasurement'],
  tables: [{
    cacheKey: 'checkin_cache_bm_records',
    tableName: 'body_measurements',
    orderBy: 'date',
    stateProp: 'records',
    transform: function(rows) {
      return rows.map(function(r) {
        return { id: r.id.toString(), type: r.type, value: parseFloat(r.value), date: r.date, createdAt: new Date(r.created_at).getTime() };
      });
    }
  }],
  actions: {
    upsertRecord: async function(sb, uid, a) {
      await sb.from('body_measurements').upsert({
        id: a.id, user_id: uid, type: a.type2, value: a.value,
        date: a.date, created_at: new Date(a.createdAt).toISOString()
      });
    },
    deleteRecord: async function(sb, uid, a) {
      await sb.from('body_measurements').delete().eq('id', a.id).eq('user_id', uid);
    }
  },
  init: function() {
    bmRecords = bmState.records;
    if (currentView === 'viewBodyMeasurement') renderAllBmCharts();
  },
  render: function(viewName) {
    if (viewName === 'viewBodyMeasurement') renderAllBmCharts();
  },
  fabClick: function() { openBmAddModal(); },
  escape: function() {
    if (document.getElementById('bmModalOverlay').classList.contains('show')) closeBmModal();
  },
  bindEvents: function() {
    document.getElementById('bmModalOverlay').onclick = function(e) {
      if (e.target === document.getElementById('bmModalOverlay')) closeBmModal();
    };
    document.getElementById('bmFormSubmit').onclick = saveBmRecord;
    document.getElementById('bmAddBtn').onclick = openBmAddModal;

    document.getElementById('bmRangeToggle').onclick = function(e) {
      var btn = e.target.closest('.bm-range-opt');
      if (!btn) return;
      bmTimeRange = btn.dataset.range;
      var opts = document.querySelectorAll('#bmRangeToggle .bm-range-opt');
      opts.forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
      renderAllBmCharts();
    };
  },
  onNavigate: function(viewName) {
    if (viewName === 'viewBodyMeasurement') {
      var fab = document.getElementById('fabBtn');
      if (fab) fab.style.display = '';
    }
  },
  migrate: async function(data, sb, uid) {
    if (!data.bodyMeasurements && !data.body_measurements) return { inserted: 0, errors: 0 };
    var records = data.bodyMeasurements || data.body_measurements || [];
    var inserted = 0, errors = 0;
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      var res = await sb.from('body_measurements').upsert({
        id: parseInt(r.id) || (Date.now() + i), user_id: uid, type: r.type,
        value: r.value, date: r.date || todayStr(),
        created_at: new Date(r.createdAt || Date.now()).toISOString()
      });
      if (res.error) errors++; else inserted++;
    }
    return { inserted: inserted, errors: errors };
  },
  export: function() { return { bodyMeasurements: bmState.records }; }
});
