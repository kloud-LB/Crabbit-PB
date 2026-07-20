/* ================================================================
   todo.js — 待办事项模块（数据 + 渲染 + 交互）
   ================================================================ */

// 全局状态：todoCategories[], todoItems[], todoFilterCategory,
// editingTodoId, editingCatId, postponeTodoId

const DEFAULT_CATEGORIES = [
  { id: 'cat_default_work', name: '工作', color: '#6b7db3', createdAt: 0 },
  { id: 'cat_default_life', name: '生活', color: '#ec4899', createdAt: 1 },
  { id: 'cat_default_study', name: '学习', color: '#22c55e', createdAt: 2 }
];

// ---- Data Layer ----
async function loadTodoCategoriesOnline() {
  if (isOnline) {
    try {
      var pb = getPB();
      var uid = authUser.id;
      var res = await pb.collection('todo_categories').getFullList({filter: 'user_id="' + pbEscape(uid) + '"', sort: '+created_at'});
      if (res && res.length > 0) {
        todoCategories = res.map(function(r) { return { id: r.id, name: r.name, color: r.color, createdAt: new Date(r.created_at).getTime() }; });
        if (uid) dbCacheSave(uid, 'checkin_cache_todo_categories', todoCategories);
        return;
      }
    } catch(e) { /* fallback */ }
  }
  if (authUser && typeof cacheGetTodoCategories === 'function') {
    var cached = dbCacheLoad(authUser.id, 'checkin_cache_todo_categories');
    if (cached) { todoCategories = cached; return; }
  }
  // Seed defaults
  todoCategories = JSON.parse(JSON.stringify(DEFAULT_CATEGORIES));
  if (isOnline && authUser) {
    for (var i = 0; i < todoCategories.length; i++) {
      var c = todoCategories[i];
      try { await pbUpsert('todo_categories', { id: c.id, user_id: authUser.id, name: c.name, color: c.color, created_at: new Date(0).toISOString() }, 'id="' + pbEscape(String(c.id)) + '"'); } catch(e) {}
    }
  }
  if (authUser) dbCacheSave(authUser.id, 'checkin_cache_todo_categories', todoCategories);
}

async function saveCategoryToServer(cat) {
  if (isOnline) {
    try { await pbUpsert('todo_categories', { id: cat.id, user_id: authUser.id, name: cat.name, color: cat.color, created_at: new Date(cat.createdAt).toISOString() }, 'id="' + pbEscape(String(cat.id)) + '"'); }
    catch(e) { queuePush({ _module: 'todo', type: 'updateCategory', id: cat.id, name: cat.name, color: cat.color }); }
  } else { queuePush({ _module: 'todo', type: 'updateCategory', id: cat.id, name: cat.name, color: cat.color }); }
  if (authUser) dbCacheSave(authUser.id, 'checkin_cache_todo_categories', todoCategories);
}

async function deleteCategoryFromServer(catId) {
  if (isOnline) {
    try { await getPB().collection('todo_categories').delete(String(catId)); }
    catch(e) { queuePush({ _module: 'todo', type: 'deleteCategory', id: catId }); }
  } else { queuePush({ _module: 'todo', type: 'deleteCategory', id: catId }); }
  if (authUser) dbCacheSave(authUser.id, 'checkin_cache_todo_categories', todoCategories);
}

async function loadTodoItemsOnline() {
  if (isOnline) {
    try {
      var pb = getPB();
      var uid = authUser.id;
      var res = await pb.collection('todo_items').getFullList({filter: 'user_id="' + pbEscape(uid) + '"', sort: '+created_at'});

        todoItems = res.map(function(r) { return { id: r.id.toString(), categoryId: r.category_id, title: r.title, description: r.description || '', deadline: r.deadline || null, priority: r.priority, status: r.status, createdAt: new Date(r.created_at).getTime(), completedAt: r.completed_at ? new Date(r.completed_at).getTime() : null }; });
        if (uid) dbCacheSave(uid, 'checkin_cache_todo_items', todoItems);
        return;
    } catch(e) { /* fallback */ }
  }
  if (authUser && typeof cacheGetTodoItems === 'function') {
    var cached = dbCacheLoad(authUser.id, 'checkin_cache_todo_items');
    if (cached) { todoItems = cached; return; }
  }
  todoItems = [];
}

async function saveTodoItemToServer(item) {
  if (isOnline) {
    try {
      await pbUpsert('todo_items', { id: item.id, user_id: authUser.id, category_id: item.categoryId, title: item.title, description: item.description || '', deadline: item.deadline || null, priority: item.priority, status: item.status, created_at: new Date(item.createdAt).toISOString(), completed_at: item.completedAt ? new Date(item.completedAt).toISOString() : null }, 'id="' + pbEscape(String(item.id)) + '"');
    } catch(e) {
      queuePush({ _module: 'todo', type: 'updateTodo', id: item.id, title: item.title, description: item.description, deadline: item.deadline, priority: item.priority, categoryId: item.categoryId, status: item.status, completedAt: item.completedAt });
    }
  } else {
    queuePush({ _module: 'todo', type: 'updateTodo', id: item.id, title: item.title, description: item.description, deadline: item.deadline, priority: item.priority, categoryId: item.categoryId, status: item.status, completedAt: item.completedAt });
  }
  if (authUser) dbCacheSave(authUser.id, 'checkin_cache_todo_items', todoItems);
}

async function deleteTodoItemFromServer(todoId) {
  if (isOnline) {
    try { await getPB().collection('todo_items').delete(todoId); }
    catch(e) { queuePush({ _module: 'todo', type: 'deleteTodo', id: todoId }); }
  } else { queuePush({ _module: 'todo', type: 'deleteTodo', id: todoId }); }
  if (authUser) dbCacheSave(authUser.id, 'checkin_cache_todo_items', todoItems);
}

// ---- Helpers ----
function getTodoDeadlineDisplay(item) {
  if (!item.deadline) return '';
  var d = new Date(item.deadline);
  var dateStr = d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate();
  var hours = d.getHours(), mins = d.getMinutes();
  if (hours === 0 && mins === 0) return dateStr;
  return dateStr + ' ' + String(hours).padStart(2, '0') + ':' + String(mins).padStart(2, '0');
}

function isTodoOverdue(item) {
  if (!item.deadline || (item.status !== 'pending' && item.status !== 'postponed')) return false;
  return new Date(item.deadline) < new Date();
}

function sortTodoItems(list) {
  var pOrder = { high: 0, medium: 1, low: 2 };
  var active = list.filter(function(i) { return i.status === 'pending' || i.status === 'postponed'; });
  var done = list.filter(function(i) { return i.status === 'completed' || i.status === 'cancelled'; });
  active.sort(function(a, b) {
    var pDiff = pOrder[a.priority] - pOrder[b.priority];
    if (pDiff !== 0) return pDiff;
    if (!a.deadline && !b.deadline) return a.createdAt - b.createdAt;
    if (!a.deadline) return 1;
    if (!b.deadline) return -1;
    return new Date(a.deadline) - new Date(b.deadline);
  });
  done.sort(function(a, b) {
    return (b.completedAt || b.createdAt) - (a.completedAt || a.createdAt);
  });
  return active.concat(done);
}

// ---- Render ----
function renderTodoPills() {
  var container = document.getElementById('todoPills');
  var counts = {};
  var total = todoItems.length;
  todoItems.forEach(function(item) {
    counts[item.categoryId] = (counts[item.categoryId] || 0) + 1;
  });

  var html = '<button class="todo-pill' + (todoFilterCategory === 'all' ? ' active' : '') +
    '" data-cat="all">全部 (' + total + ')</button>';
  todoCategories.forEach(function(cat) {
    var count = counts[cat.id] || 0;
    html += '<button class="todo-pill' + (todoFilterCategory === cat.id ? ' active' : '') +
      '" data-cat="' + cat.id + '">' + escHtml(cat.name) + ' (' + count + ')</button>';
  });
  html += '<button class="todo-pill manage-btn" id="manageCatBtn" title="管理分类">⚙</button>';
  container.innerHTML = html;

  container.onclick = function(e) {
    var pill = e.target.closest('.todo-pill');
    if (!pill) return;
    if (pill.id === 'manageCatBtn') { openCatManager(); return; }
    todoFilterCategory = pill.dataset.cat;
    renderTodoView();
  };
}

function renderTodoList() {
  var list = document.getElementById('todoList');
  var empty = document.getElementById('todoEmpty');
  var filtered = todoFilterCategory === 'all'
    ? todoItems.slice()
    : todoItems.filter(function(item) { return item.categoryId === todoFilterCategory; });

  if (filtered.length === 0) { list.innerHTML = ''; empty.style.display = ''; return; }
  empty.style.display = 'none';

  var sorted = sortTodoItems(filtered);
  list.innerHTML = sorted.map(function(item) {
    var cat = todoCategories.find(function(c) { return c.id === item.categoryId; });
    var catColor = cat ? cat.color : '#6b7db3';
    var statusCls = item.status === 'completed' ? ' completed' : (item.status === 'cancelled' ? ' cancelled' : '');
    var overdue = isTodoOverdue(item);
    var descHtml = item.description ? '<div class="todo-desc">' + escHtml(item.description) + '</div>' : '';

    var statusTag = '';
    if (item.status === 'completed') {
      statusTag = '<span class="todo-tag todo-tag-status-done">已完成</span>';
    } else if (item.status === 'cancelled') {
      statusTag = '<span class="todo-tag todo-tag-status-cancelled">已取消</span>';
    } else if (overdue) {
      statusTag = '<span class="todo-tag todo-tag-status-overdue">已超期</span>';
    } else {
      statusTag = '<span class="todo-tag todo-tag-status-progress">进行中</span>';
    }

    var pMap = { high: 'P0', medium: 'P1', low: 'P2' };
    var pLabel = pMap[item.priority] || 'P1';
    var pCls = 'todo-tag todo-tag-priority-' + (item.priority === 'high' ? 'p0' : (item.priority === 'low' ? 'p2' : 'p1'));
    var priorityTag = '<span class="' + pCls + '">' + pLabel + '</span>';

    var remainingTag = '';
    if (item.deadline && item.status !== 'completed' && item.status !== 'cancelled') {
      if (overdue) {
        remainingTag = '<span class="todo-tag todo-tag-remaining overdue">已超期</span>';
      } else {
        var daysLeft = Math.ceil((new Date(item.deadline) - new Date()) / 86400000);
        if (daysLeft < 0) daysLeft = 0;
        remainingTag = '<span class="todo-tag todo-tag-remaining">还剩' + daysLeft + '天</span>';
      }
    }

    var actionsHtml = '';
    if (item.status === 'pending' || item.status === 'postponed') {
      actionsHtml = '<div class="todo-actions">' +
        '<button class="todo-action-btn done-btn" data-action="complete" title="完成"><i class="ri-check-line"></i></button>' +
        '<button class="todo-action-btn postpone-btn" data-action="postpone" title="延期"><i class="ri-calendar-event-fill"></i></button>' +
        '<button class="todo-action-btn delete-btn" data-action="delete" title="删除"><i class="ri-delete-bin-fill"></i></button>' +
        '</div>';
    } else if (item.status === 'completed') {
      actionsHtml = '<div class="todo-actions">' +
        '<button class="todo-action-btn done-btn" data-action="undo" title="撤销完成"><i class="ri-arrow-go-back-line"></i></button>' +
        '<button class="todo-action-btn delete-btn" data-action="delete" title="删除"><i class="ri-delete-bin-fill"></i></button>' +
        '</div>';
    } else if (item.status === 'cancelled') {
      actionsHtml = '<div class="todo-actions">' +
        '<button class="todo-action-btn done-btn" data-action="restore" title="恢复"><i class="ri-arrow-go-back-line"></i></button>' +
        '<button class="todo-action-btn delete-btn" data-action="delete" title="删除"><i class="ri-delete-bin-fill"></i></button>' +
        '</div>';
    }

    return '<div class="todo-card' + statusCls + '" data-todo-id="' + item.id + '">' +
      '<div class="todo-bar" style="background:' + catColor + '"></div>' +
      '<div class="todo-body">' +
        '<div class="todo-title">' + escHtml(item.title) + '</div>' +
        descHtml +
        '<div class="todo-bottom">' +
          '<div class="todo-tags">' + statusTag + priorityTag + remainingTag + '</div>' +
          actionsHtml +
        '</div>' +
      '</div>' +
    '</div>';
  }).join('');

  list.onclick = function(e) {
    var btn = e.target.closest('.todo-action-btn');
    if (!btn) return;
    var card = btn.closest('.todo-card');
    if (!card) return;
    var todoId = card.dataset.todoId;
    var action = btn.dataset.action;
    e.stopPropagation();
    if (action === 'complete') completeTodo(todoId);
    else if (action === 'undo' || action === 'restore') restoreTodo(todoId);
    else if (action === 'postpone') openPostpone(todoId);
    else if (action === 'delete') confirmDeleteTodo(todoId);
  };
}

function renderTodoView() {
  renderTodoPills();
  renderTodoList();
}

// ---- Todo Form ----
function openTodoForm(todoId) {
  editingTodoId = todoId || null;
  document.getElementById('todoModalTitle').textContent = todoId ? '编辑待办' : '新建待办';
  document.getElementById('todoTitleInput').value = '';
  document.getElementById('todoDescInput').value = '';
  document.getElementById('todoDateInput').value = '';
  document.getElementById('todoTimeInput').value = '';
  // Reset priority to medium
  document.querySelectorAll('#priorityToggle .priority-opt').forEach(function(b) { b.classList.remove('selected'); });
  var med = document.querySelector('#priorityToggle .priority-opt.medium');
  if (med) med.classList.add('selected');

  // Populate category select
  var sel = document.getElementById('todoCategorySelect');
  sel.innerHTML = todoCategories.map(function(c) { return '<option value="' + c.id + '">' + escHtml(c.name) + '</option>'; }).join('');

  if (todoId) {
    var item = todoItems.find(function(t) { return t.id === todoId; });
    if (item) {
      document.getElementById('todoTitleInput').value = item.title;
      document.getElementById('todoDescInput').value = item.description || '';
      if (item.deadline) {
        var d = new Date(item.deadline);
        document.getElementById('todoDateInput').value = d.toISOString().slice(0,10);
        if (d.getHours() !== 0 || d.getMinutes() !== 0) {
          document.getElementById('todoTimeInput').value = String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
        }
      }
      sel.value = item.categoryId || '';
      document.querySelectorAll('#priorityToggle .priority-opt').forEach(function(b) { b.classList.remove('selected'); });
      var pri = document.querySelector('#priorityToggle .priority-opt.' + item.priority);
      if (pri) pri.classList.add('selected');
    }
  }

  document.getElementById('todoModalOverlay').classList.add('show');
}

function closeTodoForm() {
  document.getElementById('todoModalOverlay').classList.remove('show');
  editingTodoId = null;
}

function getSelectedPriority() {
  var sel = document.querySelector('#priorityToggle .priority-opt.selected');
  return sel ? sel.dataset.priority : 'medium';
}

async function saveTodoItemForm() {
  var title = document.getElementById('todoTitleInput').value.trim();
  if (!title) { showToast('请输入待办事项'); return; }
  var desc = document.getElementById('todoDescInput').value.trim();
  var dateVal = document.getElementById('todoDateInput').value;
  var timeVal = document.getElementById('todoTimeInput').value;
  var deadline = null;
  if (dateVal) {
    deadline = new Date(dateVal + (timeVal ? 'T' + timeVal + ':00' : 'T00:00:00')).toISOString();
  }
  var priority = getSelectedPriority();
  var catId = document.getElementById('todoCategorySelect').value;

  if (editingTodoId) {
    var idx = todoItems.findIndex(function(t) { return t.id === editingTodoId; });
    if (idx >= 0) {
      todoItems[idx].title = title;
      todoItems[idx].description = desc;
      todoItems[idx].deadline = deadline;
      todoItems[idx].priority = priority;
      todoItems[idx].categoryId = catId;
    }
  } else {
    todoItems.push({
      id: Date.now().toString() + Math.floor(Math.random()*100).toString().padStart(2,'0'), categoryId: catId, title: title,
      description: desc, deadline: deadline, priority: priority,
      status: 'pending', createdAt: Date.now(), completedAt: null
    });
  }

  var saved = editingTodoId ? todoItems.find(function(t) { return t.id === editingTodoId; }) : todoItems[todoItems.length - 1];
  await saveTodoItemToServer(saved);
  closeTodoForm(); renderTodoView();
  showToast(editingTodoId ? '待办已更新' : '待办已创建');
}

async function completeTodo(todoId) {
  var item = todoItems.find(function(t) { return t.id === todoId; });
  if (!item) return;
  if (item.status === 'completed') return;
  item.status = 'completed'; item.completedAt = Date.now();
  await saveTodoItemToServer(item);
  playDing(); renderTodoView();
}

async function restoreTodo(todoId) {
  var item = todoItems.find(function(t) { return t.id === todoId; });
  if (!item) return;
  item.status = 'pending'; item.completedAt = null;
  await saveTodoItemToServer(item);
  playUndo(); renderTodoView();
}

async function cancelTodo(todoId) {
  var item = todoItems.find(function(t) { return t.id === todoId; });
  if (!item) return;
  item.status = 'cancelled'; item.completedAt = Date.now();
  await saveTodoItemToServer(item);
  renderTodoView();
}

async function confirmDeleteTodo(todoId) {
  var item = todoItems.find(function(t) { return t.id === todoId; });
  if (!item) return;
  document.getElementById('confirmText').textContent = '确定要删除「' + item.title + '」吗？此操作不可恢复。';
  document.getElementById('confirmDialog').classList.add('show');
  confirmCallback = async function() {
    todoItems = todoItems.filter(function(t) { return t.id !== todoId; });
    await deleteTodoItemFromServer(todoId);
    document.getElementById('confirmDialog').classList.remove('show');
    renderTodoView(); showToast('待办已删除');
  };
}

// ---- Postpone ----
function openPostpone(todoId) {
  postponeTodoId = todoId;
  var item = todoItems.find(function(t) { return t.id === todoId; });
  if (item && item.deadline) {
    var d = new Date(item.deadline);
    document.getElementById('postponeDateInput').value = d.toISOString().slice(0,10);
    if (d.getHours() !== 0 || d.getMinutes() !== 0) {
      document.getElementById('postponeTimeInput').value = String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
    }
  } else {
    document.getElementById('postponeDateInput').value = '';
    document.getElementById('postponeTimeInput').value = '';
  }
  document.getElementById('postponeOverlay').classList.add('show');
}

function closePostpone() {
  document.getElementById('postponeOverlay').classList.remove('show');
  postponeTodoId = null;
}

async function applyPostpone(clearOnly) {
  var item = todoItems.find(function(t) { return t.id === postponeTodoId; });
  if (!item) return;
  if (clearOnly) {
    item.deadline = null; item.status = 'pending';
  } else {
    var dateVal = document.getElementById('postponeDateInput').value;
    var timeVal = document.getElementById('postponeTimeInput').value;
    if (dateVal) {
      item.deadline = new Date(dateVal + (timeVal ? 'T' + timeVal + ':00' : 'T00:00:00')).toISOString();
    }
    item.status = 'postponed';
  }
  await saveTodoItemToServer(item);
  closePostpone(); renderTodoView();
  showToast(clearOnly ? '截止时间已清除' : '已延期');
}

// ---- Category Management ----
function openCatManager() {
  document.getElementById('catList').innerHTML = todoCategories.map(function(c) {
    return '<div class="cat-item">' +
      '<div class="cat-dot" style="background:' + c.color + '"></div>' +
      '<span class="cat-name">' + escHtml(c.name) + '</span>' +
      '<div class="cat-actions">' +
        '<button class="btn-icon cat-edit-btn" data-cat-id="' + c.id + '" title="编辑" style="font-size:0.85rem"><i class="ri-edit-fill"></i></button>' +
        '<button class="btn-icon cat-delete-btn" data-cat-id="' + c.id + '" title="删除" style="font-size:0.85rem"><i class="ri-delete-bin-fill"></i></button>' +
      '</div>' +
    '</div>';
  }).join('');
  document.getElementById('catModalOverlay').classList.add('show');

  document.getElementById('catList').onclick = function(e) {
    var el = e.target.closest('.cat-edit-btn');
    if (el) { openCatEdit(el.dataset.catId); return; }
    el = e.target.closest('.cat-delete-btn');
    if (el) { confirmDeleteCategory(el.dataset.catId); return; }
  };
}

function closeCatManager() {
  document.getElementById('catModalOverlay').classList.remove('show');
}

function openCatEdit(catId) {
  editingCatId = catId;
  var cat = todoCategories.find(function(c) { return c.id === catId; });
  if (cat) {
    document.getElementById('catEditTitle').textContent = '编辑分类';
    document.getElementById('catNameInput').value = cat.name;
    document.getElementById('catColorInput').value = cat.color;
    updateCatColorSelection(cat.color);
  } else {
    editingCatId = null;
    document.getElementById('catEditTitle').textContent = '新建分类';
    document.getElementById('catNameInput').value = '';
    document.getElementById('catColorInput').value = '#6b7db3';
    updateCatColorSelection('#6b7db3');
  }
  document.getElementById('catEditOverlay').classList.add('show');
}

function closeCatEdit() {
  document.getElementById('catEditOverlay').classList.remove('show');
  editingCatId = null;
}

function updateCatColorSelection(color) {
  var html = COLORS.map(function(c) {
    return '<div class="color-preset' + (c === color ? ' selected' : '') + '" style="background:' + c + '" data-color="' + c + '"></div>';
  }).join('');
  document.getElementById('catColorPresets').innerHTML = html;
  document.querySelectorAll('#catColorPresets .color-preset').forEach(function(el) {
    el.onclick = function() {
      document.getElementById('catColorInput').value = el.dataset.color;
      updateCatColorSelection(el.dataset.color);
    };
  });
}

async function saveCatEdit() {
  var name = document.getElementById('catNameInput').value.trim();
  if (!name) { showToast('请输入分类名称'); return; }
  var color = document.getElementById('catColorInput').value;

  if (editingCatId) {
    var idx = todoCategories.findIndex(function(c) { return c.id === editingCatId; });
    if (idx >= 0) { todoCategories[idx].name = name; todoCategories[idx].color = color; }
  } else {
    todoCategories.push({ id: 'cat_' + Date.now(), name: name, color: color, createdAt: Date.now() });
  }
  var saved = editingCatId ? todoCategories.find(function(c) { return c.id === editingCatId; }) : todoCategories[todoCategories.length - 1];
  await saveCategoryToServer(saved);
  closeCatEdit(); openCatManager(); renderTodoView();
  showToast(editingCatId ? '分类已更新' : '分类已创建');
}

async function confirmDeleteCategory(catId) {
  var cat = todoCategories.find(function(c) { return c.id === catId; });
  if (!cat) return;
  todoCategories = todoCategories.filter(function(c) { return c.id !== catId; });
  // Reassign items in this category to the first available category
  var newCatId = todoCategories.length > 0 ? todoCategories[0].id : null;
  todoItems.forEach(function(item) {
    if (item.categoryId === catId) { item.categoryId = newCatId; }
  });
  await deleteCategoryFromServer(catId);
  // Save all reassigned items
  for (var i = 0; i < todoItems.length; i++) {
    if (todoItems[i].categoryId === newCatId) await saveTodoItemToServer(todoItems[i]);
  }
  openCatManager(); renderTodoView();
  showToast('分类「' + cat.name + '」已删除，任务已迁移');
}

// ---- Module Registration ----
var todoState = { todoCategories: [], todoItems: [] };

DataModule({
  id: 'todo',
  state: todoState,
  views: ['viewTodo'],
  tables: [
    {
      cacheKey: 'checkin_cache_todo_categories',
      tableName: 'todo_categories',
      orderBy: 'created_at',
      stateProp: 'todoCategories',
      transform: function(rows) {
        return rows.map(function(r) {
          return { id: r.id, name: r.name, color: r.color, createdAt: new Date(r.created_at).getTime() };
        });
      }
    },
    {
      cacheKey: 'checkin_cache_todo_items',
      tableName: 'todo_items',
      orderBy: 'created_at',
      stateProp: 'todoItems',
      transform: function(rows) {
        return rows.map(function(r) {
          return {
            id: r.id.toString(), categoryId: r.category_id,
            title: r.title, description: r.description || '',
            deadline: r.deadline || null, priority: r.priority,
            status: r.status, createdAt: new Date(r.created_at).getTime(),
            completedAt: r.completed_at ? new Date(r.completed_at).getTime() : null
          };
        });
      }
    }
  ],
  actions: {
    createTodo: async function(pb, uid, a) {
      pbUpsert('todo_items', {
        id: a.id, user_id: uid, category_id: a.categoryId || null,
        title: a.title, description: a.description || '',
        deadline: a.deadline || null, priority: a.priority || 'medium',
        status: a.status || 'pending', created_at: new Date(a.createdAt).toISOString()
      }, 'id="' + pbEscape(String(a.id)) + '"');
    },
    updateTodo: async function(pb, uid, a) {
      await pb.collection('todo_items').update(String(a.id), {
        title: a.title, description: a.description, deadline: a.deadline,
        priority: a.priority, category_id: a.categoryId, status: a.status,
        completed_at: a.completedAt ? new Date(a.completedAt).toISOString() : null
      });
    },
    deleteTodo: async function(pb, uid, a) {
      await pb.collection('todo_items').delete(String(a.id));
    },
    createCategory: async function(pb, uid, a) {
      pbUpsert('todo_categories', {
        id: a.id, user_id: uid, name: a.name, color: a.color,
        created_at: new Date(a.createdAt).toISOString()
      }, 'id="' + pbEscape(String(a.id)) + '"');
    },
    updateCategory: async function(pb, uid, a) {
      await pb.collection('todo_categories').update(String(a.id), {
        name: a.name, color: a.color
      });
    },
    deleteCategory: async function(pb, uid, a) {
      await pb.collection('todo_categories').delete(String(a.id));
    }
  },
  init: function() {
    todoCategories = todoState.todoCategories;
    todoItems = todoState.todoItems;
    // Seed default categories if empty
    if (todoCategories.length === 0 && isOnline && authUser) {
      todoCategories = JSON.parse(JSON.stringify(DEFAULT_CATEGORIES));
      for (var i = 0; i < todoCategories.length; i++) {
        var c = todoCategories[i];
        pbUpsert('todo_categories', {
          id: c.id, user_id: authUser.id, name: c.name,
          color: c.color, created_at: new Date(0).toISOString()
        }, 'id="' + pbEscape(String(c.id)) + '"').catch(function(){});
      }
      dbCacheSave(authUser.id, 'checkin_cache_todo_categories', todoCategories);
      todoState.todoCategories = todoCategories;
    }
    renderTodoView();
  },
  render: function(viewName) {
    if (viewName === 'viewTodo') renderTodoView();
  },
  fabClick: function() { openTodoForm(); },
  escape: function() {
    if (document.getElementById('todoModalOverlay').classList.contains('show')) closeTodoForm();
    if (document.getElementById('catModalOverlay').classList.contains('show')) closeCatManager();
    if (document.getElementById('catEditOverlay').classList.contains('show')) closeCatEdit();
    if (document.getElementById('postponeOverlay').classList.contains('show')) closePostpone();
  },
  bindEvents: function() {
    document.getElementById('todoModalOverlay').onclick = function(e) { if (e.target === document.getElementById('todoModalOverlay')) closeTodoForm(); };
    document.getElementById('todoFormSubmit').onclick = saveTodoItemForm;
    // Priority toggle click handler
    document.getElementById('priorityToggle').onclick = function(e) {
      var btn = e.target.closest('.priority-opt');
      if (!btn) return;
      document.querySelectorAll('#priorityToggle .priority-opt').forEach(function(b) { b.classList.remove('selected'); });
      btn.classList.add('selected');
    };
    document.getElementById('catModalOverlay').onclick = function(e) { if (e.target === document.getElementById('catModalOverlay')) closeCatManager(); };
    document.getElementById('catAddBtn').onclick = function() { openCatEdit(); };
    document.getElementById('catEditOverlay').onclick = function(e) { if (e.target === document.getElementById('catEditOverlay')) closeCatEdit(); };
    document.getElementById('catEditSubmit').onclick = saveCatEdit;
    document.getElementById('catColorInput').oninput = function() { updateCatColorSelection(document.getElementById('catColorInput').value); };
    document.getElementById('postponeOverlay').onclick = function(e) { if (e.target === document.getElementById('postponeOverlay')) closePostpone(); };
    document.getElementById('postponeSubmit').onclick = function() { applyPostpone(false); };
    document.getElementById('postponeClear').onclick = function() { applyPostpone(true); };
  },
  migrate: async function(data, sb, uid) {
    var inserted = 0, errors = 0;
    var catIds = {};
    if (data.todoCategories) for (var i = 0; i < data.todoCategories.length; i++) {
      var c = data.todoCategories[i];
      var res = pbUpsert('todo_categories', {
        id: c.id, user_id: uid, name: c.name, color: c.color,
        created_at: new Date(c.createdAt || Date.now()).toISOString()
      }, 'id="' + pbEscape(String(c.id)) + '"');
      catIds[c.id] = true;
      inserted++;
    }
    if (data.todoItems) for (var j = 0; j < data.todoItems.length; j++) {
      var item = data.todoItems[j];
      var res2 = pbUpsert('todo_items', {
        id: item.id || (Date.now() + j + 1000), user_id: uid,
        category_id: item.categoryId || null, title: item.title,
        description: item.description || '', deadline: item.deadline || null,
        priority: item.priority || 'medium', status: item.status || 'pending',
        created_at: new Date(item.createdAt || Date.now()).toISOString(),
        completed_at: item.completedAt ? new Date(item.completedAt).toISOString() : null
      }, 'id="' + pbEscape(String(item.id || (Date.now() + j + 1000))) + '"');
      inserted++;
    }
    return { inserted: inserted, errors: errors };
  },
  export: function() {
    return { todoCategories: todoState.todoCategories, todoItems: todoState.todoItems };
  }
});
