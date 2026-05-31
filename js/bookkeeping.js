/* ================================================================
   bookkeeping.js — 记账模块（Remix Icon + 分类主题色 + SVG趋势图）
   ================================================================ */

// ---- Category Definitions ----
// Expense: 8 distinct theme colors (non-green)
var BK_EXPENSE_CATS = [
  { id: '餐饮', icon: 'ri-restaurant-fill',    color: '#f59e0b' },
  { id: '交通', icon: 'ri-car-fill',           color: '#6366f1' },
  { id: '娱乐', icon: 'ri-gamepad-fill',       color: '#ec4899' },
  { id: '居家', icon: 'ri-home-3-fill',        color: '#8b5cf6' },
  { id: '学习', icon: 'ri-book-read-fill',     color: '#06b6d4' },
  { id: '服饰', icon: 'ri-t-shirt-fill',       color: '#ef4444' },
  { id: '礼物', icon: 'ri-gift-fill',          color: '#f97316' },
  { id: '其他', icon: 'ri-more-fill',          color: '#64748b' }
];

// Income: green shades
var BK_INCOME_CATS = [
  { id: '工资', icon: 'ri-bank-card-fill',       color: '#22c55e' },
  { id: '奖金', icon: 'ri-trophy-fill',          color: '#16a34a' },
  { id: '卖出', icon: 'ri-exchange-dollar-fill', color: '#10b981' },
  { id: '其他', icon: 'ri-more-fill',            color: '#4ade80' }
];

function getBkCatIconHtml(catId, cssClass) {
  var all = BK_EXPENSE_CATS.concat(BK_INCOME_CATS);
  var found = all.find(function(c) { return c.id === catId; });
  var iconCls = found ? found.icon : 'ri-more-fill';
  return '<i class="' + iconCls + (cssClass ? ' ' + cssClass : '') + '"></i>';
}

function getBkCatColor(catId) {
  var all = BK_EXPENSE_CATS.concat(BK_INCOME_CATS);
  var found = all.find(function(c) { return c.id === catId; });
  return found ? found.color : '#64748b';
}

function getBkCatType(catId) {
  var found = BK_INCOME_CATS.find(function(c) { return c.id === catId; });
  return found ? 'income' : 'expense';
}

// ---- State ----
var bkRecords = [];
var bkActiveTab = 'add';
var bkRecordsMonth = null;
var bkEditingRecordId = null;
var bkNoteEditRecordId = null;
var bkStatsPeriod = 'month';
var bkStatsValue = null;
var bkDetailCategory = null;
var bkDetailPeriod = 'month';
var bkDetailValue = null;

// Calculator state
var bkCalcStack = [];
var bkCalcCurrent = '0';
var bkCalcType = null;
var bkCalcCategory = null;

// Swipe state
var bkSwipeCard = null;
var bkSwipeStartX = 0;
var bkSwipeStartY = 0;

// ---- Data Layer ----
async function loadBkRecordsOnline() {
  if (isOnline) {
    try {
      var sb = getSupabase();
      var uid = authUser.id;
      var res = await sb.from('bookkeeping_records').select('*').eq('user_id', uid).order('date', { ascending: false }).order('created_at', { ascending: false });
      if (!res.error) {
        bkRecords = res.data.map(function(r) {
          return { id: r.id.toString(), type: r.type, amount: parseFloat(r.amount), category: r.category, note: r.note || '', date: r.date, createdAt: new Date(r.created_at).getTime() };
        });
        if (uid) dbCacheSave(uid, 'checkin_cache_bk_records', bkRecords);
        return;
      }
    } catch(e) {}
  }
  if (authUser) {
    var cached = dbCacheLoad(authUser.id, 'checkin_cache_bk_records');
    if (cached) { bkRecords = cached; return; }
  }
  bkRecords = [];
}

async function saveBkRecordToServer(record) {
  if (isOnline) {
    try {
      await getSupabase().from('bookkeeping_records').upsert({ id: parseInt(record.id), user_id: authUser.id, type: record.type, amount: record.amount, category: record.category, note: record.note || '', date: record.date, created_at: new Date(record.createdAt).toISOString() });
    } catch(e) {
      queuePush({ _module: 'bookkeeping', type: 'upsertRecord', id: parseInt(record.id), type2: record.type, amount: record.amount, category: record.category, note: record.note, date: record.date, createdAt: record.createdAt });
    }
  } else {
    queuePush({ _module: 'bookkeeping', type: 'upsertRecord', id: parseInt(record.id), type2: record.type, amount: record.amount, category: record.category, note: record.note, date: record.date, createdAt: record.createdAt });
  }
  if (authUser) dbCacheSave(authUser.id, 'checkin_cache_bk_records', bkRecords);
}

async function deleteBkRecordFromServer(recordId) {
  if (isOnline) {
    try { await getSupabase().from('bookkeeping_records').delete().eq('id', parseInt(recordId)).eq('user_id', authUser.id); }
    catch(e) { queuePush({ _module: 'bookkeeping', type: 'deleteRecord', id: parseInt(recordId) }); }
  } else { queuePush({ _module: 'bookkeeping', type: 'deleteRecord', id: parseInt(recordId) }); }
  if (authUser) dbCacheSave(authUser.id, 'checkin_cache_bk_records', bkRecords);
}

// ---- Tab 1: Add Record ----
function renderBkAddView() {
  var expenseHtml = BK_EXPENSE_CATS.map(function(c) {
    return '<button class="bk-cat-btn" data-cat="' + c.id + '" data-type="expense" style="--cat-color:' + c.color + '">' +
      '<i class="bk-cat-icon ' + c.icon + '" style="color:' + c.color + '"></i>' +
      '<span class="bk-cat-label">' + c.id + '</span></button>';
  }).join('');
  document.getElementById('bkExpenseGrid').innerHTML = expenseHtml;

  var incomeHtml = BK_INCOME_CATS.map(function(c) {
    return '<button class="bk-cat-btn" data-cat="' + c.id + '" data-type="income" style="--cat-color:' + c.color + '">' +
      '<i class="bk-cat-icon ' + c.icon + '" style="color:' + c.color + '"></i>' +
      '<span class="bk-cat-label">' + c.id + '</span></button>';
  }).join('');
  document.getElementById('bkIncomeGrid').innerHTML = incomeHtml;

  var allBtns = document.querySelectorAll('#bkAddView .bk-cat-btn');
  allBtns.forEach(function(btn) {
    btn.onclick = function() { openBkAmountModal(btn.dataset.cat, btn.dataset.type); };
  });
}

// ---- Calculator Modal ----
function openBkAmountModal(category, type) {
  bkCalcCategory = category;
  bkCalcType = type;
  bkCalcStack = [];
  bkCalcCurrent = '0';
  bkEditingRecordId = null;

  document.getElementById('bkAmountIcon').className = getBkCatIconClass(category) + ' bk-amount-icon';
  document.getElementById('bkAmountIcon').style.color = getBkCatColor(category);
  document.getElementById('bkAmountCat').textContent = category;
  document.getElementById('bkAmountDisplay').textContent = '0';
  document.getElementById('bkDateInput').value = todayStr();
  document.getElementById('bkNoteInput').value = '';
  document.getElementById('bkAmountOverlay').classList.add('show');
}

function getBkCatIconClass(catId) {
  var all = BK_EXPENSE_CATS.concat(BK_INCOME_CATS);
  var found = all.find(function(c) { return c.id === catId; });
  return found ? found.icon : 'ri-more-fill';
}

function closeBkAmountModal() {
  document.getElementById('bkAmountOverlay').classList.remove('show');
  bkCalcCategory = null;
  bkCalcType = null;
  bkEditingRecordId = null;
}

function updateBkCalcDisplay() {
  var display = document.getElementById('bkAmountDisplay');
  var text = bkCalcCurrent;
  if (bkCalcStack.length > 0) {
    text = bkCalcStack.map(function(s) { return s.type === 'op' ? ' ' + s.val + ' ' : s.val; }).join('') + ' ' + bkCalcCurrent;
  }
  display.textContent = text;
}

function handleBkCalcKey(key) {
  if (key === 'C') { bkCalcStack = []; bkCalcCurrent = '0'; }
  else if (key === '+' || key === '-') {
    if (bkCalcCurrent === '0' && bkCalcStack.length > 0) {
      bkCalcStack[bkCalcStack.length - 1] = { type: 'op', val: key };
    } else {
      bkCalcStack.push({ type: 'num', val: bkCalcCurrent });
      if (bkCalcStack.length >= 2 && bkCalcStack[bkCalcStack.length - 2].type === 'op') {
        var r1 = evalStack();
        bkCalcStack = [];
        bkCalcCurrent = r1;
        bkCalcStack.push({ type: 'num', val: r1 });
      }
      bkCalcStack.push({ type: 'op', val: key });
      bkCalcCurrent = '0';
    }
  } else if (key === '=') {
    bkCalcStack.push({ type: 'num', val: bkCalcCurrent });
    bkCalcCurrent = evalStack();
    bkCalcStack = [];
  } else if (key === '.') {
    if (bkCalcCurrent.indexOf('.') === -1) bkCalcCurrent += '.';
  } else {
    if (bkCalcCurrent === '0') bkCalcCurrent = key;
    else bkCalcCurrent += key;
  }
  updateBkCalcDisplay();
}

function evalStack() {
  var result = parseFloat(bkCalcStack[0].val) || 0;
  for (var i = 1; i < bkCalcStack.length; i += 2) {
    var op = bkCalcStack[i], num = parseFloat(bkCalcStack[i + 1].val) || 0;
    if (op && op.type === 'op') { if (op.val === '+') result += num; else if (op.val === '-') result -= num; }
  }
  return (Math.round(result * 100) / 100).toFixed(2);
}

function saveBkRecord() {
  bkCalcStack.push({ type: 'num', val: bkCalcCurrent });
  var amount = parseFloat(evalStack());
  if (isNaN(amount) || amount <= 0) { showToast('请输入有效金额'); return; }
  if (amount > 99999999) { showToast('金额过大，请重新输入'); return; }
  var dateVal = document.getElementById('bkDateInput').value || todayStr();
  var noteVal = document.getElementById('bkNoteInput').value.trim();
  var record = { id: Date.now().toString(), type: bkCalcType, amount: amount, category: bkCalcCategory, note: noteVal, date: dateVal, createdAt: Date.now() };
  bkRecords.unshift(record);
  saveBkRecordToServer(record);
  closeBkAmountModal();
  playDing();
  showToast('已记录：' + bkCalcCategory + ' ' + amount + '元');
  renderBkRecordsView();
}

// ---- Tab 2: Records Overview ----
function renderBkRecordsView() {
  if (bkActiveTab !== 'records') return;
  if (!bkRecordsMonth) {
    var now = new Date();
    bkRecordsMonth = { year: now.getFullYear(), month: now.getMonth() + 1 };
  }
  renderBkMonthScroll();
  renderBkRecordsContent();
}

function renderBkMonthScroll() {
  var container = document.getElementById('bkMonthScroll');
  var now = new Date();
  var cy = now.getFullYear(), cm = now.getMonth() + 1;
  var months = [];
  for (var y = cy - 2; y <= cy + 1; y++) {
    for (var m = 1; m <= 12; m++) months.push({ year: y, month: m });
  }
  container.innerHTML = months.map(function(mo) {
    var active = mo.year === bkRecordsMonth.year && mo.month === bkRecordsMonth.month;
    return '<button class="bk-month-pill' + (active ? ' active' : '') + '" data-year="' + mo.year + '" data-month="' + mo.month + '">' + mo.year + '年' + mo.month + '月</button>';
  }).join('');
  setTimeout(function() {
    var a = container.querySelector('.bk-month-pill.active');
    if (a) a.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, 100);
  container.onclick = function(e) {
    var p = e.target.closest('.bk-month-pill');
    if (!p) return;
    bkRecordsMonth = { year: parseInt(p.dataset.year), month: parseInt(p.dataset.month) };
    renderBkRecordsView();
  };
}

function renderBkRecordsContent() {
  var prefix = bkRecordsMonth.year + '-' + String(bkRecordsMonth.month).padStart(2, '0');
  var monthRecords = bkRecords.filter(function(r) { return r.date && r.date.indexOf(prefix) === 0; });
  var totalExpense = 0, totalIncome = 0;
  monthRecords.forEach(function(r) { if (r.type === 'expense') totalExpense += r.amount; else totalIncome += r.amount; });
  var balance = totalIncome - totalExpense;
  document.getElementById('bkSummary').innerHTML =
    '<div class="bk-summary-card expense"><div class="bk-sum-label">支出</div><div class="bk-sum-amount">¥ ' + totalExpense.toFixed(2) + '</div></div>' +
    '<div class="bk-summary-card income"><div class="bk-sum-label">收入</div><div class="bk-sum-amount">¥ ' + totalIncome.toFixed(2) + '</div></div>' +
    '<div class="bk-balance' + (balance >= 0 ? ' positive' : ' negative') + '">结余 ' + (balance >= 0 ? '+' : '') + balance.toFixed(2) + '</div>';

  var dayList = document.getElementById('bkDayList');
  var empty = document.getElementById('bkRecordsEmpty');
  if (monthRecords.length === 0) { dayList.innerHTML = ''; empty.style.display = ''; return; }
  empty.style.display = 'none';

  var grouped = {};
  monthRecords.forEach(function(r) { if (!grouped[r.date]) grouped[r.date] = []; grouped[r.date].push(r); });
  var dates = Object.keys(grouped).sort(function(a, b) { return b.localeCompare(a); });

  dayList.innerHTML = dates.map(function(dateStr) {
    var dayRecords = grouped[dateStr];
    var d = new Date(dateStr);
    var dayLabel = dateStr + ' 周' + DAY_LABELS[d.getDay()];
    var itemsHtml = dayRecords.map(function(r) {
      var iconHtml = getBkCatIconHtml(r.category, 'bk-rec-icon');
      var color = getBkCatColor(r.category);
      var title = r.note || r.category;
      var amountCls = r.type === 'expense' ? 'expense' : 'income';
      var prefix2 = r.type === 'expense' ? '-' : '+';
      return '<div class="bk-record-card" data-record-id="' + r.id + '">' +
        '<div class="bk-rec-icon-wrap" data-record-id="' + r.id + '" data-action="edit-cat" style="color:' + color + '">' + iconHtml + '</div>' +
        '<div class="bk-rec-body">' +
          '<div class="bk-rec-title" data-record-id="' + r.id + '" data-action="edit-note">' + escHtml(title) + '</div>' +
          (r.note ? '<div class="bk-rec-note">' + escHtml(r.category) + '</div>' : '') +
        '</div>' +
        '<div class="bk-rec-amount ' + amountCls + '">' + prefix2 + r.amount.toFixed(2) + '</div>' +
        '<button class="bk-rec-delete" data-record-id="' + r.id + '">删除</button>' +
      '</div>';
    }).join('');
    return '<div class="bk-day-group"><div class="bk-day-header">' + dayLabel + '</div>' + itemsHtml + '</div>';
  }).join('');

  bindBkRecordCardEvents();
}

function bindBkRecordCardEvents() {
  var cards = document.querySelectorAll('#bkDayList .bk-record-card');
  cards.forEach(function(card) {
    card.addEventListener('pointerdown', function(e) { bkSwipeStartX = e.clientX; bkSwipeStartY = e.clientY; bkSwipeCard = card; });
    card.addEventListener('pointermove', function(e) {
      if (!bkSwipeCard || bkSwipeCard !== card) return;
      var dx = e.clientX - bkSwipeStartX, dy = Math.abs(e.clientY - bkSwipeStartY);
      if (dy > Math.abs(dx) * 1.5) return;
      if (dx < -30) card.classList.add('swiped');
      else if (dx > 20) card.classList.remove('swiped');
    });
  });
  document.getElementById('bkDayList').onclick = function(e) {
    document.querySelectorAll('#bkDayList .bk-record-card.swiped').forEach(function(c) {
      if (!e.target.closest('.bk-record-card') || e.target.closest('.bk-record-card') !== c) c.classList.remove('swiped');
    });
    var iconWrap = e.target.closest('.bk-rec-icon-wrap');
    if (iconWrap && iconWrap.dataset.action === 'edit-cat') { openBkCatEdit(iconWrap.dataset.recordId); return; }
    var titleEl = e.target.closest('.bk-rec-title');
    if (titleEl && titleEl.dataset.action === 'edit-note') { openBkNoteEdit(titleEl.dataset.recordId); return; }
    var delBtn = e.target.closest('.bk-rec-delete');
    if (delBtn) { confirmDeleteBkRecord(delBtn.dataset.recordId); return; }
  };
}

// ---- Category Edit ----
function openBkCatEdit(recordId) {
  bkEditingRecordId = recordId;
  var rec = bkRecords.find(function(r) { return r.id === recordId; });
  if (!rec) return;

  document.getElementById('bkCatEditExpense').innerHTML = BK_EXPENSE_CATS.map(function(c) {
    var active = c.id === rec.category && rec.type === 'expense';
    return '<button class="bk-cat-btn' + (active ? ' active' : '') + '" data-cat="' + c.id + '" data-type="expense" style="' + (active ? 'border-color:' + c.color + ';background:' + c.color + '18' : '--cat-color:' + c.color) + '">' +
      '<i class="bk-cat-icon ' + c.icon + '" style="color:' + c.color + '"></i>' +
      '<span class="bk-cat-label">' + c.id + '</span></button>';
  }).join('');

  document.getElementById('bkCatEditIncome').innerHTML = BK_INCOME_CATS.map(function(c) {
    var active = c.id === rec.category && rec.type === 'income';
    return '<button class="bk-cat-btn' + (active ? ' active' : '') + '" data-cat="' + c.id + '" data-type="income" style="' + (active ? 'border-color:' + c.color + ';background:' + c.color + '18' : '--cat-color:' + c.color) + '">' +
      '<i class="bk-cat-icon ' + c.icon + '" style="color:' + c.color + '"></i>' +
      '<span class="bk-cat-label">' + c.id + '</span></button>';
  }).join('');

  document.getElementById('bkCatEditOverlay').classList.add('show');
  var btns = document.querySelectorAll('#bkCatEditOverlay .bk-cat-btn');
  btns.forEach(function(btn) { btn.onclick = function() { applyBkCatEdit(btn.dataset.cat, btn.dataset.type); }; });
}

function applyBkCatEdit(cat, type) {
  var r = bkRecords.find(function(r) { return r.id === bkEditingRecordId; });
  if (!r) return;
  r.category = cat; r.type = type;
  saveBkRecordToServer(r);
  document.getElementById('bkCatEditOverlay').classList.remove('show');
  bkEditingRecordId = null;
  renderBkRecordsView();
  showToast('分类已更新');
}

function closeBkCatEdit() { document.getElementById('bkCatEditOverlay').classList.remove('show'); bkEditingRecordId = null; }

// ---- Note Edit ----
function openBkNoteEdit(recordId) {
  bkNoteEditRecordId = recordId;
  var r = bkRecords.find(function(r) { return r.id === recordId; });
  if (!r) return;
  document.getElementById('bkNoteEditInput').value = r.note || '';
  document.getElementById('bkNoteEditOverlay').classList.add('show');
  setTimeout(function() { document.getElementById('bkNoteEditInput').focus(); }, 350);
}

function saveBkNoteEdit() {
  var r = bkRecords.find(function(r) { return r.id === bkNoteEditRecordId; });
  if (!r) return;
  r.note = document.getElementById('bkNoteEditInput').value.trim();
  saveBkRecordToServer(r);
  document.getElementById('bkNoteEditOverlay').classList.remove('show');
  bkNoteEditRecordId = null;
  renderBkRecordsView();
  showToast('备注已更新');
}

function clearBkNote() {
  var r = bkRecords.find(function(r) { return r.id === bkNoteEditRecordId; });
  if (!r) return;
  r.note = '';
  saveBkRecordToServer(r);
  document.getElementById('bkNoteEditOverlay').classList.remove('show');
  bkNoteEditRecordId = null;
  renderBkRecordsView();
  showToast('备注已清除');
}

function closeBkNoteEdit() { document.getElementById('bkNoteEditOverlay').classList.remove('show'); bkNoteEditRecordId = null; }

// ---- Delete Record ----
function confirmDeleteBkRecord(recordId) {
  var r = bkRecords.find(function(r) { return r.id === recordId; });
  if (!r) return;
  document.getElementById('confirmText').textContent = '确定要删除这条记录吗？';
  document.getElementById('confirmDialog').classList.add('show');
  confirmCallback = function() {
    bkRecords = bkRecords.filter(function(r) { return r.id !== recordId; });
    deleteBkRecordFromServer(recordId);
    document.getElementById('confirmDialog').classList.remove('show');
    renderBkRecordsView();
    showToast('记录已删除');
  };
}

// ---- Tab 3: Statistics ----
function renderBkStatsView() {
  if (bkActiveTab !== 'stats') return;
  if (!bkStatsValue) {
    var now = new Date();
    bkStatsPeriod = 'month';
    bkStatsValue = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  }
  renderBkPeriodTabs('bkPeriodTabs', bkStatsPeriod, function(period) { bkStatsPeriod = period; updateBkStatsValue(); renderBkStatsView(); });
  renderBkPeriodScroll('bkPeriodScroll', bkStatsPeriod, bkStatsValue, function(value) { bkStatsValue = value; renderBkRanking(); });
  renderBkRanking();
}

function updateBkStatsValue() {
  var now = new Date();
  if (bkStatsPeriod === 'week') bkStatsValue = getISOWeekStr(now);
  else if (bkStatsPeriod === 'month') bkStatsValue = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  else bkStatsValue = String(now.getFullYear());
}

// ---- Period Tabs ----
function renderBkPeriodTabs(containerId, selectedPeriod, onChange) {
  var container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = [{ id: 'week', label: '周' }, { id: 'month', label: '月' }, { id: 'year', label: '年' }].map(function(p) {
    return '<button class="bk-period-tab' + (p.id === selectedPeriod ? ' active' : '') + '" data-period="' + p.id + '">' + p.label + '</button>';
  }).join('');
  container.onclick = function(e) { var t = e.target.closest('.bk-period-tab'); if (t) onChange(t.dataset.period); };
}

// ---- Period Scroll ----
function renderBkPeriodScroll(containerId, periodType, selectedValue, onChange) {
  var container = document.getElementById(containerId);
  if (!container) return;
  var options = generatePeriodOptions(periodType);
  container.innerHTML = options.map(function(opt) {
    return '<button class="bk-period-pill' + (opt.value === selectedValue ? ' active' : '') + '" data-value="' + opt.value + '">' + opt.label + '</button>';
  }).join('');
  setTimeout(function() { var a = container.querySelector('.bk-period-pill.active'); if (a) a.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' }); }, 100);
  container.onclick = function(e) { var p = e.target.closest('.bk-period-pill'); if (p) onChange(p.dataset.value); };
}

function generatePeriodOptions(periodType) {
  var now = new Date(), options = [];
  if (periodType === 'week') {
    for (var w = -26; w <= 26; w++) { var d = new Date(now); d.setDate(d.getDate() + w * 7); var ws = getISOWeekStr(d); options.push({ value: ws, label: ws.replace('-W', '-') + '周' }); }
  } else if (periodType === 'month') {
    for (var y = now.getFullYear() - 1; y <= now.getFullYear() + 1; y++) {
      for (var m = 1; m <= 12; m++) { options.push({ value: y + '-' + String(m).padStart(2,'0'), label: y + '年' + m + '月' }); }
    }
  } else {
    for (var y2 = now.getFullYear() - 3; y2 <= now.getFullYear() + 1; y2++) { options.push({ value: String(y2), label: y2 + '年' }); }
  }
  return options;
}

function getISOWeekStr(d) {
  var date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  var yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  var weekNo = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return date.getUTCFullYear() + '-W' + String(weekNo).padStart(2, '0');
}

function getPeriodDateRange(periodType, periodValue) {
  if (periodType === 'week') {
    var parts = periodValue.split('-W'), year = parseInt(parts[0]), week = parseInt(parts[1]);
    var jan4 = new Date(Date.UTC(year, 0, 4)), jan4Day = jan4.getUTCDay() || 7;
    var firstThu = new Date(Date.UTC(year, 0, 4 - jan4Day + 1));
    if (jan4Day > 4) firstThu.setUTCDate(firstThu.getUTCDate() + 7);
    var weekStart = new Date(firstThu); weekStart.setUTCDate(weekStart.getUTCDate() + (week - 1) * 7 - 3);
    var days = []; for (var i = 0; i < 7; i++) { var d2 = new Date(weekStart); d2.setUTCDate(d2.getUTCDate() + i); days.push(d2.toISOString().slice(0,10)); }
    return days;
  } else if (periodType === 'month') {
    var p2 = periodValue.split('-'), y2 = parseInt(p2[0]), m2 = parseInt(p2[1]);
    var dim = new Date(y2, m2, 0).getDate(), days2 = [];
    for (var j = 1; j <= dim; j++) days2.push(y2 + '-' + String(m2).padStart(2,'0') + '-' + String(j).padStart(2,'0'));
    return days2;
  } else {
    var y3 = parseInt(periodValue), months = [];
    for (var k = 1; k <= 12; k++) months.push(y3 + '-' + String(k).padStart(2,'0'));
    return months;
  }
}

function getPeriodLabels(periodType, dates) {
  if (periodType === 'week') return dates.map(function(d) { var p = d.split('-'), day = new Date(d).getDay(); return { main: parseInt(p[1]) + '/' + parseInt(p[2]), sub: '周' + DAY_LABELS[day] }; });
  else if (periodType === 'month') return dates.map(function(d) { return { main: parseInt(d.split('-')[2]) }; });
  else return dates.map(function(d) { return { main: parseInt(d.split('-')[1]) + '月' }; });
}

// ---- Ranking (uses per-category colors, no gray background) ----
function renderBkRanking() {
  var container = document.getElementById('bkRanking');
  var empty = document.getElementById('bkStatsEmpty');
  var dates = getPeriodDateRange(bkStatsPeriod, bkStatsValue);
  var dateSet = {};
  dates.forEach(function(d) { dateSet[d] = true; });

  var catTotals = {}, totalExpense = 0;
  bkRecords.forEach(function(r) {
    if (r.type !== 'expense') return;
    if (!dateSet[r.date]) return;
    catTotals[r.category] = (catTotals[r.category] || 0) + r.amount;
    totalExpense += r.amount;
  });

  var entries = [];
  for (var cat in catTotals) {
    if (catTotals.hasOwnProperty(cat)) entries.push({ category: cat, amount: catTotals[cat] });
  }
  entries.sort(function(a, b) { return b.amount - a.amount; });

  if (entries.length === 0) { container.innerHTML = ''; empty.style.display = ''; return; }
  empty.style.display = 'none';

  container.innerHTML = entries.map(function(entry) {
    var iconHtml = getBkCatIconHtml(entry.category, 'bk-rank-icon');
    var color = getBkCatColor(entry.category);
    var pct = totalExpense > 0 ? (entry.amount / totalExpense * 100) : 0;
    var barWidth = entries[0].amount > 0 ? (entry.amount / entries[0].amount * 100) : 0;
    return '<div class="bk-rank-row" data-cat="' + entry.category + '">' +
      '<span style="color:' + color + '">' + iconHtml + '</span>' +
      '<div class="bk-rank-bar-wrap">' +
        '<div class="bk-rank-bar-fill" style="width:' + barWidth + '%;background:' + color + '"></div>' +
        '<span class="bk-rank-amount">¥ ' + entry.amount.toFixed(2) + '</span>' +
      '</div>' +
      '<span class="bk-rank-pct">' + pct.toFixed(0) + '%</span>' +
    '</div>';
  }).join('');

  container.onclick = function(e) { var row = e.target.closest('.bk-rank-row'); if (row) openBkDetail(row.dataset.cat); };
}

// ---- Category Detail View ----
function openBkDetail(category) {
  bkDetailCategory = category;
  bkDetailPeriod = bkStatsPeriod;
  bkDetailValue = bkStatsValue;
  navigateTo('viewBookkeepingDetail');
  renderBkDetailView();
}

function renderBkDetailView() {
  if (currentView !== 'viewBookkeepingDetail') return;
  var title = document.getElementById('headerTitle');
  if (title) title.textContent = bkDetailCategory;
  renderBkPeriodTabs('bkDetailPeriodTabs', bkDetailPeriod, function(period) { bkDetailPeriod = period; updateBkDetailValue(); renderBkDetailView(); });
  renderBkPeriodScroll('bkDetailPeriodScroll', bkDetailPeriod, bkDetailValue, function(value) { bkDetailValue = value; drawBkDetailChart(); });
  drawBkDetailChart();
}

function updateBkDetailValue() {
  var now = new Date();
  if (bkDetailPeriod === 'week') bkDetailValue = getISOWeekStr(now);
  else if (bkDetailPeriod === 'month') bkDetailValue = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  else bkDetailValue = String(now.getFullYear());
}

function drawBkDetailChart() {
  var chartWrap = document.getElementById('bkChartWrap');
  var chart = document.getElementById('bkChart');
  var labelsContainer = document.getElementById('bkChartLabels');
  var empty = document.getElementById('bkDetailEmpty');
  if (!chartWrap || !chart) return;

  var dates = getPeriodDateRange(bkDetailPeriod, bkDetailValue);
  var dataPoints = [];
  for (var i = 0; i < dates.length; i++) {
    var d = dates[i], sum = 0;
    if (bkDetailPeriod === 'year') {
      bkRecords.forEach(function(r) { if (r.type === 'expense' && r.category === bkDetailCategory && r.date && r.date.indexOf(d) === 0) sum += r.amount; });
    } else {
      bkRecords.forEach(function(r) { if (r.type === 'expense' && r.category === bkDetailCategory && r.date === d) sum += r.amount; });
    }
    dataPoints.push(sum);
  }
  var hasData = dataPoints.some(function(v) { return v > 0; });
  if (!hasData) { chartWrap.style.display = 'none'; labelsContainer.innerHTML = ''; if (empty) empty.style.display = ''; return; }
  if (empty) empty.style.display = 'none';
  chartWrap.style.display = '';

  var maxVal = Math.max.apply(null, dataPoints.concat([1]));
  var w = 600, h = 200, pad = 10, n = Math.max(dataPoints.length, 2);
  var points = dataPoints.map(function(v, i) { return { x: pad + i / (n - 1) * (w - 2 * pad), y: h - pad - (v / maxVal) * (h - 2 * pad) }; });
  var lineD = points.map(function(p, i) { return (i === 0 ? 'M' : 'L') + p.x.toFixed(1) + ',' + p.y.toFixed(1); }).join(' ');
  var areaD = lineD + ' L' + points[points.length - 1].x.toFixed(1) + ',' + (h - pad) + ' L' + points[0].x.toFixed(1) + ',' + (h - pad) + ' Z';
  var maxDots = bkDetailPeriod === 'year' ? 12 : (bkDetailPeriod === 'month' ? Math.min(n, 31) : 7);
  var dotStep = Math.max(1, Math.floor(n / maxDots));
  var dots = points.filter(function(p, i) { return i % dotStep === 0 || i === n - 1; }).map(function(p) { return '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="3" class="dot-circle"/>'; }).join('');

  chart.innerHTML =
    '<defs><linearGradient id="bkChartGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#6b7db3" stop-opacity="0.25"/><stop offset="100%" stop-color="#6b7db3" stop-opacity="0.02"/></linearGradient></defs>' +
    '<path d="' + areaD + '" class="area-path"/><path d="' + lineD + '" class="line-path"/>' + dots;

  var labels = getPeriodLabels(bkDetailPeriod, dates);
  var labelIndices;
  if (bkDetailPeriod === 'week') { labelIndices = labels.map(function(l, i) { return i; }); }
  else if (bkDetailPeriod === 'month') {
    labelIndices = [];
    for (var i2 = 0; i2 < labels.length; i2++) { if (i2 % 5 === 0 || i2 === labels.length - 1) labelIndices.push(i2); }
  } else { labelIndices = labels.map(function(l, i) { return i; }); }
  labelsContainer.innerHTML = labelIndices.map(function(i) { var l = labels[i]; return '<div class="bk-chart-label"><span class="label-date">' + l.main + '</span>' + (l.sub ? '<span class="label-day">' + l.sub + '</span>' : '') + '</div>'; }).join('');
}

// ---- Module Registration ----
var bkState = { records: [] };

DataModule({
  id: 'bookkeeping',
  state: bkState,
  views: ['viewBookkeeping', 'viewBookkeepingDetail'],
  tables: [{
    cacheKey: 'checkin_cache_bk_records', tableName: 'bookkeeping_records', orderBy: 'date', stateProp: 'records',
    transform: function(rows) {
      return rows.map(function(r) { return { id: r.id.toString(), type: r.type, amount: parseFloat(r.amount), category: r.category, note: r.note || '', date: r.date, createdAt: new Date(r.created_at).getTime() }; });
    }
  }],
  actions: {
    upsertRecord: async function(sb, uid, a) { await sb.from('bookkeeping_records').upsert({ id: a.id, user_id: uid, type: a.type2, amount: a.amount, category: a.category, note: a.note || '', date: a.date, created_at: new Date(a.createdAt).toISOString() }); },
    deleteRecord: async function(sb, uid, a) { await sb.from('bookkeeping_records').delete().eq('id', a.id).eq('user_id', uid); }
  },
  init: function() { bkRecords = bkState.records; renderBkAddView(); },
  render: function(viewName) {
    if (viewName === 'viewBookkeeping') { renderBkAddView(); if (bkActiveTab === 'records') renderBkRecordsView(); else if (bkActiveTab === 'stats') renderBkStatsView(); }
    else if (viewName === 'viewBookkeepingDetail') { if (bkDetailCategory) renderBkDetailView(); }
  },
  onNavigate: function(viewName) {
    if (viewName === 'viewBookkeeping') {
      bkActiveTab = 'add';
      var items = document.querySelectorAll('#viewBookkeeping .sub-nav-item');
      items.forEach(function(b) { b.classList.remove('active'); });
      if (items[0]) items[0].classList.add('active');
      document.querySelectorAll('#viewBookkeeping .sub-view').forEach(function(v) { v.classList.remove('active'); });
      var addView = document.getElementById('bkAddView'); if (addView) addView.classList.add('active');
      renderBkAddView();
      var now = new Date(); bkRecordsMonth = { year: now.getFullYear(), month: now.getMonth() + 1 };
      var fab = document.getElementById('fabBtn'); if (fab) fab.style.display = 'none';
    } else if (viewName === 'viewBookkeepingDetail') {
      var fab2 = document.getElementById('fabBtn'); if (fab2) fab2.style.display = 'none';
    }
  },
  fabClick: function() {},
  escape: function() {
    if (document.getElementById('bkAmountOverlay').classList.contains('show')) closeBkAmountModal();
    if (document.getElementById('bkCatEditOverlay').classList.contains('show')) closeBkCatEdit();
    if (document.getElementById('bkNoteEditOverlay').classList.contains('show')) closeBkNoteEdit();
  },
  bindEvents: function() {
    document.getElementById('bkAmountOverlay').onclick = function(e) { if (e.target === document.getElementById('bkAmountOverlay')) closeBkAmountModal(); };
    document.getElementById('bkAmountSubmit').onclick = saveBkRecord;
    document.querySelectorAll('#bkAmountOverlay .bk-calc-btn').forEach(function(btn) { btn.onclick = function(e) { e.stopPropagation(); handleBkCalcKey(btn.dataset.key); }; });
    document.getElementById('bkCatEditOverlay').onclick = function(e) { if (e.target === document.getElementById('bkCatEditOverlay')) closeBkCatEdit(); };
    document.getElementById('bkNoteEditOverlay').onclick = function(e) { if (e.target === document.getElementById('bkNoteEditOverlay')) closeBkNoteEdit(); };
    document.getElementById('bkNoteSave').onclick = saveBkNoteEdit;
    document.getElementById('bkNoteClear').onclick = clearBkNote;

    var bkSubNav = document.querySelectorAll('#viewBookkeeping .sub-nav-item');
    bkSubNav.forEach(function(btn) {
      btn.onclick = function() {
        var tab = btn.dataset.bkTab; bkActiveTab = tab;
        bkSubNav.forEach(function(b) { b.classList.remove('active'); }); btn.classList.add('active');
        document.getElementById('bkAddView').classList.toggle('active', tab === 'add');
        document.getElementById('bkRecordsView').classList.toggle('active', tab === 'records');
        document.getElementById('bkStatsView').classList.toggle('active', tab === 'stats');
        var fab = document.getElementById('fabBtn'); if (fab) fab.style.display = 'none';
        if (tab === 'add') renderBkAddView();
        else if (tab === 'records') { if (!bkRecordsMonth) { var now = new Date(); bkRecordsMonth = { year: now.getFullYear(), month: now.getMonth() + 1 }; } renderBkRecordsView(); }
        else if (tab === 'stats') { if (!bkStatsValue) { var now2 = new Date(); bkStatsPeriod = 'month'; bkStatsValue = now2.getFullYear() + '-' + String(now2.getMonth() + 1).padStart(2,'0'); } renderBkStatsView(); }
      };
    });
    document.addEventListener('pointerup', function(e) { if (bkSwipeCard && !e.target.closest('.bk-record-card')) { bkSwipeCard.classList.remove('swiped'); bkSwipeCard = null; } });
  },
  migrate: async function(data, sb, uid) {
    if (!data.bookkeeping) return { inserted: 0, errors: 0 };
    var records = data.bookkeeping, inserted = 0, errors = 0;
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      var res = await sb.from('bookkeeping_records').upsert({ id: parseInt(r.id) || (Date.now() + i), user_id: uid, type: r.type, amount: r.amount, category: r.category, note: r.note || '', date: r.date || todayStr(), created_at: new Date(r.createdAt || Date.now()).toISOString() });
      if (res.error) errors++; else inserted++;
    }
    return { inserted: inserted, errors: errors };
  },
  export: function() { return { bookkeeping: bkState.records }; }
});
