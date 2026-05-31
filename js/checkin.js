/* ================================================================
   checkin.js — 打卡模块（数据 + 渲染 + 交互）
   ================================================================ */

// 全局状态（由 app.js 声明，此处引用）
// tasks[], history{}, currentView, statsYear, editingTaskId, backfillTaskId
// lastClickTime{}, confirmCallback, audioCtx, toastTimer

// ---- Data Layer ----
// 优先 Supabase / 离线回退 localCache

async function loadTasksOnline() {
  if (isOnline) {
    try {
      var sb = getSupabase();
      var uid = authUser.id;
      var res = await sb.from('checkin_tasks').select('*').eq('user_id', uid).order('created_at');
      if (!res.error) {
        tasks = res.data.map(function(r) { return { id: r.id.toString(), name: r.name, targetCount: r.target_count, color: r.color, createdAt: new Date(r.created_at).getTime() }; });
        if (uid) dbCacheSave(uid, 'checkin_cache_tasks', tasks);
        return;
      }
    } catch(e) { /* fallback */ }
  }
  // Offline: use cache
  if (authUser && typeof cacheGetTasks === 'function') {
    var cached = dbCacheLoad(authUser.id, 'checkin_cache_tasks');
    if (cached) { tasks = cached; return; }
  }
  tasks = [];
}

async function saveTaskToServer(task) {
  if (isOnline) {
    try {
      var sb = getSupabase();
      var uid = authUser.id;
      await sb.from('checkin_tasks').upsert({ id: parseInt(task.id), user_id: uid, name: task.name, target_count: task.targetCount, color: task.color, created_at: new Date(task.createdAt).toISOString() });
    } catch(e) { queuePush({ _module: 'checkin', type: 'updateTask', id: parseInt(task.id), name: task.name, targetCount: task.targetCount, color: task.color }); }
  } else {
    queuePush({ _module: 'checkin', type: 'updateTask', id: parseInt(task.id), name: task.name, targetCount: task.targetCount, color: task.color });
  }
  if (authUser) dbCacheSave(authUser.id, 'checkin_cache_tasks', tasks);
}

async function deleteTaskFromServer(taskId) {
  if (isOnline) {
    try { await getSupabase().from('checkin_tasks').delete().eq('id', parseInt(taskId)).eq('user_id', authUser.id); }
    catch(e) { queuePush({ _module: 'checkin', type: 'deleteTask', id: parseInt(taskId) }); }
  } else { queuePush({ _module: 'checkin', type: 'deleteTask', id: parseInt(taskId) }); }
  if (authUser) dbCacheSave(authUser.id, 'checkin_cache_tasks', tasks);
}

async function loadHistoryOnline() {
  if (isOnline) {
    try {
      var sb = getSupabase();
      var uid = authUser.id;
      var res = await sb.from('checkin_history').select('*').eq('user_id', uid);
      if (!res.error) {
        history = {};
        res.data.forEach(function(r) {
          if (!history[r.date]) history[r.date] = {};
          history[r.date][r.task_id] = { count: r.count, completedAt: new Date(r.completed_at).getTime() };
        });
        if (uid) dbCacheSave(uid, 'checkin_cache_history', history);
        return;
      }
    } catch(e) { /* fallback */ }
  }
  if (authUser && typeof cacheGetHistory === 'function') {
    var cached = dbCacheLoad(authUser.id, 'checkin_cache_history');
    if (cached) { history = cached; return; }
  }
  history = {};
}

async function saveCheckinEntry(taskId, dateStr, count, ts) {
  if (isOnline) {
    try {
      await getSupabase().from('checkin_history').upsert({ user_id: authUser.id, task_id: parseInt(taskId), date: dateStr, count: count, completed_at: new Date(ts).toISOString() }, { onConflict: 'user_id,task_id,date' });
    } catch(e) { queuePush({ _module: 'checkin', type: 'checkin', taskId: parseInt(taskId), date: dateStr, count: count, timestamp: ts }); }
  } else {
    queuePush({ _module: 'checkin', type: 'checkin', taskId: parseInt(taskId), date: dateStr, count: count, timestamp: ts });
  }
  if (authUser) dbCacheSave(authUser.id, 'checkin_cache_history', history);
}

async function deleteCheckinEntry(taskId, dateStr) {
  if (isOnline) {
    try { await getSupabase().from('checkin_history').delete().eq('user_id', authUser.id).eq('task_id', parseInt(taskId)).eq('date', dateStr); }
    catch(e) { queuePush({ _module: 'checkin', type: 'undoCheckin', taskId: parseInt(taskId), date: dateStr }); }
  } else { queuePush({ _module: 'checkin', type: 'undoCheckin', taskId: parseInt(taskId), date: dateStr }); }
  if (authUser) dbCacheSave(authUser.id, 'checkin_cache_history', history);
}

// ---- Helpers ----
function getTaskProgress(taskId, dateStr) {
  var dayData = history[dateStr];
  if (!dayData || !dayData[taskId]) return 0;
  return dayData[taskId].count || 0;
}

function isTaskDone(taskId, dateStr) {
  var task = tasks.find(function(t) { return t.id === taskId; });
  if (!task) return false;
  return getTaskProgress(taskId, dateStr) >= task.targetCount;
}

function sortTasksForDisplay(list) {
  var today = todayStr();
  var uncompleted = list.filter(function(t) { return !isTaskDone(t.id, today); });
  var completed = list.filter(function(t) { return isTaskDone(t.id, today); });
  uncompleted.sort(function(a, b) { return a.createdAt - b.createdAt; });
  completed.sort(function(a, b) {
    var aTime = (history[today] && history[today][a.id]) ? (history[today][a.id].completedAt || 0) : 0;
    var bTime = (history[today] && history[today][b.id]) ? (history[today][b.id].completedAt || 0) : 0;
    return aTime - bTime;
  });
  return uncompleted.concat(completed);
}

// ---- Render ----
function renderTasks() {
  var list = document.getElementById('taskList');
  var empty = document.getElementById('emptyState');
  var sorted = sortTasksForDisplay(tasks);
  if (tasks.length === 0) { list.innerHTML = ''; empty.style.display = ''; return; }
  empty.style.display = 'none';

  var today = todayStr();
  list.innerHTML = sorted.map(function(t) {
    var done = isTaskDone(t.id, today);
    var progress = getTaskProgress(t.id, today);
    var pct = Math.min(100, (progress / t.targetCount) * 100);
    var cls = 'task-card' + (done ? ' completed' : '');
    var checkCls = 'check-btn' + (t.targetCount > 1 ? ' count-btn' : '') + (done ? ' done' : '');
    var checkContent = done ? '✓' : (t.targetCount > 1 ? progress : '');
    return '<div class="' + cls + '" data-task-id="' + t.id + '">' +
      '<div class="color-dot" style="background:' + t.color + ';color:' + t.color + '"></div>' +
      '<div class="task-info">' +
        '<div class="task-name">' + escHtml(t.name) + '</div>' +
        '<div class="task-meta">' + progress + ' / ' + t.targetCount + '</div>' +
        (t.targetCount > 1 ? '<div class="task-progress-bar"><div class="task-progress-fill" style="width:' + pct + '%;background:' + t.color + '"></div></div>' : '') +
      '</div>' +
      '<div class="task-actions">' +
        '<button class="btn-icon backfill-btn" data-task-id="' + t.id + '" title="补打卡" style="font-size:0.85rem"><i class="ri-calendar-event-fill"></i></button>' +
        '<button class="btn-icon edit-btn" data-task-id="' + t.id + '" title="编辑"><i class="ri-edit-fill"></i></button>' +
        '<button class="btn-icon delete-btn" data-task-id="' + t.id + '" title="删除"><i class="ri-delete-bin-fill"></i></button>' +
      '</div>' +
      '<div class="' + checkCls + '" style="color:' + t.color + ';' + (t.targetCount > 1 && !done ? 'font-size:0.85rem;font-weight:700' : '') + '">' + checkContent + '</div>' +
    '</div>';
  }).join('');

  list.onclick = function(e) {
    var card = e.target.closest('.task-card');
    if (!card) return;
    var taskId = card.dataset.taskId;
    if (e.target.closest('.edit-btn')) { openEditModal(taskId); return; }
    if (e.target.closest('.delete-btn')) { confirmDelete(taskId); return; }
    if (e.target.closest('.backfill-btn')) { openBackfill(taskId); return; }
    handleCheckin(taskId, card);
  };
}

// ---- Check-in Logic ----
async function handleCheckin(taskId, card) {
  var now = Date.now();
  if (lastClickTime[taskId] && now - lastClickTime[taskId] < DEBOUNCE_MS) return;
  lastClickTime[taskId] = now;

  var task = tasks.find(function(t) { return t.id === taskId; });
  if (!task) return;
  var today = todayStr();

  if (isTaskDone(taskId, today)) {
    if (history[today] && history[today][taskId]) {
      delete history[today][taskId];
      if (Object.keys(history[today]).length === 0) delete history[today];
    }
    await deleteCheckinEntry(taskId, today);
    playUndo();
    renderTasks();
    return;
  }

  if (!history[today]) history[today] = {};
  if (!history[today][taskId]) history[today][taskId] = { count: 0 };
  history[today][taskId].count++;
  history[today][taskId].completedAt = now;
  await saveCheckinEntry(taskId, today, history[today][taskId].count, now);
  playDing();

  if (task.targetCount === 1 || isTaskDone(taskId, today)) {
    showCheckmark(card);
  }
  renderTasks();
}

// ---- Task CRUD ----
function openAddModal() {
  editingTaskId = null;
  document.getElementById('taskModalTitle').textContent = '新建任务';
  document.getElementById('taskNameInput').value = '';
  document.getElementById('taskCountInput').value = '1';
  document.getElementById('taskColorInput').value = '#6b7db3';
  updateColorSelection('#6b7db3');
  document.getElementById('taskModalOverlay').classList.add('show');
  setTimeout(function() { document.getElementById('taskNameInput').focus(); }, 350);
}

function openEditModal(taskId) {
  var task = tasks.find(function(t) { return t.id === taskId; });
  if (!task) return;
  editingTaskId = taskId;
  document.getElementById('taskModalTitle').textContent = '编辑任务';
  document.getElementById('taskNameInput').value = task.name;
  document.getElementById('taskCountInput').value = task.targetCount;
  document.getElementById('taskColorInput').value = task.color;
  updateColorSelection(task.color);
  document.getElementById('taskModalOverlay').classList.add('show');
}

function closeTaskModal() {
  document.getElementById('taskModalOverlay').classList.remove('show');
  editingTaskId = null;
}

async function saveTask() {
  var name = document.getElementById('taskNameInput').value.trim();
  var count = parseInt(document.getElementById('taskCountInput').value) || 1;
  var color = document.getElementById('taskColorInput').value;
  if (!name) { showToast('请输入任务名称'); return; }
  count = Math.max(1, Math.min(99, count));

  if (editingTaskId) {
    var idx = tasks.findIndex(function(t) { return t.id === editingTaskId; });
    if (idx >= 0) { tasks[idx].name = name; tasks[idx].targetCount = count; tasks[idx].color = color; }
  } else {
    var newTask = { id: Date.now().toString(), name: name, targetCount: count, color: color, createdAt: Date.now() };
    tasks.push(newTask);
  }
  await saveTaskToServer(editingTaskId ? tasks.find(function(t) { return t.id === editingTaskId; }) : tasks[tasks.length - 1]);
  closeTaskModal(); renderTasks(); renderStats();
  showToast(editingTaskId ? '任务已更新' : '任务已创建');
}

async function confirmDelete(taskId) {
  var task = tasks.find(function(t) { return t.id === taskId; });
  if (!task) return;
  document.getElementById('confirmText').textContent = '确定要删除「' + task.name + '」吗？历史数据将保留。';
  document.getElementById('confirmDialog').classList.add('show');
  confirmCallback = async function() {
    tasks = tasks.filter(function(t) { return t.id !== taskId; });
    await deleteTaskFromServer(taskId);
    renderTasks(); renderStats();
    document.getElementById('confirmDialog').classList.remove('show');
    showToast('任务已删除');
  };
}

// ---- Backfill ----
function openBackfill(taskId) {
  backfillTaskId = taskId;
  var today = new Date();
  var dates = [];
  for (var i = 1; i <= 2; i++) {
    var d = new Date(today); d.setDate(d.getDate() - i);
    dates.push(todayStr(d));
  }
  var task = tasks.find(function(t) { return t.id === taskId; });
  document.getElementById('backfillDates').innerHTML = dates.map(function(d) {
    var done = isTaskDone(taskId, d);
    var prog = getTaskProgress(taskId, d);
    var label = fmtDate(d) + ' 周' + weekday(d);
    var status = done ? '已完成' : (prog > 0 ? prog + '/' + task.targetCount : '未打卡');
    return '<button class="backfill-date-btn" data-date="' + d + '"' + (done ? ' disabled' : '') + '>' +
      '<span>' + label + '</span><span class="status">' + status + '</span></button>';
  }).join('');
  document.getElementById('backfillOverlay').classList.add('show');

  document.getElementById('backfillDates').onclick = async function(e) {
    var btn = e.target.closest('.backfill-date-btn');
    if (!btn || btn.disabled) return;
    var dateStr = btn.dataset.date;
    var t = tasks.find(function(t) { return t.id === backfillTaskId; });
    if (!t) return;
    if (isTaskDone(backfillTaskId, dateStr)) return;

    if (!history[dateStr]) history[dateStr] = {};
    if (!history[dateStr][backfillTaskId]) history[dateStr][backfillTaskId] = { count: 0 };
    history[dateStr][backfillTaskId].count++;
    history[dateStr][backfillTaskId].completedAt = Date.now();
    await saveCheckinEntry(backfillTaskId, dateStr, history[dateStr][backfillTaskId].count, history[dateStr][backfillTaskId].completedAt);
    playDing();
    openBackfill(backfillTaskId);
    renderTasks(); renderStats();
  };
}

function closeBackfill() {
  document.getElementById('backfillOverlay').classList.remove('show');
  backfillTaskId = null;
}

// ---- Color Selection ----
function updateColorSelection(color) {
  document.getElementById('colorPresets').innerHTML = COLORS.map(function(c) {
    return '<div class="color-preset' + (c === color ? ' selected' : '') + '" style="background:' + c + '" data-color="' + c + '"></div>';
  }).join('');
  document.querySelectorAll('#colorPresets .color-preset').forEach(function(el) {
    el.onclick = function() {
      document.getElementById('taskColorInput').value = el.dataset.color;
      updateColorSelection(el.dataset.color);
    };
  });
}

// ---- Module Registration ----
var checkinState = { tasks: [], history: [] };

DataModule({
  id: 'checkin',
  state: checkinState,
  views: ['viewCheckin'],
  tables: [
    {
      cacheKey: 'checkin_cache_tasks',
      tableName: 'checkin_tasks',
      orderBy: 'created_at',
      stateProp: 'tasks',
      transform: function(rows) {
        return rows.map(function(r) {
          return {
            id: r.id.toString(),
            name: r.name,
            targetCount: r.target_count,
            color: r.color,
            createdAt: new Date(r.created_at).getTime()
          };
        });
      }
    },
    {
      cacheKey: 'checkin_cache_history',
      tableName: 'checkin_history',
      orderBy: null,
      stateProp: 'history',
      transform: function(rows) {
        var h = {};
        rows.forEach(function(r) {
          if (!h[r.date]) h[r.date] = {};
          h[r.date][r.task_id] = {
            count: r.count,
            completedAt: new Date(r.completed_at).getTime()
          };
        });
        return h;
      }
    }
  ],
  actions: {
    checkin: async function(sb, uid, a) {
      await sb.from('checkin_history').upsert({
        user_id: uid, task_id: a.taskId, date: a.date,
        count: a.count, completed_at: new Date(a.timestamp).toISOString()
      }, { onConflict: 'user_id,task_id,date' });
    },
    createTask: async function(sb, uid, a) {
      await sb.from('checkin_tasks').upsert({
        id: a.id, user_id: uid, name: a.name,
        target_count: a.targetCount, color: a.color,
        created_at: new Date(a.createdAt).toISOString()
      });
    },
    updateTask: async function(sb, uid, a) {
      await sb.from('checkin_tasks').update({
        name: a.name, target_count: a.targetCount, color: a.color
      }).eq('id', a.id).eq('user_id', uid);
    },
    deleteTask: async function(sb, uid, a) {
      await sb.from('checkin_tasks').delete().eq('id', a.id).eq('user_id', uid);
    },
    undoCheckin: async function(sb, uid, a) {
      await sb.from('checkin_history').delete()
        .eq('user_id', uid).eq('task_id', a.taskId).eq('date', a.date);
    }
  },
  init: function() {
    tasks = checkinState.tasks;
    history = checkinState.history;
    renderTasks();
    renderStats();
  },
  render: function(viewName) {
    if (viewName === 'viewCheckin') renderTasks();
  },
  fabClick: function() { openAddModal(); },
  escape: function() {
    if (document.getElementById('taskModalOverlay').classList.contains('show')) closeTaskModal();
    if (document.getElementById('backfillOverlay').classList.contains('show')) closeBackfill();
  },
  bindEvents: function() {
    document.getElementById('taskModalOverlay').onclick = function(e) { if (e.target === document.getElementById('taskModalOverlay')) closeTaskModal(); };
    document.getElementById('taskFormSubmit').onclick = saveTask;
    document.getElementById('taskColorInput').oninput = function() { updateColorSelection(document.getElementById('taskColorInput').value); };
    document.getElementById('backfillOverlay').onclick = function(e) { if (e.target === document.getElementById('backfillOverlay')) closeBackfill(); };

    // Sub-nav tab switching inside checkin view
    var checkinSubNav = document.querySelectorAll('#viewCheckin .sub-nav-item');
    checkinSubNav.forEach(function(btn) {
      btn.onclick = function() {
        var sub = btn.dataset.sub;
        checkinSubNav.forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
        document.getElementById('subCheckinList').classList.toggle('active', sub === 'checkinList');
        document.getElementById('subCheckinStats').classList.toggle('active', sub === 'checkinStats');
        if (sub === 'checkinStats') {
          statsYear = new Date().getFullYear();
          renderStats();
        }
        var fab = document.getElementById('fabBtn');
        if (fab) fab.style.display = sub === 'checkinList' ? '' : 'none';
      };
    });
  },
  onNavigate: function(viewName) {
    if (viewName === 'viewCheckin') {
      // Reset to checkin list tab
      var items = document.querySelectorAll('#viewCheckin .sub-nav-item');
      items.forEach(function(b) { b.classList.remove('active'); });
      if (items[0]) items[0].classList.add('active');
      document.getElementById('subCheckinList').classList.add('active');
      document.getElementById('subCheckinStats').classList.remove('active');
      var fab = document.getElementById('fabBtn');
      if (fab) fab.style.display = '';
    }
  },
  migrate: async function(data, sb, uid) {
    var inserted = 0, errors = 0;
    if (data.tasks) for (var i = 0; i < data.tasks.length; i++) {
      var t = data.tasks[i];
      var res = await sb.from('checkin_tasks').upsert({
        id: parseInt(t.id) || (Date.now() + i), user_id: uid, name: t.name,
        target_count: t.targetCount || 1, color: t.color || '#6b7db3',
        created_at: new Date(t.createdAt || Date.now()).toISOString()
      });
      if (res.error) errors++; else inserted++;
    }
    if (data.history) {
      var dates = Object.keys(data.history);
      for (var d = 0; d < dates.length; d++) {
        var dayData = data.history[dates[d]];
        for (var tid in dayData) {
          if (!dayData.hasOwnProperty(tid)) continue;
          var h = dayData[tid];
          var res = await sb.from('checkin_history').upsert({
            user_id: uid, task_id: parseInt(tid), date: dates[d],
            count: h.count || 1, completed_at: new Date(h.completedAt || Date.now()).toISOString()
          }, { onConflict: 'user_id,task_id,date' });
          if (res.error) errors++; else inserted++;
        }
      }
    }
    return { inserted: inserted, errors: errors };
  },
  export: function() {
    return { tasks: checkinState.tasks, history: checkinState.history };
  }
});
