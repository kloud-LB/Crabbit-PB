/* ================================================================
   migrate.js — v1.x localStorage 数据迁移到 Supabase
   ================================================================ */

async function migrateFromJSON(file) {
  var reader = new FileReader();
  reader.onload = async function(e) {
    try {
      var data = JSON.parse(e.target.result);
      if (!data.tasks && !data.history && !data.checkin && !data.todoCategories) {
        throw new Error('格式无效（无法识别的备份文件）');
      }

      var sb = getSupabase();
      var uid = authUser.id;
      if (!uid) { showToast('请先登录'); return; }

      var summary = Object.keys(data).map(function(k) {
        if (Array.isArray(data[k])) return k + ': ' + data[k].length + ' 项';
        if (typeof data[k] === 'object') return k + ': ' + Object.keys(data[k] || {}).length + ' 天';
        return k;
      }).join(', ');

      var msg = '即将迁移：' + summary + '\n到云端。当前云端数据不会被覆盖，确定继续？';
      if (!confirm(msg)) return;
      showToast('正在迁移中...', 6000);

      // Unified migration via module registry
      var results = await dbMigrateAll(data, sb, uid);

      // Refresh caches and reload
      await dbRefreshAllCaches(sb, uid);
      dbLoadAll(uid);

      var total = 0;
      for (var k in results) { total += results[k]; }
      showToast('迁移完成！共 ' + total + ' 条记录', 3000);

    } catch(err) {
      showToast('迁移失败：' + (err.message || '文件格式不正确'));
    }
  };
  reader.readAsText(file);
}

// Override import handler to use migration
function bindMigrateImport() {
  var input = document.getElementById('importFileInput');
  if (!input) return;
  input.onchange = function() {
    if (this.files && this.files[0]) {
      migrateFromJSON(this.files[0]);
      this.value = '';
    }
  };
}
