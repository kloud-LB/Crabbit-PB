/* ================================================================
   db.js — 通用数据引擎
   - 模块注册：DataModule(descriptor)
   - 缓存优先加载：dbLoadAll(uid)
   - 并行缓存刷新：dbRefreshAllCaches(sb, uid)
   - 表驱动队列重放：dbReplayAction(sb, uid, action)
   - 统一调度：dbRenderView / dbMigrateAll / dbExportAll
   ================================================================ */

var __modules = {};
var __tables = [];        // [{ moduleId, desc }]

// ================================================================
// 模块注册
// ================================================================

function DataModule(desc) {
  if (!desc.id) throw new Error('DataModule: id is required');
  if (!desc.state) throw new Error('DataModule: state object is required');

  __modules[desc.id] = desc;

  if (desc.tables) {
    desc.tables.forEach(function(t) {
      __tables.push({ moduleId: desc.id, desc: t });
    });
  }
}

function getModule(id) {
  return __modules[id] || null;
}

// ================================================================
// 缓存读写（uid 隔离，带时间戳）
// ================================================================

function dbCacheLoad(uid, cacheKey) {
  try {
    var raw = localStorage.getItem(cacheKey);
    if (!raw) return null;
    var parsed = JSON.parse(raw);
    return (parsed._uid === uid) ? parsed.data : null;
  } catch(e) { return null; }
}

function dbCacheSave(uid, cacheKey, data) {
  try {
    localStorage.setItem(cacheKey, JSON.stringify({
      _uid: uid, data: data, _ts: Date.now()
    }));
  } catch(e) { /* quota exceeded */ }
}

// ================================================================
// 缓存优先加载（同步渲染 + 后台刷新）
// ================================================================

function dbLoadAll(uid) {
  // Step 1: 同步读取所有缓存到模块 state
  for (var modId in __modules) {
    var mod = __modules[modId];
    if (!mod.tables) continue;
    mod.tables.forEach(function(t) {
      var cached = dbCacheLoad(uid, t.cacheKey);
      if (cached !== null && cached !== undefined) {
        mod.state[t.stateProp] = cached;
      }
    });
  }

  // Step 2: 调用各模块 init() — 从缓存即时渲染
  for (modId in __modules) {
    var m = __modules[modId];
    if (typeof m.init === 'function') {
      try { m.init(); } catch(e) { /* module init error */ }
    }
  }

  // Step 3: 后台从 Supabase 并行刷新
  if (typeof isOnline !== 'undefined' && isOnline) {
    var sb;
    try { sb = getSupabase(); } catch(e) { return; }
    dbRefreshAllCaches(sb, uid).then(function() {
      // 用最新缓存重新装载
      for (modId in __modules) {
        var mod2 = __modules[modId];
        if (!mod2.tables) continue;
        mod2.tables.forEach(function(t) {
          var fresh = dbCacheLoad(uid, t.cacheKey);
          if (fresh !== null && fresh !== undefined) {
            mod2.state[t.stateProp] = fresh;
          }
        });
        if (typeof mod2.init === 'function') {
          try { mod2.init(); } catch(e) {}
        }
      }
    });
  }
}

// ================================================================
// 并行缓存刷新（Promise.all 所有注册表）
// ================================================================

function dbRefreshAllCaches(sb, uid) {
  var promises = __tables.map(function(entry) {
    var t = entry.desc;
    var query = sb.from(t.tableName).select('*').eq('user_id', uid);
    if (t.orderBy) query = query.order(t.orderBy);
    return query.then(function(res) {
      if (!res.error) {
        var data = typeof t.transform === 'function' ? t.transform(res.data) : res.data;
        dbCacheSave(uid, t.cacheKey, data);
      }
    }).catch(function() { /* single table fail shouldn't block others */ });
  });
  return Promise.all(promises);
}

// ================================================================
// 表驱动队列重放
// ================================================================

function dbReplayAction(sb, uid, action) {
  var mod = __modules[action._module];
  if (mod && mod.actions && typeof mod.actions[action.type] === 'function') {
    return mod.actions[action.type](sb, uid, action);
  }
}

// ================================================================
// 统一调度
// ================================================================

function dbRenderView(viewName) {
  for (var modId in __modules) {
    var mod = __modules[modId];
    if (typeof mod.render === 'function') {
      try { mod.render(viewName); } catch(e) {}
    }
  }
}

function dbMigrateAll(data, sb, uid) {
  var results = {};
  var seen = {};

  // Pass 1: legacy key → module mapping
  var legacyMap = {
    'tasks': 'checkin',
    'history': 'checkin',
    'todoCategories': 'todo',
    'todoItems': 'todo'
  };

  var pending = [];
  for (var key in data) {
    var modId = legacyMap[key];
    if (modId && __modules[modId] && typeof __modules[modId].migrate === 'function') {
      pending.push((function(mid, k) {
        return __modules[mid].migrate(data, sb, uid).then(function(r) {
          if (r) { results[mid] = (results[mid] || 0) + (r.inserted || 0); }
        });
      })(modId, key));
      seen[modId] = true;
    }
  }

  // Pass 2: explicit module-key mapping
  for (modId in __modules) {
    if (data[modId] && __modules[modId].migrate && !seen[modId]) {
      pending.push((function(mid) {
        return __modules[mid].migrate(data[mid], sb, uid).then(function(r) {
          if (r) { results[mid] = (results[mid] || 0) + (r.inserted || 0); }
        });
      })(modId));
    }
  }

  return Promise.all(pending).then(function() { return results; });
}

function dbExportAll() {
  var result = { exportDate: typeof todayStr === 'function' ? todayStr() : new Date().toISOString().slice(0,10) };
  for (var modId in __modules) {
    var mod = __modules[modId];
    if (typeof mod.export === 'function') {
      try {
        var data = mod.export();
        for (var k in data) {
          if (data.hasOwnProperty(k)) result[k] = data[k];
        }
      } catch(e) {}
    }
  }
  return result;
}
