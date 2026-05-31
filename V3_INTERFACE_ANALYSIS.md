# Crabbit! V3 接口约束分析与优化建议

本文档分析当前 v2.x 项目的接口边界、数据流契约和架构约束，提出面向 V3 各阶段的优化建议，目标是：**每个 Phase 改动最少、各版本独立可用、未来新增 Agent 功能无需重写既有模块**。

---

## 一、当前接口清单

### 1.1 数据引擎层 (`db.js`)

**暴露的公共函数**（全局作用域）：

| 函数 | 签名 | 调用者 | 用途 |
|------|------|--------|------|
| `DataModule` | `(descriptor) → void` | 各模块文件 | 注册模块，加入 `__modules` 和 `__tables` |
| `getModule` | `(id) → descriptor \| null` | 暂无调用者 | 按 id 获取已注册模块 |
| `dbCacheLoad` | `(uid, cacheKey) → data \| null` | auth.js、各模块 | 读 localStorage 缓存（验证 `_uid` 归属） |
| `dbCacheSave` | `(uid, cacheKey, data) → void` | auth.js、各模块 | 写 localStorage 缓存（附加 `_uid` + `_ts`） |
| `dbLoadAll` | `(uid) → void` | auth.js → onUserReady | 缓存→init→后台 Supabase 刷新 |
| `dbRefreshAllCaches` | `(sb, uid) → Promise` | offline.js、migrate.js | 并行 SELECT 所有注册表，写入缓存 |
| `dbReplayAction` | `(sb, uid, action) → Promise` | offline.js | 离线队列回放，按 `action._module` 路由 |
| `dbRenderView` | `(viewName) → void` | app.js → navigateTo | 通知各模块 render |
| `dbMigrateAll` | `(data, sb, uid) → Promise<results>` | migrate.js | 导入数据 |
| `dbExportAll` | `() → object` | app.js → exportData | 导出所有模块数据 |

**引擎内部数据结构**：

```
__modules = {
  checkin:  { id, state, views, tables, actions, init, render, fabClick, escape, bindEvents, onNavigate, migrate, export },
  todo:     { ... },
  bookkeeping: { ... },
  stats:    { id, state, views, tables, render }   // stats 无 tables/actions
}

__tables = [
  { moduleId: 'checkin', desc: { cacheKey, tableName, orderBy, stateProp, transform } },
  { moduleId: 'checkin', desc: { cacheKey, tableName, orderBy, stateProp, transform } },
  { moduleId: 'todo',    desc: { ... } },
  ...
]
```

### 1.2 DataModule 描述符契约

```javascript
DataModule({
  id:        string,           // 必填，唯一标识
  state:     object,           // 必填，模块持久状态容器（用于缓存注入）
  views:     string[],         // 可选，此模块响应的视图列表
  tables:    TableDescriptor[],// 可选，注册到缓存系统的表定义
  actions:   { name: (sb, uid, action) => Promise },  // 可选，离线队列回放函数
  init:      () => void,       // 可选，缓存加载后调用
  render:    (viewName) => void,// 可选，视图切换时调用
  fabClick:  () => void,       // 可选，FAB 按钮点击时调用
  escape:    () => void,       // 可选，Esc 键按下时调用
  bindEvents:() => void,       // 可选，DOM 事件绑定（启动时调用一次）
  onNavigate:(viewName, prev) => void,  // 可选，导航后状态重置
  migrate:   (data, sb, uid) => Promise<{inserted,errors}>, // 可选，导入
  export:    () => object,     // 可选，导出
})
```

**TableDescriptor 契约**：

```javascript
{
  cacheKey:  string,           // localStorage key
  tableName: string,           // Supabase 表名
  orderBy:   string | null,    // 排序字段
  stateProp: string,           // 注入到 state 对象的属性名
  transform: (rows) => any,    // 服务端数据 → 前端格式 的映射函数
}
```

### 1.3 Supabase 客户端层 (`supabase-client.js`)

| 接口 | 类型 | 说明 |
|------|------|------|
| `SUPABASE_URL` | `const` | 硬编码项目 URL |
| `SUPABASE_ANON_KEY` | `const` | 硬编码 anon key |
| `getSupabase()` | `() => SupabaseClient` | 懒初始化单例，含 URL 前缀检查 |

### 1.4 认证层 (`auth.js`)

**全局状态**：

| 变量 | 类型 | 说明 |
|------|------|------|
| `authUser` | `object \| null` | 当前登录用户（Supabase `auth.users` 行） |
| `userProfile` | `{ nickname, avatar }` | 用户资料 |

**关键函数**：

| 函数 | 说明 |
|------|------|
| `initAuth()` | 检查 session → 设置 authUser → 监听 onAuthStateChange → 返回 bool |
| `onUserReady()` | 用户登录后的回调：loadUserProfile → dbLoadAll → syncOfflineQueue |
| `loadUserProfile(uid)` | 缓存优先加载用户资料 |
| `saveUserProfile()` | 写入 Supabase + 缓存 |

### 1.5 离线层 (`offline.js`)

| 接口 | 说明 |
|------|------|
| `isOnline` | 全局变量，由 online/offline 事件驱动 |
| `queuePush(action)` | 离线时入队操作（action 含 `_module` + `type`） |
| `syncOfflineQueue()` | 回放队列 → 刷新缓存 |
| `initOffline()` | 绑定网络事件 + UI badge |

### 1.6 应用入口层 (`app.js`)

**全局状态（跨模块共享）**：

```
tasks[], history{}, todoCategories[], todoItems[], bkRecords[]
currentView, previousView, statsYear
editingTaskId, editingTodoId, editingCatId, postponeTodoId, backfillTaskId
confirmCallback, toastTimer, lastClickTime, audioCtx
```

**工具函数（全局作用域）**：

```
$, $$, todayStr(d), fmtDate(str), weekday(str), escHtml(s)
showToast(msg, duration), playDing(), playUndo(), showCheckmark(card)
navigateTo(viewName), navigateBack(), switchView(viewName)
exportData(), applyTheme(theme), toggleTheme()
```

### 1.7 各模块数据操作模式

每个模块遵循相同模式（以 checkin 为例）：

```
用户点击 → handleCheckin(taskId, card)
  → 修改全局 history[today][taskId]
  → saveCheckinEntry(taskId, date, count, ts)
     → 在线: getSupabase().from('checkin_history').upsert(...)
     → 离线: queuePush({_module:'checkin', type:'checkin', ...})
  → renderTasks()
  → playDing()
```

**关键观察**：每个模块的 Supabase 写入都是**原始调用**，没有经过统一抽象层。

### 1.8 ID 生成策略

当前所有模块使用 `Date.now().toString()` 生成 ID：

```
checkin.js:240  → { id: Date.now().toString(), ... }
todo.js:331     → { id: Date.now().toString(), ... }
bookkeeping.js:217 → { id: Date.now().toString(), ... }
```

### 1.9 DOM 约定

- 视图容器：`.view` class + `id="viewXxx"` 命名
- 视图切换：`navigateTo(viewName)` → `classList.add('active')`
- 模态框：`.modal-overlay` class，点击遮罩关闭
- 子导航：`.sub-nav` / `.sub-nav-item` pattern
- 每个模块自己管理 DOM 事件绑定和清理

---

## 二、V3 新需求与现有接口的摩擦点

### 2.1 摩擦点总览

```
                    PWA (浏览器)                    Agent (Mac Mini Python)
                    ────────────                    ────────────────────────
 数据写入    →  直接调用 Supabase JS SDK      →  直接调用 Supabase Python SDK
 数据读取    →  dbRefreshAllCaches()          →  Supabase Python SDK
 缓存层      →  localStorage (uid 隔离)       →  无缓存（直连 Supabase）
 离线队列    →  queuePush / syncOfflineQueue   →  不参与
 认证        →  auth.signInWithPassword()      →  service_role key（绕过 RLS）
 用户管理    →  auth.js (DOM + localStorage)   →  user_qq_bindings 表
```

**核心矛盾**：PWA 和 Agent 是两套完全独立的代码库和数据访问路径。PWA 对 Agent 的存在无感知，Agent 对 PWA 的缓存层也无感知。

### 2.2 具体摩擦点

#### 摩擦点 1：PWA 无法感知 Agent 写入的数据变更

**现状**：PWA 只在 `dbLoadAll()`（登录时调用一次）和 `syncOfflineQueue()` 中刷新数据。此后用户在各页面切换时不自动重新查询 Supabase——始终依赖登录时缓存的数据。

**影响**：用户在 QQ 记账后打开 PWA，看不到新记录，除非手动重新登录或触发离线队列同步。

**涉及接口**：`dbLoadAll`、`dbRefreshAllCaches`、离线同步触发条件

#### 摩擦点 2：ID 生成策略缺乏全局协调

**现状**：各处用 `Date.now().toString()` 生成 ID。时钟偏差或并发写入可能导致冲突。数据库 schema 中 ID 类型为 `BIGINT`，Agent 用 Python `int(time.time() * 1000)` 生成毫秒时间戳也会落在这个范围内。

**影响**：PWA 和 Agent 同时创建数据时，极小概率的 ID 冲突会导致写入失败或被覆盖。

**涉及文件**：`checkin.js:240`、`todo.js:331`、`bookkeeping.js:217`、Agent 端待实现

#### 摩擦点 3：Supabase 直调用没有抽象层

**现状**：每个模块直接调用 `getSupabase().from('xxx').select/upsert/delete`。Supabase URL 硬编码在 `supabase-client.js`，anon key 也写死。

**影响 V3**：
- 切换 Supabase 实例（云 → 自托管）需要改代码
- Agent 工具需要知道每张表的字段名和 snake_case ↔ camelCase 映射
- PWA 和 Agent 各自维护一套 Supabase 访问代码，表结构变更需要两边同步

**涉及文件**：所有 `js/*.js`（除 `stats.js`）

#### 摩擦点 4：认证体系不兼容 Agent 场景

**现状**：`initAuth()` 假定浏览器环境（localStorage session、DOM 操作）。`onUserReady()` 触发 `dbLoadAll` + `syncOfflineQueue`。

**影响**：Agent 使用 service_role key（拥有全部权限），PWA 使用 anon key + RLS。两条认证路径不交汇。`user_qq_bindings` 的绑定流程需要在 PWA 端新增 UI，Agent 端新增检测逻辑。

#### 摩擦点 5：离线队列不感知 Agent

**现状**：`queuePush` 只在 PWA 离线时被调用。队列数据结构是 `{ _module, type, ... }`，依赖 `__modules` 注册表中的 `actions` 函数回放。

**影响**：Agent 直接写入 Supabase，不经过队列。如果 Agent 写入时 Supabase 恰好不可用，没有退路——但这在自托管场景中不太可能（Agent 和 Supabase 在同一台 Mac Mini 上）。

**结论**：影响不大，但离线队列的设计假设（"所有写入都来自 PWA"）值得记录。

#### 摩擦点 6：全局状态变量分散

**现状**：`tasks[]`、`todoItems[]` 等在 `app.js` 声明，在各模块中被赋值和修改。DataModule 的 `state` 对象与全局变量存在冗余引用（见 `checkin.js:389-391`：`tasks = checkinState.tasks`）。

**影响**：新增 Agent 相关状态（如 `agentJobs[]`、`qqBindingStatus`）时，没有明确的"该在哪里声明"的规则。

#### 摩擦点 7：Schema 信息不可被外部读取

**现状**：`__tables` 数组包含每个表的 `tableName`、`cacheKey`、`orderBy`、`transform`，但没有字段级别的 schema 定义（字段名、类型、必填、校验规则）。

**影响**：Agent 工具需要知道"bookkeeping_records 表有哪些字段"，这些信息目前只在 JS 代码的 Supabase 调用参数中隐式存在。Python Agent 无法读取这些信息来自动生成工具参数。

#### 摩擦点 8：CSS 单体文件

**现状**：`css/app.css` 约 40KB，包含所有组件的样式，无分层、无前缀隔离。

**影响**：V3 新增 UI（QQ 绑定面板、Agent 对话窗口等）只能追加到同一文件末尾，长期会难以维护。

#### 摩擦点 9：视图系统硬编码

**现状**：所有视图的 HTML 写在 `index.html` 中，`VIEW_TITLES` 硬编码在 `app.js`。新增视图需要同时修改 HTML 和 JS。

**影响**：Phase 0 新增 QQ 绑定设置页需要改两处。Phase 5 新增 PWA 内嵌对话窗口也需要同样的操作。

---

## 三、优化建议

### 3.1 配置层提取 — 优先级最高

**现状**：`SUPABASE_URL` 和 `SUPABASE_ANON_KEY` 硬编码在 `supabase-client.js`。V3 还有 `DEEPSEEK_API_KEY` 等新密钥。

**建议**：创建 `js/config.js`，统一管理所有环境变量：

```javascript
// js/config.js — 唯一配置入口
const CONFIG = {
  supabase: {
    url:    'https://krvztfxtybxnlqauefhz.supabase.co',
    anonKey:'eyJhbGciOi...',
  },
  // V3 预留
  agent: {
    wsUrl: null,       // Agent WebSocket 地址（PWA 内嵌对话用，Phase 5）
    enabled: false,    // 是否启用 Agent 功能
  }
};
```

**收益**：
- 自托管部署时只改一个文件
- V3 新增配置项不会散落各处
- 后续可加 `.env` 文件支持（通过简单的脚本注入）

**涉及 Phase**：Phase 0（立刻做）

---

### 3.2 数据变更事件系统 — 优先级最高

**现状**：Agent 写入数据后，PWA 无感知。

**建议**：在 `db.js` 中添加轻量的事件发布/订阅：

```javascript
// db.js 新增
var __listeners = {};

function dbOn(event, callback) {
  if (!__listeners[event]) __listeners[event] = [];
  __listeners[event].push(callback);
}

function dbEmit(event, payload) {
  (__listeners[event] || []).forEach(function(fn) { try { fn(payload); } catch(e) {} });
}
```

**使用方式**：

```javascript
// PWA 端：页面可见时拉取最新数据
document.addEventListener('visibilitychange', function() {
  if (!document.hidden && authUser) {
    dbRefreshAllCaches(getSupabase(), authUser.id).then(function() {
      dbEmit('data-refreshed', {});
    });
  }
});

// 各模块监听数据变更
dbOn('data-refreshed', function() {
  renderTasks();
  renderStats();
});
```

**不要做成**：WebSocket 实时推送、Supabase Realtime 订阅。太重了，Phase 1 不需要。

**收益**：
- Agent 写入数据后，用户切回 PWA 自动看到最新数据
- 各模块解耦——不需要在 `navigateTo` 里手动调用每个 render

**涉及 Phase**：Phase 0

---

### 3.3 ID 生成策略统一 — 优先级高

**现状**：`Date.now().toString()` 分散在各处，Agent 端同理。

**建议**：在 `db.js` 中添加统一的 ID 生成函数：

```javascript
// db.js 新增
var __idCounter = 0;

function dbGenId(prefix) {
  // 格式: {毫秒时间戳}{4位随机}{递增序号}
  // 例如: 1778509707123a00b1
  __idCounter++;
  var ts = Date.now().toString(36);          // 36进制压缩
  var rnd = Math.floor(Math.random() * 10000).toString(36).padStart(3, '0');
  var seq = __idCounter.toString(36).padStart(2, '0');
  return (prefix || '') + ts + rnd + seq;
}
```

**使用**：

```javascript
// 改前
var newTask = { id: Date.now().toString(), ... };

// 改后
var newTask = { id: dbGenId('t_'), ... };
// 生成示例: "t_lx8k2m_9a3_b5"
```

**收益**：
- PWA 和 Agent 可以各自独立生成 ID，冲突概率接近零
- 36 进制压缩后比纯毫秒时间戳更短
- 带前缀方便调试（`t_` = task，`td_` = todo，`bk_` = bookkeeping）

**注意**：需要同步修改数据库 schema 中 `id BIGINT` → `id TEXT`（或将现有 BIGINT 改为 TEXT）。如果不想改已有数据，Agent 端也用毫秒时间戳作为 BIGINT，加上一个小的随机偏移避免冲突。

**涉及 Phase**：Phase 0（决定方案），Phase 1 agent 实现时落实

---

### 3.4 数据访问助手层 — 优先级中

**现状**：每个模块直接 `getSupabase().from('xxx').select('*').eq('user_id', uid)`。

**建议**：在 `db.js` 中添加通用的 CRUD 助手，减少重复代码，同时也作为 Agent 工具的参数参考：

```javascript
// db.js 新增
function dbFetch(uid, cacheKey, tableName, orderBy, transform) {
  // 在线 → Supabase → 缓存 → 返回
  // 离线 → 缓存 → 返回
}

function dbUpsert(uid, cacheKey, tableName, record) {
  // 在线 → Supabase upsert → 更新缓存
  // 离线 → 入队 → 更新缓存 → 返回
}

function dbDelete(uid, cacheKey, tableName, id) {
  // 在线 → Supabase delete → 更新缓存
  // 离线 → 入队 → 更新缓存 → 返回
}
```

**收益**：
- 每个模块的 `saveXxxToServer` / `deleteXxxFromServer` / `loadXxxOnline` 可以简化为一行调用
- 缓存逻辑、离线回退逻辑集中在一个地方
- Agent 端 Python 代码可以参照同一套语义实现

**代价**：需要重构现有模块的数据函数，触面较大

**涉及 Phase**：Phase 1（如果时间允许）或 Phase 2

---

### 3.5 模块 Schema 导出 — 优先级中

**现状**：`__tables` 只有表级别信息，没有字段级别。

**建议**：扩展 `TableDescriptor`，添加 `columns` 字段：

```javascript
tables: [{
  cacheKey: 'checkin_cache_tasks',
  tableName: 'checkin_tasks',
  orderBy: 'created_at',
  stateProp: 'tasks',
  columns: [
    { name: 'id',           type: 'text',    required: true  },
    { name: 'user_id',      type: 'uuid',    required: true, auth: true },
    { name: 'name',         type: 'text',    required: true  },
    { name: 'target_count', type: 'integer', required: false, default: 1 },
    { name: 'color',        type: 'text',    required: false, default: '#6b7db3' },
    { name: 'created_at',   type: 'datetime',required: false, auto: true },
  ],
  transform: function(rows) { ... }
}]
```

**收益**：
- 可以自动生成 Agent 工具的 JSON Schema（LLM Function Call 的参数定义）
- 可以自动生成表单校验规则
- Python Agent 可以读取 schema 来生成 SQL 或 API 调用

**提供方式**：PWA 加载后，`dbGetSchema()` 返回所有注册表的字段定义 JSON。Agent 启动时通过 HTTP 请求 PWA 的这个接口，或直接共享一份 `schema.json` 文件。

**涉及 Phase**：Phase 0 定义格式，Phase 1 Agent 实际使用

---

### 3.6 应用状态集中管理 — 优先级低

**现状**：全局变量分散在 `app.js` 声明，各模块读写。DataModule 的 `state` 对象与全局变量存在双份引用。

**建议**：将跨模块共享的状态收敛到 `db.js` 的 `__modules` 中，通过 getter/setter 访问：

```javascript
// 改前
tasks.push(newTask);
renderTasks();

// 改后
var mod = getModule('checkin');
mod.state.tasks.push(newTask);
dbEmit('checkin:tasks-changed', mod.state.tasks);
```

但这在 Vanilla JS 中引入复杂度，不如直接保持现有模式。**建议暂不改动**，只需在新模块（如 Agent 绑定模块）中遵循相同模式即可。

**涉及 Phase**：不做，或 Phase 5 整体重构时考虑

---

### 3.7 CSS 文件分层 — 优先级低

**现状**：单个 40KB CSS 文件。

**建议**：按模块拆分为多个文件，`index.html` 中按顺序加载：

```
css/reset.css       (现有的基础重置和变量)
css/layout.css      (header、nav、view、modal)
css/checkin.css     (打卡卡片、热力图)
css/todo.css        (待办卡片、分类标签)
css/bookkeeping.css (计算器、趋势图、分类网格)
css/auth.css        (登录/注册卡片、用户面板)
css/agent.css       (V3 新增：绑定面板、对话窗口)
```

**收益**：V3 新增 UI 时只需新建一个 CSS 文件，不触碰现有的 40KB。

**代价**：增加 HTTP 请求数（可用构建工具合并，但那又引入了构建步骤——与项目"零依赖"原则冲突）。

**折中方案**：先用 CSS 注释分段，V3 新增样式追加在末尾并用明显的注释分隔。

**涉及 Phase**：Phase 0 或不做（视团队偏好）

---

### 3.8 视图注册机制 — 优先级低

**现状**：所有视图 HTML 写在 `index.html`，`VIEW_TITLES` 硬编码在 `app.js`。

**建议**：添加视图注册函数，让新模块可以声明自己的视图：

```javascript
// app.js 新增
function registerView(viewName, title, options) {
  VIEW_TITLES[viewName] = title;
  // options.container → 动态创建 div#viewXxx 并插入 DOM
  // options.fabVisible → 控制此视图的 FAB 显隐
}
```

**收益**：Phase 0 新增 QQ 绑定视图时，不需要碰 `index.html` 和 `VIEW_TITLES`。

**涉及 Phase**：Phase 0（如果 Phase 0 涉及 UI 改动）

---

### 3.9 认证抽象 — 优先级低

**现状**：`auth.js` 假定浏览器环境（DOM 操作 + localStorage）。

**建议**：将认证逻辑拆为两层：

1. `auth-core.js` — 纯数据层：signIn、signUp、signOut、getUser、onAuthChange（无 DOM 操作）
2. `auth-ui.js` — UI 层：登录表单、用户面板、头像选择（调用 core 层）

当前 `auth.js` 体积 470+ 行，已经偏大。拆分后 Agent 绑定的 UI 逻辑可以简单追加。

**涉及 Phase**：Phase 3-4（不紧急）

---

## 四、分阶段实施路径

### Phase 0（v2.3）— 打好地基

| # | 优化项 | 改动的文件 | 工作量 |
|---|--------|-----------|--------|
| 1 | **配置层提取** `js/config.js` | 新建 `config.js`，改 `supabase-client.js:8-9` | 30min |
| 2 | **数据变更事件** `dbOn/dbEmit` | `db.js` 新增 10 行 | 15min |
| 3 | **页面可见性刷新** | `app.js` init 中加 `visibilitychange` 监听 | 15min |
| 4 | **表 Schema 定义格式** | `db.js` TableDescriptor 扩展 columns 字段 | 30min |
| 5 | **数据库新增 5 张 agent 表** | `schema.sql` 追加 | 20min |
| 6 | **PWA 新增 QQ 绑定 UI** | `index.html` + `auth.js` 用户面板 | 2h |

**Phase 0 不改动已有业务逻辑**，只做基础设施面的扩展。

### Phase 1（v3.0）— 核心链路

| # | 涉及 | 说明 |
|---|------|------|
| 1 | Agent 端 Python 代码 | 读 `dbGetSchema()` 自动生成 Tool 参数 |
| 2 | 数据访问模式 | Agent 使用 Supabase Python SDK，参照 PWA 的 `__tables` + `columns` 定义来构建查询 |
| 3 | ID 生成 | PWA 和 Agent 统一用 `dbGenId()` 等效逻辑 |

**Phase 1 不改动 PWA 已有模块**。Agent 是一个独立的 Python 进程，只读写 Supabase——对 PWA 的影响仅体现在"Agent 写了数据后 PWA 能即时显示"（Phase 0 的 visibility 刷新已解决）。

### Phase 2（v3.1）— 定时推送 + 联网搜索

| # | 涉及 | 说明 |
|---|------|------|
| 1 | 新增 CSS | `css/agent.css` 或 `app.css` 末尾追加 |
| 2 | PWA 展示 Agent 定时推送摘要 | 新建一个数据读取模块 `agentStats.js`（DataModule，只读 supabase，无写入） |

**Phase 2 不改动已有模块**。新增的 `agentStats` 模块通过 DataModule 注册，渲染推送日志到 PWA 的一个新视图。

### Phase 3-4（v3.2-v3.3）— 智能推送 + 对话记忆

| # | 涉及 | 说明 |
|---|------|------|
| 1 | 用户画像 | PWA 端可展示 Agent 学习的习惯摘要（只读 agent_user_context 表） |
| 2 | 对话历史 | 可选：PWA 内嵌对话窗口，需要 WebSocket 连接 Agent |

**Phase 3-4 对 PWA 的改动集中在新增 UI 组件上**，已有模块完全不受影响。

### Phase 5（v4.0）— 多通道

| # | 涉及 | 说明 |
|---|------|------|
| 1 | 多通道绑定 UI | 类似 QQ 绑定面板，增加 Telegram/钉钉 绑定入口 |
| 2 | PWA 内嵌对话 | `index.html` 新增视图 + WebSocket 聊天组件 |

---

## 五、各 Phase 改动文件汇总

```
文件                    Phase 0  Phase 1  Phase 2  Phase 3-4  Phase 5
─────────────────────────────────────────────────────────────────────
js/config.js            新建 ✅
js/db.js                修改 ✅
js/supabase-client.js   修改 ✅
js/app.js               修改 ✅    不动      不动      不动        修改
js/auth.js              修改 ✅    不动      不动      不动        修改
js/checkin.js           不动       不动      不动      不动        不动
js/todo.js              不动       不动      不动      不动        不动
js/bookkeeping.js       不动       不动      不动      不动        不动
js/stats.js             不动       不动      不动      不动        不动
js/offline.js           不动       不动      不动      不动        不动
js/migrate.js           不动       不动      不动      不动        不动
index.html              修改 ✅    不动      修改      修改        修改
css/app.css             不动       不动      修改      修改        修改
supabase/schema.sql     修改 ✅    不动      不动      不动        不动
─────────────────────────────────────────────────────────────────────
Agent Python (新项目)    不动      Agent     Agent     Agent       Agent
```

**关键原则**：
- `checkin.js` / `todo.js` / `bookkeeping.js` / `stats.js` / `offline.js` / `migrate.js`：从 Phase 1 到 Phase 5 **均无需修改**。它们是稳定的业务模块，只通过 Supabase 与外界交互。
- Agent 的加入是一个**并行写入者**，它不改变 PWA 已有模块的内部逻辑，只需要 PWA 在合适的时机（页面可见、定时轮询）刷新缓存。
- 所有改动集中在 `db.js`（引擎增强）、`app.js`（入口逻辑）、`auth.js`（用户面板扩展）、静态 HTML/CSS（新增 UI 组件）。

---

## 六、一个贯穿 V3 全阶段的例子

以「用户在 QQ 记账 → PWA 自动显示」这个最典型的跨系统场景为例：

```
Phase 0（地基）:
  1. 配置层提取：config.js 中有 supabase.url → PWA 和 Agent 共享同一 Supabase
  2. 事件系统：dbOn('data-refreshed', render) 注册好了
  3. 页面可见性：切回 PWA 自动触发 dbRefreshAllCaches
  4. Schema 定义：bookkeeping 表的 columns 写好了

Phase 1（核心链路）:
  5. Agent 启动时读取 __tables 中的 bookkeeping 表定义
  6. Agent 自动生成 record_expense 工具的 LLM function call schema
  7. Agent 收到 QQ 消息 → 识别意图 → 写入 bookkeeping_records
  8. 用户切回 PWA → visibilitychange → dbRefreshAllCaches → dbEmit → renderBkRecordsView

Phase 2（定时推送）:
  9. Agent 每周一 10:00 自动查询上周消费 → 生成报告 → QQ 推送
  10. no PWA code change needed — 数据已经在 Supabase 里

Phase 3（智能推送）:
  11. Agent 检测到本周消费超上周 150% → QQ 预警
  12. PWA 可选：在主页展示 Agent 推送摘要卡片（新增视图组件）

Phase 4（上下文记忆）:
  13. 用户："上次那个改成 50" → Agent 查对话历史 → 找到上次记账 ID →更新
  14. no PWA code change needed

Phase 5（多通道）:
  15. 同一套 Agent 逻辑 → 新增 Telegram Webhook → 无需改 PWA
  16. PWA 可选：内嵌对话窗口（WebSocket 到 Agent）
```

**数据所有权不变**：所有数据始终存在用户自己的 Supabase 实例中。Agent 只是另一个客户端，PWA 只是另一个客户端，它们读写同一份数据。

---

## 七、不做的事情

以下是有意不在本建议中推荐的事项，以及原因：

| 不推荐 | 原因 |
|--------|------|
| 引入 React/Vue 框架 | 项目核心卖点是"零依赖"，框架会破坏这个定位 |
| WebSocket 实时推送 | PWA 不是实时协作工具，页面可见性刷新足够；WebSocket 增加 Agent 端复杂度 |
| Supabase Realtime 订阅 | 需要开启 Supabase Realtime 功能，自托管配置复杂，本地轮询已够用 |
| 全局状态管理库（Redux 等） | Vanilla JS 的几个全局变量够用，引入状态管理是过度工程 |
| 构建工具（Webpack/Vite） | 项目用 script 标签直接加载，加构建步骤违反"下载即用"原则 |
| 统一的 PWA ↔ Agent RPC 接口 | PWA 和 Agent 不需要直接通信，Supabase 是它们唯一的交汇点 |
