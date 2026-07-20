/* ================================================================
   diet.js — 吃喝拉撒模块（进食 / 喝水 / 拉屎）
   ================================================================ */

var foodItems = [];
var dietSettings = { daily_calorie_target: 8000 };
var dietDate = todayStr();
var dietActiveTab = 'eating';
var dietEditingId = null;
var dietAddMealType = 'breakfast';
var drinkRecords = [];
var drinkTarget = 2500;
var drinkPouring = false;
var bathroomRecords = [];
var brSelected = {};
var brEditingId = null;
var brViewDate = new Date();

var BR_OPTIONS = {
  shape:    ['兔便状','葡萄串','玉米棒','香蕉','烤鸡块','麦片粥','肉汁','软硬交替'],
  color:    ['黄色','浅咖啡色','咖啡色','深咖啡色','黑色','红色'],
  amount:   ['非常少','少量','一般','大量'],
  feeling:  ['轻松','困难','疼痛'],
  smell:    ['几乎不臭','有点臭','味道刺鼻','臭得惊人'],
  duration: ['2分钟','5分钟','10分钟','20分钟','40分钟']
};

var MEAL_LABELS = { breakfast: '早餐', lunch: '午餐', dinner: '晚饭', snack: '加餐' };
var MEAL_ORDER = ['breakfast', 'lunch', 'dinner', 'snack'];

// ---- Helpers ----
function macroPct(carbs, protein, fat) {
  var c = (carbs || 0) * 17, p = (protein || 0) * 17, f = (fat || 0) * 38;
  var total = c + p + f;
  if (total <= 0) return { carbs: 0, protein: 0, fat: 0 };
  return {
    carbs: Math.round(c / total * 100),
    protein: Math.round(p / total * 100),
    fat: Math.round(f / total * 100)
  };
}

function fmtKj(v) {
  return (v || 0).toLocaleString('zh-CN', { maximumFractionDigits: 0 });
}

// ---- Data Layer ----
function loadDietSettings() {
  var cached = authUser ? dbCacheLoad(authUser.id, 'checkin_cache_diet_settings') : null;
  if (cached) { dietSettings = cached; return; }
  dietSettings = { daily_calorie_target: 8000 };
}

async function saveDietSettings() {
  dbCacheSave(authUser.id, 'checkin_cache_diet_settings', dietSettings);
  if (isOnline) {
    try {
      await pbUpsert('diet_settings', {
        user_id: authUser.id, daily_calorie_target: dietSettings.daily_calorie_target,
        updated_at: new Date().toISOString()
      }, 'user_id="' + pbEscape(authUser.id) + '"');
    } catch(e) {}
  }
}

async function loadFoodItemsOnline() {
  if (isOnline) {
    try {
      var pb = getPB();
      var uid = authUser.id;
      var res = await pb.collection('food_items').getFullList({filter: 'user_id="' + pbEscape(uid) + '"', sort: '+created_at'});
      
        foodItems = res.map(function(r) {
          return { id: r.id.toString(), mealType: r.meal_type, name: r.name, weight: parseFloat(r.weight) || 0,
            calories: parseFloat(r.calories), carbs: parseFloat(r.carbs) || 0, protein: parseFloat(r.protein) || 0,
            fat: parseFloat(r.fat) || 0, date: r.date, createdAt: new Date(r.created_at).getTime() };
        });
        if (uid) dbCacheSave(uid, 'checkin_cache_food_items', foodItems);
        return;
    } catch(e) {}
  }
  if (authUser) {
    var cached = dbCacheLoad(authUser.id, 'checkin_cache_food_items');
    if (cached) { foodItems = cached; return; }
  }
  foodItems = [];
}

async function saveFoodItemToServer(item) {
  if (isOnline) {
    try {
      await pbUpsert('food_items', {
        id: item.id, user_id: authUser.id, meal_type: item.mealType,
        name: item.name, weight: item.weight || 0, calories: item.calories,
        carbs: item.carbs || 0, protein: item.protein || 0, fat: item.fat || 0,
        date: item.date, created_at: new Date(item.createdAt).toISOString()
      }, 'id="' + pbEscape(String(item.id)) + '"');
    } catch(e) {
      queuePush({ _module: 'diet', type: 'upsertItem', id: item.id, mealType: item.mealType,
        name: item.name, weight: item.weight, calories: item.calories,
        carbs: item.carbs, protein: item.protein, fat: item.fat, date: item.date, createdAt: item.createdAt });
    }
  } else {
    queuePush({ _module: 'diet', type: 'upsertItem', id: item.id, mealType: item.mealType,
      name: item.name, weight: item.weight, calories: item.calories,
      carbs: item.carbs, protein: item.protein, fat: item.fat, date: item.date, createdAt: item.createdAt });
  }
  if (authUser) dbCacheSave(authUser.id, 'checkin_cache_food_items', foodItems);
}

async function deleteFoodItemFromServer(itemId) {
  if (isOnline) {
    try { await getPB().collection('food_items').delete(itemId); }
    catch(e) { queuePush({ _module: 'diet', type: 'deleteItem', id: itemId }); }
  } else { queuePush({ _module: 'diet', type: 'deleteItem', id: itemId }); }
  foodItems = foodItems.filter(function(r) { return r.id !== itemId; });
  if (authUser) dbCacheSave(authUser.id, 'checkin_cache_food_items', foodItems);
}

// ---- Date Track ----
function getDateTrackDates() {
  var dates = [];
  var today = new Date();
  for (var i = 6; i >= 0; i--) {
    var d = new Date(today);
    d.setDate(d.getDate() - i);
    dates.push(todayStr(d));
  }
  return dates;
}

function renderDateTrack() {
  var container = document.getElementById('dietDateTrack');
  if (!container) return;
  var dates = getDateTrackDates();
  container.innerHTML = dates.map(function(d) {
    var parts = d.split('-');
    var dayNum = parseInt(parts[2]);
    var active = d === dietDate ? ' active' : '';
    var isToday = d === todayStr() ? ' today' : '';
    return '<button class="diet-date-btn' + active + isToday + '" data-date="' + d + '">' + dayNum + '</button>';
  }).join('');
  container.onclick = function(e) {
    var btn = e.target.closest('.diet-date-btn');
    if (!btn) return;
    dietDate = btn.dataset.date;
    renderDietEating();
  };
}

// ---- Tab Switching ----
function switchDietTab(tab) {
  dietActiveTab = tab;
  var tabs = document.querySelectorAll('#dietTabs .sub-nav-item');
  tabs.forEach(function(t) { t.classList.toggle('active', t.dataset.tab === tab); });
  document.getElementById('dietPanelEating').classList.toggle('active', tab === 'eating');
  document.getElementById('dietPanelDrinking').classList.toggle('active', tab === 'drinking');
  document.getElementById('dietPanelBathroom').classList.toggle('active', tab === 'bathroom');
  document.getElementById('dietDateTrack').style.display = tab === 'eating' ? '' : 'none';
  if (tab === 'eating') renderDietEating();
  else if (tab === 'drinking') renderDietDrinking();
  else if (tab === 'bathroom') renderBathroomTab();
}

// ================================================================
// Eating Tab
// ================================================================
function getDayItems() {
  return foodItems.filter(function(r) { return r.date === dietDate; });
}

function getMealItems(mealType) {
  return getDayItems().filter(function(r) { return r.mealType === mealType; });
}

function getMealCalories(mealType) {
  return getMealItems(mealType).reduce(function(s, r) { return s + r.calories; }, 0);
}

function getMealMacros(mealType) {
  var items = getMealItems(mealType);
  var carbs = 0, protein = 0, fat = 0;
  items.forEach(function(r) { carbs += (r.carbs || 0); protein += (r.protein || 0); fat += (r.fat || 0); });
  return { carbs: carbs, protein: protein, fat: fat };
}

// ---- Overview Card ----
function renderOverviewCard() {
  var container = document.getElementById('dietOverview');
  if (!container) return;
  var dayItems = getDayItems();
  var totalCal = dayItems.reduce(function(s, r) { return s + r.calories; }, 0);
  var target = dietSettings.daily_calorie_target || 8000;
  var remaining = target - totalCal;
  var pct = Math.min(100, Math.round(totalCal / target * 100));

  var totalCarbs = 0, totalProtein = 0, totalFat = 0;
  dayItems.forEach(function(r) { totalCarbs += (r.carbs || 0); totalProtein += (r.protein || 0); totalFat += (r.fat || 0); });
  var macros = macroPct(totalCarbs, totalProtein, totalFat);

  var barColor = remaining >= 0 ? '#22c55e' : '#ef4444';

  // 3/4 ring chart: radius 72, circumference 2*PI*72 ≈ 452.4, 3/4 = 339.3
  var R = 72, fullCirc = 2 * Math.PI * R, arcLen = fullCirc * 0.75;
  var offset = arcLen * (1 - Math.min(pct, 100) / 100);

  var ringHtml =
    '<svg class="diet-ov-ring-svg" viewBox="0 0 180 180">' +
      '<circle class="diet-ov-ring-bg" cx="90" cy="90" r="' + R + '" ' +
        'stroke-dasharray="' + arcLen.toFixed(1) + ' ' + fullCirc.toFixed(1) + '" ' +
        'stroke-dashoffset="0" transform="rotate(135 90 90)"/>' +
      '<circle class="diet-ov-ring-fill" cx="90" cy="90" r="' + R + '" ' +
        'stroke="' + barColor + '" ' +
        'stroke-dasharray="' + arcLen.toFixed(1) + ' ' + fullCirc.toFixed(1) + '" ' +
        'stroke-dashoffset="' + offset.toFixed(1) + '" transform="rotate(135 90 90)"/>' +
      '<text class="diet-ov-ring-center" x="90" y="85">' +
        '<tspan class="diet-ov-ring-label" x="90">已摄入</tspan>' +
        '<tspan class="diet-ov-ring-value" x="90" dy="22">' + fmtKj(totalCal) + ' 千焦</tspan>' +
      '</text>' +
    '</svg>';

  container.innerHTML =
    '<div class="diet-ov-header">' +
      '<span class="diet-ov-title">今日饮食摄入</span>' +
      '<button class="diet-settings-btn" id="dietSettingsBtn"><i class="ri-settings-3-fill"></i></button>' +
    '</div>' +
    '<div class="diet-ov-ring-wrap">' + ringHtml + '</div>' +
    '<div class="diet-ov-remaining">' + (remaining >= 0 ? '还可以吃 ' + fmtKj(remaining) + ' 千焦' : '已超出 ' + fmtKj(Math.abs(remaining)) + ' 千焦') + '</div>' +
    '<div class="diet-ov-macros">' +
      '<span class="diet-macro-tag" style="--macro-color:#f59e0b">碳水 ' + totalCarbs.toFixed(1) + 'g<br>' + macros.carbs + '%</span>' +
      '<span class="diet-macro-tag" style="--macro-color:#ef4444">蛋白 ' + totalProtein.toFixed(1) + 'g<br>' + macros.protein + '%</span>' +
      '<span class="diet-macro-tag" style="--macro-color:#8b5cf6">脂肪 ' + totalFat.toFixed(1) + 'g<br>' + macros.fat + '%</span>' +
    '</div>';
}

// ---- Meal Cards ----
function renderMealCard(mealType) {
  var items = getMealItems(mealType);
  var totalCal = items.reduce(function(s, r) { return s + r.calories; }, 0);
  var macros = getMealMacros(mealType);
  var pcts = macroPct(macros.carbs, macros.protein, macros.fat);
  var label = MEAL_LABELS[mealType];

  var bodyHtml = '';
  if (items.length === 0) {
    bodyHtml = '<div class="diet-meal-empty">暂无记录</div>';
  } else {
    bodyHtml = '<div class="diet-meal-macros">' +
      '碳水 ' + pcts.carbs + '% · 蛋白 ' + pcts.protein + '% · 脂肪 ' + pcts.fat + '%' +
    '</div>' +
    '<div class="diet-food-list">' +
      items.map(function(r) {
        var weightStr = r.weight > 0 ? ' <span class="diet-food-weight">' + r.weight + 'g</span>' : '';
        return '<div class="diet-food-row" data-id="' + r.id + '">' +
          '<div class="diet-food-info"><span class="diet-food-name">' + escHtml(r.name) + '</span>' + weightStr + '</div>' +
          '<span class="diet-food-kj">' + fmtKj(r.calories) + ' 千焦</span>' +
          '<button class="diet-food-edit" data-id="' + r.id + '"><i class="ri-edit-fill"></i></button>' +
          '<button class="diet-food-del" data-id="' + r.id + '"><i class="ri-delete-bin-fill"></i></button>' +
        '</div>';
      }).join('') +
    '</div>';
  }

  return '<div class="diet-meal-card">' +
    '<div class="diet-meal-header">' +
      '<span class="diet-meal-label">' + label + '</span>' +
      '<span class="diet-meal-kj">' + fmtKj(totalCal) + ' 千焦</span>' +
    '</div>' + bodyHtml +
  '</div>';
}

function renderAllMealCards() {
  var container = document.getElementById('dietMeals');
  if (!container) return;
  container.innerHTML = MEAL_ORDER.map(function(mt) { return renderMealCard(mt); }).join('');
  bindMealCardEvents();
}

function bindMealCardEvents() {
  var meals = document.getElementById('dietMeals');
  if (!meals) return;
  meals.onclick = function(e) {
    var editBtn = e.target.closest('.diet-food-edit');
    if (editBtn) { openDietEdit(editBtn.dataset.id); return; }
    var delBtn = e.target.closest('.diet-food-del');
    if (delBtn) { confirmDeleteFood(delBtn.dataset.id); return; }
  };
}

// ---- Render Eating Tab ----
function renderDietEating() {
  renderDateTrack();
  renderOverviewCard();
  renderAllMealCards();
}

// ---- Add Food Modal ----
function openDietAdd(mealType) {
  dietAddMealType = mealType;
  document.getElementById('dietAddTitle').textContent = '添加' + MEAL_LABELS[mealType];
  document.getElementById('dietAddDate').value = dietDate;
  document.getElementById('dietAddOverlay').classList.add('show');
  // Start with one empty row
  dietAddRows = [{ name: '', weight: '', calories: '', carbs: '', protein: '', fat: '' }];
  renderDietAddRows();
}

var dietAddRows = [];

function renderDietAddRows() {
  var container = document.getElementById('dietAddRows');
  container.innerHTML = dietAddRows.map(function(row, i) {
    return '<div class="diet-add-row">' +
      '<div class="diet-add-row-fields">' +
        '<input class="diet-add-input diet-add-name" placeholder="食物名称" value="' + escHtml(row.name) + '" data-idx="' + i + '" data-field="name">' +
        '<div class="diet-add-row-sub">' +
          '<input class="diet-add-input diet-add-num" placeholder="克数" value="' + row.weight + '" data-idx="' + i + '" data-field="weight" inputmode="decimal" type="number" step="1">' +
          '<input class="diet-add-input diet-add-num" placeholder="热量(千焦)" value="' + row.calories + '" data-idx="' + i + '" data-field="calories" inputmode="decimal" type="number" step="10">' +
        '</div>' +
        '<div class="diet-add-row-sub">' +
          '<input class="diet-add-input diet-add-num" placeholder="碳水(g)" value="' + row.carbs + '" data-idx="' + i + '" data-field="carbs" inputmode="decimal" type="number" step="0.1">' +
          '<input class="diet-add-input diet-add-num" placeholder="蛋白质(g)" value="' + row.protein + '" data-idx="' + i + '" data-field="protein" inputmode="decimal" type="number" step="0.1">' +
          '<input class="diet-add-input diet-add-num" placeholder="脂肪(g)" value="' + row.fat + '" data-idx="' + i + '" data-field="fat" inputmode="decimal" type="number" step="0.1">' +
        '</div>' +
      '</div>' +
      (dietAddRows.length > 1 ? '<button class="diet-add-remove" data-idx="' + i + '"><i class="ri-close-line"></i></button>' : '') +
    '</div>';
  }).join('');

  // Bind input events with IME composition support
  container.querySelectorAll('.diet-add-input').forEach(function(input) {
    var composing = false;
    input.addEventListener('compositionstart', function() { composing = true; });
    input.addEventListener('compositionend', function() {
      composing = false;
      // Final value read after composition
      var idx = parseInt(this.dataset.idx);
      var field = this.dataset.field;
      if (dietAddRows[idx]) dietAddRows[idx][field] = this.value;
    });
    input.addEventListener('input', function() {
      if (composing) return; // skip during IME composition
      var idx = parseInt(this.dataset.idx);
      var field = this.dataset.field;
      if (dietAddRows[idx]) dietAddRows[idx][field] = this.value;
    });
  });
  container.querySelectorAll('.diet-add-remove').forEach(function(btn) {
    btn.onclick = function() {
      var idx = parseInt(this.dataset.idx);
      dietAddRows.splice(idx, 1);
      renderDietAddRows();
    };
  });
}

// Render a single row and append to DOM (avoids destroying IME composition)
function renderDietAddRow(i) {
  var row = dietAddRows[i];
  var container = document.getElementById('dietAddRows');
  var html = '<div class="diet-add-row">' +
    '<div class="diet-add-row-fields">' +
      '<input class="diet-add-input diet-add-name" placeholder="食物名称" value="' + escHtml(row.name) + '" data-idx="' + i + '" data-field="name">' +
      '<div class="diet-add-row-sub">' +
        '<input class="diet-add-input diet-add-num" placeholder="克数" value="' + row.weight + '" data-idx="' + i + '" data-field="weight" inputmode="decimal" type="number" step="1">' +
        '<input class="diet-add-input diet-add-num" placeholder="热量(千焦)" value="' + row.calories + '" data-idx="' + i + '" data-field="calories" inputmode="decimal" type="number" step="10">' +
      '</div>' +
      '<div class="diet-add-row-sub">' +
        '<input class="diet-add-input diet-add-num" placeholder="碳水(g)" value="' + row.carbs + '" data-idx="' + i + '" data-field="carbs" inputmode="decimal" type="number" step="0.1">' +
        '<input class="diet-add-input diet-add-num" placeholder="蛋白质(g)" value="' + row.protein + '" data-idx="' + i + '" data-field="protein" inputmode="decimal" type="number" step="0.1">' +
        '<input class="diet-add-input diet-add-num" placeholder="脂肪(g)" value="' + row.fat + '" data-idx="' + i + '" data-field="fat" inputmode="decimal" type="number" step="0.1">' +
      '</div>' +
    '</div>' +
    '<button class="diet-add-remove" data-idx="' + i + '"><i class="ri-close-line"></i></button>' +
  '</div>';
  container.insertAdjacentHTML('beforeend', html);

  // Bind IME-safe input events for the new row
  var newRow = container.lastElementChild;
  newRow.querySelectorAll('.diet-add-input').forEach(function(input) {
    var composing = false;
    input.addEventListener('compositionstart', function() { composing = true; });
    input.addEventListener('compositionend', function() {
      composing = false;
      var idx = parseInt(this.dataset.idx);
      var field = this.dataset.field;
      if (dietAddRows[idx]) dietAddRows[idx][field] = this.value;
    });
    input.addEventListener('input', function() {
      if (composing) return;
      var idx = parseInt(this.dataset.idx);
      var field = this.dataset.field;
      if (dietAddRows[idx]) dietAddRows[idx][field] = this.value;
    });
  });
  // Bind remove button
  var removeBtn = newRow.querySelector('.diet-add-remove');
  if (removeBtn) {
    removeBtn.onclick = function() {
      var idx = parseInt(this.dataset.idx);
      dietAddRows.splice(idx, 1);
      renderDietAddRows();
    };
  }
}

function closeDietAdd() {
  document.getElementById('dietAddOverlay').classList.remove('show');
  dietAddRows = [];
}

async function saveDietAdd() {
  // Read current input values back
  var inputs = document.querySelectorAll('#dietAddRows .diet-add-input');
  inputs.forEach(function(input) {
    var idx = parseInt(input.dataset.idx);
    var field = input.dataset.field;
    if (dietAddRows[idx]) dietAddRows[idx][field] = input.value;
  });

  var dateVal = document.getElementById('dietAddDate').value || dietDate;
  var saved = 0;
  for (var i = 0; i < dietAddRows.length; i++) {
    var row = dietAddRows[i];
    var name = row.name.trim();
    var cal = parseFloat(row.calories);
    if (!name) continue;
    if (isNaN(cal) || cal <= 0) continue;
    var item = {
      id: Date.now().toString() + Math.floor(Math.random()*100).toString().padStart(2,'0'),
      mealType: dietAddMealType, name: name,
      weight: parseFloat(row.weight) || 0,
      calories: cal,
      carbs: parseFloat(row.carbs) || 0,
      protein: parseFloat(row.protein) || 0,
      fat: parseFloat(row.fat) || 0,
      date: dateVal, createdAt: Date.now()
    };
    foodItems.push(item);
    await saveFoodItemToServer(item);
    saved++;
  }
  if (saved === 0) { showToast('请至少填写食物名称和热量'); return; }
  closeDietAdd();
  playDing();
  showToast('已添加 ' + saved + ' 条食物记录');
  renderDietEating();
}

// ---- Edit Food Modal ----
function openDietEdit(itemId) {
  dietEditingId = itemId;
  var item = foodItems.find(function(r) { return r.id === itemId; });
  if (!item) return;
  document.getElementById('dietEditName').value = item.name;
  document.getElementById('dietEditWeight').value = item.weight || '';
  document.getElementById('dietEditCalories').value = item.calories;
  document.getElementById('dietEditCarbs').value = item.carbs || '';
  document.getElementById('dietEditProtein').value = item.protein || '';
  document.getElementById('dietEditFat').value = item.fat || '';
  document.getElementById('dietEditOverlay').classList.add('show');
}

function closeDietEdit() {
  document.getElementById('dietEditOverlay').classList.remove('show');
  dietEditingId = null;
}

async function saveDietEdit() {
  var item = foodItems.find(function(r) { return r.id === dietEditingId; });
  if (!item) return;
  var name = document.getElementById('dietEditName').value.trim();
  var cal = parseFloat(document.getElementById('dietEditCalories').value);
  if (!name) { showToast('请输入食物名称'); return; }
  if (isNaN(cal) || cal <= 0) { showToast('请输入有效热量'); return; }
  item.name = name;
  item.weight = parseFloat(document.getElementById('dietEditWeight').value) || 0;
  item.calories = cal;
  item.carbs = parseFloat(document.getElementById('dietEditCarbs').value) || 0;
  item.protein = parseFloat(document.getElementById('dietEditProtein').value) || 0;
  item.fat = parseFloat(document.getElementById('dietEditFat').value) || 0;
  await saveFoodItemToServer(item);
  closeDietEdit();
  showToast('食物已更新');
  renderDietEating();
}

// ---- Delete Food ----
function confirmDeleteFood(itemId) {
  var item = foodItems.find(function(r) { return r.id === itemId; });
  if (!item) return;
  document.getElementById('confirmText').textContent = '删除「' + item.name + '」？';
  document.getElementById('confirmDialog').classList.add('show');
  confirmCallback = async function() {
    await deleteFoodItemFromServer(itemId);
    document.getElementById('confirmDialog').classList.remove('show');
    renderDietEating();
    showToast('已删除');
  };
}

// ---- Settings Modal ----
function openDietSettings() {
  document.getElementById('dietTargetInput').value = dietSettings.daily_calorie_target || 8000;
  document.getElementById('dietSettingsOverlay').classList.add('show');
}

function closeDietSettings() {
  document.getElementById('dietSettingsOverlay').classList.remove('show');
}

async function saveDietSettingsForm() {
  var val = parseFloat(document.getElementById('dietTargetInput').value);
  if (isNaN(val) || val < 1000) { showToast('请输入至少 1000 千焦'); return; }
  dietSettings.daily_calorie_target = val;
  await saveDietSettings();
  closeDietSettings();
  showToast('摄入目标已更新');
  renderDietEating();
}

// ================================================================
// Drinking Tab
// ================================================================
function getTodayDrinkTotal() {
  var today = dietDate;
  return drinkRecords.filter(function(r) { return r.date === today; }).reduce(function(s, r) { return s + r.amount; }, 0);
}

function loadDrinkRecords() {
  var cached = authUser ? dbCacheLoad(authUser.id, 'checkin_cache_drink_records') : null;
  if (cached) { drinkRecords = cached; return; }
  drinkRecords = [];
}

async function saveDrinkRecord(record) {
  drinkRecords.push(record);
  if (authUser) dbCacheSave(authUser.id, 'checkin_cache_drink_records', drinkRecords);
  if (isOnline && authUser) {
    try {
      await pbUpsert('drink_records', {
        id: record.id, user_id: authUser.id, amount: record.amount,
        date: record.date, created_at: new Date(record.createdAt).toISOString()
      }, 'id="' + pbEscape(String(record.id)) + '"');
    } catch(e) { /* collection may not exist, cache-only OK */ }
  }
}

function animatePour(amount) {
  if (drinkPouring) return;
  drinkPouring = true;
  var wrap = document.getElementById('drinkBodyWrap');
  var stream = document.getElementById('drinkPourStream');
  if (!wrap || !stream) { drinkPouring = false; return; }

  // Create water drops falling from above
  var dropCount = Math.min(12, Math.floor(amount / 100) + 3);
  for (var i = 0; i < dropCount; i++) {
    var drop = document.createElement('div');
    drop.className = 'drink-drop';
    drop.style.left = (35 + Math.random() * 30) + '%';
    drop.style.top = (-10 - Math.random() * 30) + 'px';
    drop.style.animationDelay = (i * 0.04) + 's';
    drop.style.width = (4 + Math.random() * 5) + 'px';
    drop.style.height = drop.style.width;
    stream.appendChild(drop);
    setTimeout(function(d) { d.remove(); }, 800, drop);
  }

  // Body glow
  wrap.classList.add('pouring');
  setTimeout(function() { wrap.classList.remove('pouring'); }, 800);

  // Button feedback
  var btn = document.querySelector('.drink-btn.triggered');
  if (btn) setTimeout(function() { btn.classList.remove('triggered'); }, 500);

  drinkPouring = false;
}

function updateDrinkBody(animate) {
  var total = getTodayDrinkTotal();
  var pct = Math.min(100, Math.round(total / drinkTarget * 100));
  var bodyH = 280; // fillable body height in SVG units
  var waterH = bodyH * Math.min(total, drinkTarget) / drinkTarget;
  var waterY = 300 - waterH; // bottom is y=300 (feet)

  var water = document.getElementById('drinkWater');
  var surface = document.getElementById('drinkSurface');
  var statVal = document.getElementById('drinkStatVal');

  if (water) {
    if (animate) {
      water.style.transition = 'y 0.8s cubic-bezier(0.4,0,0.2,1), height 0.8s cubic-bezier(0.4,0,0.2,1)';
    } else {
      water.style.transition = 'none';
    }
    water.setAttribute('y', waterY);
    water.setAttribute('height', waterH);
  }
  if (surface) {
    surface.style.transition = animate ? 'cy 0.8s cubic-bezier(0.4,0,0.2,1)' : 'none';
    surface.setAttribute('cy', waterY);
    if (animate && waterH > 0) {
      surface.classList.remove('wave');
      void surface.offsetWidth;
      surface.classList.add('wave');
    }
    surface.style.opacity = waterH > 5 ? '0.7' : '0';
  }
  // Body outline turns blue as water fills
  var bodyPath = document.getElementById('drinkBodyPath');
  if (bodyPath) {
    var blueIntensity = Math.min(pct / 100, 1);
    var r = Math.round(107 + (107 - 59) * blueIntensity);   // #6b7db3 → #3b82f6
    var g = Math.round(125 + (125 - 130) * blueIntensity);
    var b = Math.round(179 + (179 - 246) * blueIntensity);
    bodyPath.setAttribute('fill', 'rgba(' + r + ',' + g + ',' + b + ',' + (0.08 + blueIntensity * 0.18) + ')');
    bodyPath.setAttribute('stroke', 'rgba(' + r + ',' + g + ',' + b + ',' + (0.3 + blueIntensity * 0.4) + ')');
  }

  if (statVal) {
    statVal.textContent = total;
    statVal.setAttribute('fill', pct >= 80 ? '#22c55e' : 'var(--text)');
  }
}

function handleDrink(ml) {
  if (drinkPouring) return;
  var total = getTodayDrinkTotal();
  if (total >= drinkTarget) { showToast('今日饮水已达上限（2500ml），非常棒！'); return; }

  var record = { id: Date.now().toString() + Math.floor(Math.random()*100).toString().padStart(2,'0'), amount: ml, date: dietDate, createdAt: Date.now() };
  saveDrinkRecord(record);

  animatePour(ml);
  setTimeout(function() { updateDrinkBody(true); }, 50);
  playDing();
  var newTotal = getTodayDrinkTotal();
  if (newTotal >= drinkTarget * 0.8 && (newTotal - ml) < drinkTarget * 0.8) {
    setTimeout(function() { showToast('已达到合格水量（80%），继续保持！💧'); }, 900);
  }
}

function undoDrink() {
  var today = dietDate;
  var todayRecords = drinkRecords.filter(function(r) { return r.date === today; });
  if (todayRecords.length === 0) { showToast('今天还没有喝水记录'); return; }
  var last = todayRecords[todayRecords.length - 1];
  var removed = last.amount;
  drinkRecords = drinkRecords.filter(function(r) { return r.id !== last.id; });
  if (authUser) dbCacheSave(authUser.id, 'checkin_cache_drink_records', drinkRecords);
  playUndo();
  updateDrinkBody(true);
  showToast('已撤销 ' + removed + 'ml');
}

function renderDietDrinking() {
  loadDrinkRecords();
  updateDrinkBody(false);
}

// ================================================================
// Bathroom Tab
// ================================================================
function loadBathroomRecords() {
  var cached = authUser ? dbCacheLoad(authUser.id, 'checkin_cache_bathroom_records') : null;
  if (cached) { bathroomRecords = cached; return; }
  bathroomRecords = [];
}

async function saveBathroomRecord(record) {
  // Note: caller (saveBathroomRecordForm) already handles array push + cache save
  if (isOnline && authUser) {
    try {
      await pbUpsert('bathroom_records', {
        id: record.id, user_id: authUser.id,
        shape: record.shape, color: record.color, amount: record.amount,
        feeling: record.feeling, smell: record.smell, duration: record.duration,
        date: record.date, time: record.time,
        created_at: new Date(record.createdAt).toISOString()
      }, 'id="' + pbEscape(String(record.id)) + '"');
    } catch(e) { /* collection may not exist, cache-only OK */ }
  }
}

function getHoursSinceLast() {
  if (bathroomRecords.length === 0) return null;
  var sorted = bathroomRecords.slice().sort(function(a, b) {
    return (b.date + 'T' + (b.time || '00:00')).localeCompare(a.date + 'T' + (a.time || '00:00'));
  });
  var last = sorted[0];
  var dt = new Date(last.date + 'T' + (last.time || '00:00') + ':00');
  var now = new Date();
  return Math.max(0, Math.round((now - dt) / 3600000 * 10) / 10);
}

function renderBathroomTab() {
  loadBathroomRecords();
  var hours = getHoursSinceLast();
  var timeEl = document.getElementById('brTimeSince');
  if (timeEl) {
    if (hours === null) {
      timeEl.innerHTML = '还没有排便记录';
    } else {
      var h = hours < 1 ? Math.round(hours * 60) + ' 分钟' : hours + ' 小时';
      timeEl.innerHTML = '距离上次便便<br><strong>' + h + '</strong>';
    }
  }
  var poopWrap = document.getElementById('brPoopWrap');
  if (poopWrap && hours !== null) {
    if (hours < 6) poopWrap.style.filter = 'grayscale(0)';
    else if (hours < 24) poopWrap.style.filter = 'grayscale(0.3)';
    else poopWrap.style.filter = 'grayscale(0.7)';
  }
  renderBathroomCalendar();
}

function getBrRecordsForDate(dateStr) {
  return bathroomRecords.filter(function(r) { return r.date === dateStr; });
}

function renderBathroomCalendar() {
  var container = document.getElementById('brCalendar');
  if (!container) return;
  var year = brViewDate.getFullYear();
  var month = brViewDate.getMonth();
  var firstDay = new Date(year, month, 1).getDay();
  var daysInMonth = new Date(year, month + 1, 0).getDate();
  var today = todayStr();

  var recordDates = {};
  bathroomRecords.forEach(function(r) {
    recordDates[r.date] = (recordDates[r.date] || 0) + 1;
  });

  var headerHtml = '<div class="br-cal-header">' +
    '<button class="br-cal-nav" id="brCalPrev"><i class="ri-arrow-left-s-fill"></i></button>' +
    '<span class="br-cal-month">' + year + '年 ' + (month + 1) + '月</span>' +
    '<button class="br-cal-nav" id="brCalNext"><i class="ri-arrow-right-s-fill"></i></button>' +
  '</div>';

  var dayHeaders = ['日','一','二','三','四','五','六'].map(function(d) {
    return '<div class="br-cal-dh">' + d + '</div>';
  }).join('');

  var cells = '';
  for (var i = 0; i < firstDay; i++) cells += '<div class="br-cal-cell empty"></div>';
  for (var d = 1; d <= daysInMonth; d++) {
    var ds = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    var cnt = recordDates[ds] || 0;
    var isToday = ds === today ? ' today' : '';
    var cntCls = cnt >= 3 ? ' br-cnt-3' : (cnt === 2 ? ' br-cnt-2' : (cnt === 1 ? ' br-cnt-1' : ''));
    cells += '<div class="br-cal-cell' + isToday + cntCls + '" data-date="' + ds + '">' +
      '<span class="br-cal-day">' + d + '</span>' +
      (cnt > 0 ? '<span class="br-cal-dot">●</span>' : '') +
    '</div>';
  }

  container.innerHTML = headerHtml + '<div class="br-cal-grid">' + dayHeaders + cells + '</div>';

  document.getElementById('brCalPrev').onclick = function() {
    brViewDate.setMonth(brViewDate.getMonth() - 1);
    renderBathroomTab();
  };
  document.getElementById('brCalNext').onclick = function() {
    brViewDate.setMonth(brViewDate.getMonth() + 1);
    renderBathroomTab();
  };

  container.querySelectorAll('.br-cal-cell:not(.empty)').forEach(function(cell) {
    cell.onclick = function() { openBrDayModal(cell.dataset.date); };
  });
}

function openBrDayModal(dateStr) {
  var records = getBrRecordsForDate(dateStr);
  var parts = dateStr.split('-');
  document.getElementById('brDayModalTitle').textContent = parseInt(parts[1]) + '月' + parseInt(parts[2]) + '日 排便记录';
  var list = document.getElementById('brDayList');
  if (records.length === 0) {
    list.innerHTML = '<div class="br-day-empty">暂无记录</div>';
  } else {
    list.innerHTML = records.sort(function(a, b) { return (b.time || '00:00').localeCompare(a.time || '00:00'); }).map(function(r) {
      var fields = [];
      if (r.time) fields.push('<span class="br-rec-tag">' + r.time + '</span>');
      if (r.shape) fields.push('<span class="br-rec-tag">' + r.shape + '</span>');
      if (r.color) fields.push('<span class="br-rec-tag">' + r.color + '</span>');
      if (r.amount) fields.push('<span class="br-rec-tag">' + r.amount + '</span>');
      if (r.feeling) fields.push('<span class="br-rec-tag">' + r.feeling + '</span>');
      if (r.smell) fields.push('<span class="br-rec-tag">' + r.smell + '</span>');
      if (r.duration) fields.push('<span class="br-rec-tag">' + r.duration + '</span>');
      return '<div class="br-rec-card">' +
        '<div class="br-rec-tags">' + fields.join('') + '</div>' +
        '<div class="br-rec-actions">' +
          '<button class="br-rec-edit" data-id="' + r.id + '"><i class="ri-edit-fill"></i></button>' +
          '<button class="br-rec-del" data-id="' + r.id + '"><i class="ri-delete-bin-fill"></i></button>' +
        '</div>' +
      '</div>';
    }).join('');
  }
  document.getElementById('brDayModalOverlay').classList.add('show');

  list.onclick = function(e) {
    var editBtn = e.target.closest('.br-rec-edit');
    if (editBtn) { closeBrDayModal(); openBrEdit(editBtn.dataset.id); return; }
    var delBtn = e.target.closest('.br-rec-del');
    if (delBtn) { confirmDeleteBrRecord(delBtn.dataset.id); return; }
  };
}

function closeBrDayModal() {
  document.getElementById('brDayModalOverlay').classList.remove('show');
}

function openBathroomModal() {
  brEditingId = null;
  brSelected = { shape: '香蕉', color: '咖啡色', amount: '一般', feeling: '轻松', smell: '有点臭', duration: '5分钟' };
  document.getElementById('brDateInput').value = dietDate;
  var now = new Date();
  document.getElementById('brTimeInput').value = String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0');
  document.getElementById('brFormSubmit').textContent = '保存';
  renderBrOptionGrids();
  document.getElementById('brModalOverlay').classList.add('show');
}

function openBrEdit(recordId) {
  var r = bathroomRecords.find(function(x) { return x.id === recordId; });
  if (!r) return;
  brEditingId = recordId;
  brSelected = {
    shape: r.shape, color: r.color, amount: r.amount,
    feeling: r.feeling, smell: r.smell, duration: r.duration
  };
  document.getElementById('brDateInput').value = r.date;
  document.getElementById('brTimeInput').value = r.time || '';
  document.getElementById('brFormSubmit').textContent = '更新';
  renderBrOptionGrids();
  document.getElementById('brModalOverlay').classList.add('show');
}

var BR_COLOR_MAP = {
  '黄色': '#facc15', '浅咖啡色': '#d4a574', '咖啡色': '#8b5a2b',
  '深咖啡色': '#5c3a1e', '黑色': '#333', '红色': '#ef4444'
};

function renderBrOptionGrids() {
  ['shape','color','amount','feeling','smell','duration'].forEach(function(field) {
    var grid = document.getElementById('br' + field.charAt(0).toUpperCase() + field.slice(1) + 'Grid');
    if (!grid) return;
    if (field === 'color') {
      grid.innerHTML = BR_OPTIONS[field].map(function(opt) {
        var swatch = BR_COLOR_MAP[opt] || '#888';
        var sel = brSelected[field] === opt ? ' selected' : '';
        return '<button class="br-color-swatch' + sel + '" data-field="' + field + '" data-val="' + opt + '" title="' + opt + '" style="background:' + swatch + '"></button>';
      }).join('');
    } else {
      grid.innerHTML = BR_OPTIONS[field].map(function(opt) {
        return '<button class="br-opt' + (brSelected[field] === opt ? ' selected' : '') + '" data-field="' + field + '" data-val="' + opt + '">' + opt + '</button>';
      }).join('');
    }
    grid.onclick = function(e) {
      var btn = e.target.closest('button');
      if (!btn) return;
      brSelected[btn.dataset.field] = btn.dataset.val;
      renderBrOptionGrids();
    };
  });
}

function closeBathroomModal() {
  document.getElementById('brModalOverlay').classList.remove('show');
  brEditingId = null;
}

function saveBathroomRecordForm() {
  var dateVal = document.getElementById('brDateInput').value || dietDate;
  var timeVal = document.getElementById('brTimeInput').value || '';
  var dt = new Date(dateVal + 'T' + (timeVal || '00:00') + ':00');
  if (dt > new Date()) { showToast('时间不能超过当前时间'); return; }
  var record = {
    id: brEditingId || Date.now().toString() + Math.floor(Math.random()*100).toString().padStart(2,'0'),
    shape: brSelected.shape, color: brSelected.color, amount: brSelected.amount,
    feeling: brSelected.feeling, smell: brSelected.smell, duration: brSelected.duration,
    date: dateVal, time: timeVal, createdAt: Date.now()
  };
  if (brEditingId) {
    var idx = bathroomRecords.findIndex(function(x) { return x.id === brEditingId; });
    if (idx >= 0) bathroomRecords[idx] = record;
  } else {
    bathroomRecords.push(record);
  }
  if (authUser) dbCacheSave(authUser.id, 'checkin_cache_bathroom_records', bathroomRecords);
  // Sync to PocketBase in background
  if (isOnline && authUser) {
    saveBathroomRecord(record).catch(function(){});
  }
  closeBathroomModal();
  playDing();
  showToast(brEditingId ? '记录已更新' : '已记录排便');
  renderBathroomTab();
}

function confirmDeleteBrRecord(recordId) {
  document.getElementById('confirmText').textContent = '删除这条排便记录？';
  document.getElementById('confirmDialog').classList.add('show');
  confirmCallback = function() {
    bathroomRecords = bathroomRecords.filter(function(r) { return r.id !== recordId; });
    if (authUser) dbCacheSave(authUser.id, 'checkin_cache_bathroom_records', bathroomRecords);
    document.getElementById('confirmDialog').classList.remove('show');
    closeBrDayModal();
    renderBathroomTab();
    showToast('已删除');
  };
}

// ---- Module Registration ----
var dietState = { foodItems: [], dietSettings: null };

DataModule({
  id: 'diet',
  state: dietState,
  views: ['viewDiet'],
  tables: [{
    cacheKey: 'checkin_cache_food_items', tableName: 'food_items', orderBy: 'created_at', stateProp: 'foodItems',
    transform: function(rows) {
      return rows.map(function(r) {
        return { id: r.id.toString(), mealType: r.meal_type, name: r.name, weight: parseFloat(r.weight) || 0,
          calories: parseFloat(r.calories), carbs: parseFloat(r.carbs) || 0, protein: parseFloat(r.protein) || 0,
          fat: parseFloat(r.fat) || 0, date: r.date, createdAt: new Date(r.created_at).getTime() };
      });
    }
  }],
  actions: {
    upsertItem: async function(pb, uid, a) {
      pbUpsert('food_items', {
        id: a.id, user_id: uid, meal_type: a.mealType, name: a.name, weight: a.weight || 0,
        calories: a.calories, carbs: a.carbs || 0, protein: a.protein || 0, fat: a.fat || 0,
        date: a.date, created_at: new Date(a.createdAt).toISOString()
      }, 'id="' + pbEscape(String(a.id)) + '"');
    },
    deleteItem: async function(pb, uid, a) {
      await pb.collection('food_items').delete(String(a.id));
    }
  },
  init: function() {
    foodItems = dietState.foodItems || [];
    loadDietSettings();
    if (currentView === 'viewDiet') renderDietView();
  },
  render: function(viewName) {
    if (viewName === 'viewDiet') renderDietView();
  },
  fabClick: function() {},
  onNavigate: function(viewName) {
    if (viewName === 'viewDiet') {
      var fab = document.getElementById('fabBtn');
      if (fab) fab.style.display = 'none';
      dietDate = todayStr();
      dietActiveTab = 'eating';
      switchDietTab('eating');
    }
  },
  escape: function() {
    if (document.getElementById('dietAddOverlay').classList.contains('show')) closeDietAdd();
    if (document.getElementById('dietEditOverlay').classList.contains('show')) closeDietEdit();
    if (document.getElementById('dietSettingsOverlay').classList.contains('show')) closeDietSettings();
    if (document.getElementById('brModalOverlay').classList.contains('show')) closeBathroomModal();
    if (document.getElementById('brDayModalOverlay').classList.contains('show')) closeBrDayModal();
  },
  bindEvents: function() {
    // Tab switching
    document.getElementById('dietTabs').onclick = function(e) {
      var tab = e.target.closest('.sub-nav-item');
      if (!tab) return;
      switchDietTab(tab.dataset.tab);
    };

    // Settings (overview card rendered dynamically, use delegation)
    document.getElementById('dietOverview').onclick = function(e) {
      if (e.target.closest('#dietSettingsBtn')) openDietSettings();
    };
    document.getElementById('dietSettingsOverlay').onclick = function(e) {
      if (e.target === document.getElementById('dietSettingsOverlay')) closeDietSettings();
    };
    document.getElementById('dietSettingsSubmit').onclick = saveDietSettingsForm;

    // Add food
    document.getElementById('dietAddOverlay').onclick = function(e) {
      if (e.target === document.getElementById('dietAddOverlay')) closeDietAdd();
    };
    document.getElementById('dietAddSubmit').onclick = saveDietAdd;
    document.getElementById('dietAddMore').onclick = function() {
      // Read current values before adding new row
      var inputs = document.querySelectorAll('#dietAddRows .diet-add-input');
      inputs.forEach(function(input) {
        var idx = parseInt(input.dataset.idx);
        var field = input.dataset.field;
        if (dietAddRows[idx]) dietAddRows[idx][field] = input.value;
      });
      var newIdx = dietAddRows.length;
      dietAddRows.push({ name: '', weight: '', calories: '', carbs: '', protein: '', fat: '' });
      // Append single new row without destroying existing inputs (preserves IME)
      renderDietAddRow(newIdx);
    };

    // Edit food
    document.getElementById('dietEditOverlay').onclick = function(e) {
      if (e.target === document.getElementById('dietEditOverlay')) closeDietEdit();
    };
    document.getElementById('dietEditSubmit').onclick = saveDietEdit;

    // Meal FAB buttons
    document.getElementById('dietFabRow').onclick = function(e) {
      var btn = e.target.closest('.diet-fab-btn');
      if (!btn) return;
      openDietAdd(btn.dataset.meal);
    };

    // Drink buttons
    var drinkBtns = document.querySelectorAll('.drink-btn');
    drinkBtns.forEach(function(btn) {
      btn.onclick = function() {
        var ml = parseInt(this.dataset.ml);
        this.classList.add('triggered');
        handleDrink(ml);
      };
    });

    // Undo drink
    var undoBtn = document.getElementById('drinkUndoBtn');
    if (undoBtn) undoBtn.onclick = undoDrink;

    // Bathroom — click poop to add, calendar for view
    var poopWrap = document.getElementById('brPoopWrap');
    if (poopWrap) poopWrap.onclick = openBathroomModal;
    document.getElementById('brModalOverlay').onclick = function(e) {
      if (e.target === document.getElementById('brModalOverlay')) closeBathroomModal();
    };
    document.getElementById('brFormSubmit').onclick = saveBathroomRecordForm;
    document.getElementById('brDayModalOverlay').onclick = function(e) {
      if (e.target === document.getElementById('brDayModalOverlay')) closeBrDayModal();
    };
  },
  migrate: async function(data, sb, uid) {
    if (!data.foodItems) return { inserted: 0, errors: 0 };
    var items = data.foodItems, inserted = 0, errors = 0;
    for (var i = 0; i < items.length; i++) {
      var r = items[i];
      var res = pbUpsert('food_items', {
        id: r.id || (Date.now() + i), user_id: uid, meal_type: r.mealType || r.meal_type || 'lunch',
        name: r.name, weight: r.weight || 0, calories: r.calories,
        carbs: r.carbs || 0, protein: r.protein || 0, fat: r.fat || 0,
        date: r.date || todayStr(), created_at: new Date(r.createdAt || Date.now()).toISOString()
      }, 'id="' + pbEscape(String(r.id || (Date.now() + i))) + '"');
      inserted++;
    }
    return { inserted: inserted, errors: errors };
  },
  export: function() { return { foodItems: dietState.foodItems, dietSettings: dietSettings }; }
});

function renderDietView() {
  if (dietActiveTab === 'eating') renderDietEating();
  else if (dietActiveTab === 'drinking') renderDietDrinking();
  else if (dietActiveTab === 'bathroom') renderBathroomTab();
}
