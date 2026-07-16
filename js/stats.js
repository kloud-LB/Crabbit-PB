/* ================================================================
   stats.js — 统计模块（热力图 + 单任务统计）
   ================================================================ */

// 全局引用: tasks[], history[], statsYear, currentView

// ---- Heatmap Helpers ----
function getHeatmapGrid(year) {
  var jan1 = new Date(year, 0, 1);
  var startDay = jan1.getDay();
  var start = new Date(jan1);
  start.setDate(jan1.getDate() - startDay);

  var grid = [];
  for (var row = 0; row < 7; row++) {
    grid[row] = [];
    for (var col = 0; col < 52; col++) {
      var d = new Date(start);
      d.setDate(start.getDate() + col * 7 + row);
      grid[row][col] = d;
    }
  }
  return grid;
}

function getCompletionRate(dateStr) {
  if (tasks.length === 0) return 0;
  var dayData = history[dateStr];
  if (!dayData) return 0;
  var totalDone = 0, totalTarget = 0;
  tasks.forEach(function(t) {
    totalTarget += t.targetCount;
    if (dayData[t.id]) totalDone += Math.min(dayData[t.id].count || 0, t.targetCount);
  });
  return totalTarget > 0 ? totalDone / totalTarget : 0;
}

function getTaskCompletionRate(taskId, dateStr) {
  var task = tasks.find(function(t) { return t.id === taskId; });
  if (!task) return 0;
  var dayData = history[dateStr];
  if (!dayData || !dayData[taskId]) return 0;
  return Math.min(1, (dayData[taskId].count || 0) / task.targetCount);
}

function heatmapColor(rate, accentColor) {
  if (rate <= 0) return 'var(--heatmap-empty)';
  if (rate >= 1) return accentColor;
  var alpha = (0.12 + rate * 0.88).toFixed(2);
  return accentColor.replace(')', ', ' + alpha + ')').replace('rgb', 'rgba');
}

function heatmapColorOverview(rate) {
  if (rate <= 0) return 'var(--heatmap-empty)';
  var dark = document.body.dataset.theme === 'dark';
  var alpha = (0.12 + rate * 0.88).toFixed(2);
  return 'rgba(107,125,179,' + alpha + ')';
}

// ---- Total Completions ----
function countTotalCompletions(taskId) {
  var count = 0;
  var task = tasks.find(function(t) { return t.id === taskId; });
  if (!task) return 0;
  Object.values(history).forEach(function(dayData) {
    if (dayData[taskId]) count += Math.min(dayData[taskId].count || 0, task.targetCount);
  });
  return count;
}

function countYearCompletions(taskId, year) {
  var count = 0;
  var task = tasks.find(function(t) { return t.id === taskId; });
  if (!task) return 0;
  Object.entries(history).forEach(function(entry) {
    var dateStr = entry[0], dayData = entry[1];
    if (dateStr.indexOf(String(year)) === 0 && dayData[taskId]) {
      count += Math.min(dayData[taskId].count || 0, task.targetCount);
    }
  });
  return count;
}

// ---- Render Overview Heatmap ----
function renderOverviewHeatmap() {
  var grid = getHeatmapGrid(statsYear);

  var prevMonth = -1;
  var rowLabelsHtml = '';
  for (var col = 0; col < 52; col++) {
    var m = grid[0][col].getMonth();
    if (m !== prevMonth) {
      prevMonth = m;
      rowLabelsHtml += '<span style="left:' + (col * 14) + 'px">' + MONTHS[m] + '</span>';
    }
  }
  document.getElementById('heatmapRowLabels').innerHTML = rowLabelsHtml;
  document.getElementById('heatmapColLabels').innerHTML = DAY_LABELS.map(function(s) { return '<span>' + s + '</span>'; }).join('');

  var cellsHtml = '';
  for (var col = 0; col < 52; col++) {
    cellsHtml += '<div class="heatmap-col">';
    for (var row = 0; row < 7; row++) {
      var d = grid[row][col];
      var dateStr = todayStr(d);
      var inYear = d.getFullYear() === statsYear;
      var rate = inYear ? getCompletionRate(dateStr) : -1;
      var bg = inYear ? heatmapColorOverview(rate) : 'transparent';
      var border = inYear ? 'var(--heatmap-border)' : 'transparent';
      cellsHtml += '<div class="heatmap-cell" style="background:' + bg + ';border:1px solid ' + border + '"' +
        ' data-date="' + dateStr + '" data-rate="' + rate.toFixed(2) + '" data-inyear="' + inYear + '"></div>';
    }
    cellsHtml += '</div>';
  }
  document.getElementById('heatmapGrid').innerHTML = cellsHtml;

  var tooltip = document.getElementById('heatmapTooltip');
  document.querySelectorAll('#heatmapGrid .heatmap-cell').forEach(function(cell) {
    cell.addEventListener('mouseenter', function(e) {
      if (cell.dataset.inyear !== 'true') return;
      var rect = cell.getBoundingClientRect();
      var ratePct = Math.round(parseFloat(cell.dataset.rate) * 100);
      tooltip.textContent = fmtDate(cell.dataset.date) + ': ' + ratePct + '%';
      tooltip.style.left = (rect.left + rect.width / 2) + 'px';
      tooltip.style.top = (rect.top - 32) + 'px';
      tooltip.style.transform = 'translate(-50%,0)';
      tooltip.classList.add('show');
    });
    cell.addEventListener('mouseleave', function() { tooltip.classList.remove('show'); });
    cell.addEventListener('click', function() {
      if (cell.dataset.inyear !== 'true') return;
      tooltip.classList.add('show');
      setTimeout(function() { tooltip.classList.remove('show'); }, 2500);
      var dateStr = cell.dataset.date;
      var ratePct = Math.round(parseFloat(cell.dataset.rate) * 100);
      var dayData = history[dateStr] || {};
      var detail = tasks.map(function(t) {
        var c = dayData[t.id] ? (dayData[t.id].count || 0) : 0;
        return t.name + ': ' + c + '/' + t.targetCount;
      }).join('  ');
      if (!detail) detail = '无记录';
      showToast(fmtDate(dateStr) + '  完成率 ' + ratePct + '%  ' + detail, 3000);
    });
  });
}

// ---- Per-Task Stats ----
function buildTaskHeatmap(task) {
  var grid = getHeatmapGrid(statsYear);

  var prevMonth = -1;
  var topLabelsHtml = '';
  for (var col = 0; col < 52; col++) {
    var m = grid[0][col].getMonth();
    if (m !== prevMonth) {
      prevMonth = m;
      topLabelsHtml += '<span style="left:' + (col * 14) + 'px">' + MONTHS[m] + '</span>';
    }
  }

  var leftLabelsHtml = DAY_LABELS.map(function(s) { return '<span>' + s + '</span>'; }).join('');

  var cellsHtml = '';
  for (var col = 0; col < 52; col++) {
    cellsHtml += '<div class="heatmap-col">';
    for (var row = 0; row < 7; row++) {
      var d = grid[row][col];
      var dateStr = todayStr(d);
      var inYear = d.getFullYear() === statsYear;
      var rate = inYear ? getTaskCompletionRate(task.id, dateStr) : -1;
      var bg = inYear ? heatmapColor(rate, task.color) : 'transparent';
      var border = inYear ? 'var(--heatmap-border)' : 'transparent';
      cellsHtml += '<div class="heatmap-cell" style="background:' + bg + ';border:1px solid ' + border + '"></div>';
    }
    cellsHtml += '</div>';
  }

  return '<div class="heatmap-labels-row">' + topLabelsHtml + '</div>' +
    '<div style="display:flex">' +
      '<div class="heatmap-labels-col">' + leftLabelsHtml + '</div>' +
      '<div class="heatmap-grid">' + cellsHtml + '</div>' +
    '</div>';
}

function initTaskMonthView(taskId, year, month) {
  var card = document.querySelector('.stats-task-card[data-task-id="' + taskId + '"]');
  if (!card) return;
  var label = card.querySelector('.month-label[data-task="' + taskId + '"]');
  var cal = card.querySelector('.month-cal[data-task="' + taskId + '"]');
  if (label) label.textContent = year + '年 ' + MONTHS[month];
  if (!cal) return;
  var task = tasks.find(function(t) { return t.id === taskId; });
  if (!task) return;

  var firstDay = new Date(year, month, 1).getDay();
  var daysInMonth = new Date(year, month + 1, 0).getDate();
  var html = DAY_LABELS.map(function(s) { return '<div class="day-header">' + s + '</div>'; }).join('');
  for (var i = 0; i < firstDay; i++) html += '<div class="day-cell empty"></div>';
  for (var d = 1; d <= daysInMonth; d++) {
    var ds = year + '-' + String(month+1).padStart(2,'0') + '-' + String(d).padStart(2,'0');
    var done = isTaskDone(taskId, ds);
    var bg = done ? task.color : 'var(--heatmap-empty)';
    html += '<div class="day-cell' + (done ? ' done' : '') + '" style="background:' + bg + '">' + d + '</div>';
  }
  cal.innerHTML = html;
}

function initTaskWeekView(taskId) {
  var card = document.querySelector('.stats-task-card[data-task-id="' + taskId + '"]');
  if (!card) return;
  var row = card.querySelector('.week-row[data-task="' + taskId + '"]');
  if (!row) return;
  var task = tasks.find(function(t) { return t.id === taskId; });
  if (!task) return;

  var now = new Date();
  var dayOfWeek = now.getDay();
  var monday = new Date(now);
  monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));

  var html = '';
  for (var i = 0; i < 7; i++) {
    var d = new Date(monday);
    d.setDate(monday.getDate() + i);
    var ds = todayStr(d);
    var done = isTaskDone(taskId, ds);
    var prog = getTaskProgress(taskId, ds);
    var isToday = ds === todayStr();
    var bg = done ? task.color : (prog > 0 ? task.color + '44' : 'var(--heatmap-empty)');
    var text = done ? '✓' : (prog > 0 ? prog : '');
    var border = isToday ? '2px solid ' + task.color : '1px solid var(--heatmap-border)';
    html += '<div class="week-dot" style="background:' + bg + ';border:' + border + ';color:' + (done ? '#fff' : 'var(--text-secondary)') + '">' + text + '</div>';
  }
  row.innerHTML = html;
}

function renderTaskStats() {
  var container = document.getElementById('statsTaskList');
  if (tasks.length === 0) { container.innerHTML = ''; return; }

  container.innerHTML = tasks.map(function(t) {
    var totalCompletions = countTotalCompletions(t.id);
    var yearDone = countYearCompletions(t.id, statsYear);
    return '<div class="stats-task-card" data-task-id="' + t.id + '">' +
      '<div class="stats-task-header">' +
        '<div class="color-dot" style="background:' + t.color + ';color:' + t.color + ';width:10px;height:10px"></div>' +
        '<span style="flex:1;font-weight:600;font-size:0.9rem">' + escHtml(t.name) + '</span>' +
        '<span style="font-size:0.78rem;color:var(--text-secondary)">' + yearDone + '次 / 年</span>' +
        '<span class="expand-icon">▶</span>' +
      '</div>' +
      '<div class="stats-task-body">' +
        '<div class="stats-task-content">' +
          '<div style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:12px">' +
            '历史总计：<strong style="color:var(--text)">' + totalCompletions + ' 次</strong>' +
          '</div>' +
          '<div class="stats-section">' +
            '<div class="stats-section-title">年度视图</div>' +
            '<div class="heatmap-wrap">' + buildTaskHeatmap(t) + '</div>' +
          '</div>' +
          '<div class="stats-section">' +
            '<div class="stats-section-title">月度视图</div>' +
            '<div class="month-switcher">' +
              '<button class="month-prev" data-task="' + t.id + '">◂</button>' +
              '<span class="month-label" data-task="' + t.id + '"></span>' +
              '<button class="month-next" data-task="' + t.id + '">▸</button>' +
            '</div>' +
            '<div class="month-cal" data-task="' + t.id + '"></div>' +
          '</div>' +
          '<div class="stats-section">' +
            '<div class="stats-section-title">本周</div>' +
            '<div class="week-row" data-task="' + t.id + '"></div>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';
  }).join('');

  container.querySelectorAll('.stats-task-card').forEach(function(card) {
    var taskId = card.dataset.taskId;
    var monthState = { year: new Date().getFullYear(), month: new Date().getMonth() };

    card.querySelector('.stats-task-header').onclick = function() {
      var expanded = card.classList.contains('expanded');
      if (expanded) {
        card.classList.remove('expanded');
      } else {
        card.classList.add('expanded');
        monthState.year = new Date().getFullYear();
        monthState.month = new Date().getMonth();
        initTaskMonthView(taskId, monthState.year, monthState.month);
        initTaskWeekView(taskId);
      }
    };
    card.querySelector('.month-prev').onclick = function(e) {
      e.stopPropagation();
      monthState.month--;
      if (monthState.month < 0) { monthState.month = 11; monthState.year--; }
      initTaskMonthView(taskId, monthState.year, monthState.month);
    };
    card.querySelector('.month-next').onclick = function(e) {
      e.stopPropagation();
      monthState.month++;
      if (monthState.month > 11) { monthState.month = 0; monthState.year++; }
      initTaskMonthView(taskId, monthState.year, monthState.month);
    };
  });
}

function renderStats() {
  // Only render when checkin view is active and stats sub-tab is visible
  if (currentView !== 'viewCheckin') return;
  var statsSub = document.getElementById('subCheckinStats');
  if (!statsSub || !statsSub.classList.contains('active')) return;
  document.getElementById('yearLabel').textContent = statsYear + '年';
  renderOverviewHeatmap();
  renderTaskStats();
}

// ---- Module Registration ----
DataModule({
  id: 'stats',
  state: {},
  views: ['viewCheckin'],
  tables: [],
  render: function(viewName) {
    if (viewName === 'viewCheckin') renderStats();
  }
});
