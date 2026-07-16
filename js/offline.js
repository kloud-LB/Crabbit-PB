/* ================================================================
   offline.js — 离线检测 + 操作队列 + 自动同步
   - 缓存读写由 db.js 统一管理（dbCacheLoad / dbCacheSave）
   - 队列重放由 db.js 统一表驱动（dbReplayAction）
   - 缓存刷新由 db.js 统一并行执行（dbRefreshAllCaches）
   ================================================================ */

const OFFLINE_QUEUE_KEY = 'checkin_offline_queue';

let isOnline = navigator.onLine;
let syncInProgress = false;

// ---- Network Detection ----
function initOffline() {
  var badge = document.getElementById('offlineBadge');
  window.addEventListener('online', function() {
    isOnline = true;
    document.body.classList.remove('is-offline');
    if (badge) badge.style.display = 'none';
    syncOfflineQueue();
  });
  window.addEventListener('offline', function() {
    isOnline = false;
    document.body.classList.add('is-offline');
    if (badge) badge.style.display = '';
  });
  if (!isOnline) {
    document.body.classList.add('is-offline');
    if (badge) badge.style.display = '';
  }
}

// ---- Offline Queue ----
function queueGet() {
  try { return JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY)) || []; }
  catch(e) { return []; }
}

function queueSet(items) {
  try { localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(items)); }
  catch(e) { /* quota exceeded */ }
}

function queuePush(action) {
  var q = queueGet();
  q.push(action);
  queueSet(q);
}

// ---- Sync ----
async function syncOfflineQueue() {
  if (!isOnline || syncInProgress) return;
  syncInProgress = true;
  try {
    var q = queueGet();
    if (q.length === 0) { syncInProgress = false; return; }
    var pb = getPB();
    var uid = pb.authStore.model ? pb.authStore.model.id : null;
    if (!uid) { syncInProgress = false; return; }

    // Filter out actions that may cause conflicts
    var remaining = [];
    for (var i = 0; i < q.length; i++) {
      var action = q[i];
      try {
        await dbReplayAction(pb, uid, action);
      } catch(e) {
        remaining.push(action);
      }
    }
    queueSet(remaining);

    // Refresh all caches from PocketBase (parallel, table-driven)
    await dbRefreshAllCaches(pb, uid);

  } catch(e) {
    /* re-sync later */
  }
  syncInProgress = false;
}
