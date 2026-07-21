/* ================================================================
   pocketbase-client.js — PocketBase 客户端初始化
   SDK CDN: https://cdn.jsdelivr.net/npm/pocketbase@latest/dist/pocketbase.umd.js
   ================================================================ */

// 从 config.js 读取 PocketBase URL，fallback 到默认值
var __PB_URL = (typeof CONFIG !== 'undefined' && CONFIG.pocketbase && CONFIG.pocketbase.url)
  ? CONFIG.pocketbase.url
  : 'http://localhost:8090';

let __pb = null;

function getPB() {
  if (!__pb) {
    if (typeof PocketBase === 'undefined') {
      throw new Error('PocketBase SDK 未加载，请检查 index.html 中的 CDN script 标签');
    }
    __pb = new PocketBase(__PB_URL);
    // Auto-persist auth store to localStorage
    __pb.authStore.onChange(function(token, model) {
      // authStore 自动保存到 localStorage（PocketBase SDK 默认行为）
    });
  }
  return __pb;
}

// ---- Helper: filter 值转义 ----
function pbEscape(val) {
  return String(val).replace(/"/g, '""');
}

// ---- Helper: upsert（先查后写，兼容原 Supabase upsert 行为）----
async function pbUpsert(collection, data, filter) {
  var pb = getPB();
  try {
    var record = await pb.collection(collection).getFirstListItem(filter);
    return await pb.collection(collection).update(record.id, data);
  } catch (e) {
    if (e.status === 404) {
      // 不存在 → 创建
      try {
        return await pb.collection(collection).create(data);
      } catch (createErr) {
        // 并发创建冲突 → 再试一次 update
        if (createErr.status === 400) {
          var record = await pb.collection(collection).getFirstListItem(filter);
          return await pb.collection(collection).update(record.id, data);
        }
        throw createErr;
      }
    }
    throw e;
  }
}
