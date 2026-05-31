# Crabbit! 项目完全指南

这份文档是为**没接触过真实项目的新人**准备的。读完你能理解：每个文件干什么、为什么这样命名、技术选型的理由、文件之间怎么协作。

---

## 一、这个项目是做什么的

一个可以装在手机上的生活管理网页应用，包含 4 个功能模块：

| 模块 | 能做什么 |
|------|---------|
| 打卡 | 创建每日任务，点击完成，GitHub 风格热力图看统计 |
| 待办 | 三级优先级 + 截止时间 + 分类管理，到期提醒 |
| 记账 | 支出/收入记录，内置计算器，SVG 折线图看趋势 |
| 身材管理 | 体重、腰臂胸臀围度记录，5 条折线图对比 |

**核心特点**：零依赖、纯前端、一个 HTML 文件就能跑、离线可用。

---

## 二、技术选型：为什么这样选

### HTML5 + CSS3 + 原生 JavaScript（零框架）

**没有用 React / Vue / Angular**。原因：

- 项目的功能规模（表单 + 列表 + 图表）用原生 JS 完全够
- 不依赖任何前端框架，也就不需要 npm、webpack、node_modules 那一整套工具链
- 用户下载项目文件夹，双击 `index.html` 或者用 VS Code Live Server 打开就能跑
- 体积极小，加载快，手机上也不卡

代价就是代码组织要自己管——没有框架帮你做组件化、状态管理、路由。这个项目的 `db.js` 数据引擎和 `DataModule` 模块注册系统就是手工搭出来的替代方案。

### Remix Icon（图标库）

通过 CDN 一行 `<link>` 标签引入。用 `<i class="ri-xxx-fill"></i>` 就能显示矢量图标。选它的理由：

- 开源免费，图标数量多（2800+）
- 矢量图标，不限缩放不变形
- 用 CSS `color` 就能改颜色，不需要准备多套图片
- 比 emoji 更正式、更统一

### Supabase（后端/数据库）

开源 Firebase 替代品，提供 PostgreSQL 数据库 + 用户认证 + Row Level Security。项目当前使用的云实例已失效，正在规划迁移到自托管（Mac Mini 部署）。选它的理由：

- 自带用户注册/登录系统，不用自己写
- Row Level Security 让每个用户只能读写自己的数据，安全性由数据库保证而非应用层
- REST API 自动生成，前端直接用 JS SDK 调用，零后端代码

### 为什么 JS 文件放在 `js/`、CSS 放在 `css/`、数据库脚本放在 `supabase/`

这是项目目录结构的最小约定：

```
js/       ← 所有 JavaScript 逻辑，按功能拆分
css/      ← 样式文件（当前只有一个 app.css）
supabase/ ← 数据库建表脚本（不属于前端，但和项目一起管理）
根目录    ← HTML 入口 + 文档（README、CHANGELOG 等 .md 文件）
```

`.md` 是 Markdown 文件，纯文本格式的文档，GitHub 会自动渲染成漂亮的页面。

---

## 三、文件逐一介绍

### 3.1 入口文件

#### `index.html` — 应用的骨架

**语言**：HTML5

**作用**：
1. 定义整个应用的所有「页面」（叫 View）——主页、打卡、待办、记账、身材管理
2. 定义所有弹窗（模态框）——新建任务、新建待办、计算器、用户面板等
3. 按指定顺序加载 JS 文件（script 标签的顺序决定了代码的执行顺序）

**关键约定**：
- 每个「页面」是一个 `<div class="view" id="viewXxx">`，默认隐藏（CSS `.view { display:none }`）
- 当前可见页面通过 `classList.add('active')` 显示（CSS `.view.active { display:block }`）
- 弹窗用 `<div class="modal-overlay" id="xxx">` 包裹，点击遮罩关闭

**为什么只有 1 个 HTML 文件**：这是一个 SPA（单页应用），所有内容都在一个 HTML 文件里，通过 JS 切换显示/隐藏来实现「翻页」效果。好处是不用跳转页面，体验流畅；坏处是 HTML 文件比较大。

### 3.2 样式

#### `css/app.css` — 全局样式表

**语言**：CSS3

**篇幅**：约 950 行（持续增长中）

**组织方式**：按组件用注释分隔（`/* ===== Header ===== */`），包括：
- CSS 变量/主题色定义（`--bg-start`, `--text`, `--card-bg` 等）
- Header、导航、卡片、模态框、表单、热力图、图表、计算器、用户面板等

**为什么不用多个 CSS 文件**：项目目前规模不需要。编译/合并工具会增加复杂度。V3_INTERFACE_ANALYSIS.md 中有拆分建议。

**暗色模式原理**：
```css
:root { --bg-start: #e8eaf6; }  /* 亮色默认值 */
[data-theme="dark"] { --bg-start: #1a1a2e; }  /* 暗色覆盖 */
```
切换主题只需改 `<body data-theme="dark">` 属性，所有用了 CSS 变量的颜色自动变化。

### 3.3 JavaScript 核心层

JS 文件的加载顺序很重要，`index.html` 中从上到下依次是：

```
1. supabase-client.js  ← 初始化 Supabase 连接
2. db.js               ← 数据引擎（模块注册、缓存、离线队列）
3. offline.js          ← 网络监测 + 离线队列管理
4. auth.js             ← 用户认证 + 用户面板
5. migrate.js          ← 旧版数据迁移
6. app.js              ← 应用入口（路由、主题、全局状态）
7. checkin.js          ← 打卡模块
8. stats.js            ← 统计模块（热力图）
9. todo.js             ← 待办模块
10. bookkeeping.js     ← 记账模块
11. body-measurement.js← 身材管理模块
```

**为什么顺序不能乱**：后面的文件要用前面文件定义的函数和变量。比如 `todo.js` 注册 DataModule 时，`DataModule` 函数必须已经在 `db.js` 中定义好了。

---

#### `js/supabase-client.js` — Supabase SDK 初始化

**语言**：JavaScript（ES5 风格，`var` + `function`）

**篇幅**：26 行

**做了什么**：
```javascript
const SUPABASE_URL = 'https://xxx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJh...';
// 懒加载单例模式
function getSupabase() { ... }
```

两行配置 + 一个获取 Supabase 客户端实例的函数。`getSupabase()` 在整个项目中被调用几十次，但它只创建一次连接（`__sb` 单例）。

**设计要点 — 懒加载 + 缓存**：
```javascript
let __sb = null;  // 私有变量（_ 前缀约定表示不要直接访问）
function getSupabase() {
  if (!__sb) { __sb = supabase.createClient(...); }  // 第一次调用才创建
  return __sb;  // 后续调用直接返回缓存的实例
}
```

---

#### `js/db.js` — 数据引擎（项目最核心的"轮子"）

**语言**：JavaScript

**篇幅**：200 行

**地位**：这是整个项目的基石。相当于一个自己实现的轻量级「状态管理 + 缓存 + 调度」框架。

**对外暴露的函数**（全局可用）：

| 函数 | 作用 |
|------|------|
| `DataModule(descriptor)` | 注册一个功能模块（打卡、待办、记账…都调用它注册自己） |
| `getModule(id)` | 按名字获取已注册模块 |
| `dbCacheLoad(uid, key)` | 从 localStorage 读缓存（验证用户 ID 归属） |
| `dbCacheSave(uid, key, data)` | 写缓存（附加用户 ID + 时间戳） |
| `dbLoadAll(uid)` | 登录后加载所有数据：缓存 → 渲染 → 后台刷新 |
| `dbRefreshAllCaches(sb, uid)` | 从 Supabase 拉取所有表的最新数据并写入缓存 |
| `dbReplayAction(sb, uid, action)` | 离线队列回放：根据 action 的 `_module` + `type` 找到对应模块的对应函数执行 |
| `dbRenderView(viewName)` | 通知所有注册模块"用户切到了某个页面" |
| `dbMigrateAll(data, sb, uid)` | 将旧版数据迁移到 Supabase |
| `dbExportAll()` | 导出所有模块的数据为 JSON |

**内部数据结构**：
```javascript
__modules = {                  // 所有注册模块
  checkin: { id, state, views, tables, actions, init, render, ... },
  todo:    { ... },
  ...
}
__tables = [                   // 所有注册表（用于并行缓存刷新）
  { moduleId: 'checkin', desc: { cacheKey, tableName, orderBy, stateProp, transform } },
  ...
]
```

**设计思想 — 表驱动**：`db.js` 不关心具体有哪些模块、哪些表。模块通过 `DataModule()` 自己注册进来，`db.js` 用循环遍历 `__modules` 和 `__tables` 来统一操作。新增模块（比如身材管理）只需要调用 `DataModule({...})`，不需要修改 `db.js` 一行代码。

---

#### `js/offline.js` — 离线支持

**语言**：JavaScript

**篇幅**：80 行

**做了什么**：
- 监听浏览器的 `online` / `offline` 事件
- 网络断开时，所有数据写入操作不进 Supabase，转为 `queuePush()` 存入 localStorage 队列
- 网络恢复时，`syncOfflineQueue()` 依次回放队列中的操作到 Supabase

**设计要点**：
```
离线时: 操作 → queuePush → localStorage('checkin_offline_queue')
联网时: syncOfflineQueue → dbReplayAction → Supabase 逐个执行
```

队列中的每个 action 结构是 `{ _module: 'checkin', type: 'checkin', taskId: ..., date: ..., count: ... }`。`dbReplayAction` 根据 `_module` 和 `type` 路由到对应模块的 `actions` 函数。

---

#### `js/auth.js` — 认证 + 用户面板（当前已绕过）

**语言**：JavaScript

**篇幅**：约 475 行

**原本的作用**：
- `initAuth()` — 检查登录状态，注册/登录/登出
- `showAuthUI()` / `hideAuthUI()` — 显示/隐藏登录注册表单
- 用户面板：头像选择、昵称修改、导出导入、退出登录

**当前状态**：已绕过（`app.js` 中注释掉了 `initAuth()` 调用，直接以访客身份进入）。绕过认证后：
- `authUser` 被设置为一个虚拟访客对象 `{ id: 'guest_...', email: '' }`
- 所有功能正常工作，数据存 localStorage
- 登录/注册 UI 不再弹出

**值得学习的代码模式 — 卡片切换**：
```javascript
function switchAuthCard(mode) {
  // 两张卡片（登录/注册）通过 display:none/block 切换
  // 切换时自动把已填的邮箱从一个卡片复制到另一个
}
```

---

#### `js/migrate.js` — 数据迁移工具

**语言**：JavaScript

**篇幅**：56 行

**作用**：读取用户导出的 v1.x JSON 备份文件，将旧版数据结构转换后写入 Supabase。通过 `dbMigrateAll()` 调用每个模块注册的 `migrate()` 函数。

---

#### `js/app.js` — 应用入口

**语言**：JavaScript

**篇幅**：约 345 行

**包含的内容**：

| 类别 | 内容 |
|------|------|
| 全局快捷函数 | `$()` = `querySelector`, `$$()` = `querySelectorAll` |
| 全局常量 | `COLORS`（8 色调色板）, `MONTHS`, `DAY_LABELS`, `DEBOUNCE_MS` |
| 全局状态变量 | `tasks`, `history`, `todoItems`, `currentView`, `statsYear`… |
| 工具函数 | `todayStr()`, `fmtDate()`, `escHtml()`, `showToast()`, `playDing()` |
| 路由/导航 | `navigateTo(viewName)`, `navigateBack()`, `VIEW_TITLES` |
| 主题 | `initTheme()`, `applyTheme()`, `toggleTheme()` |
| 入口初始化 | `init()` — 整个应用的启动函数 |

**`navigateTo(viewName)` 的工作流程**：
```
1. 隐藏所有 .view 元素
2. 显示目标 viewXxx
3. 更新返回按钮、标题、FAB 按钮
4. 调用 dbRenderView(viewName) → 触发各模块的 render()
5. 调用各模块的 onNavigate() 钩子
```

**`init()` 工作流程**（当前绕过认证后）：
```
1. initTheme()         ← 读取 localStorage 主题偏好，应用亮色/暗色
2. initOffline()       ← 监听网络状态变化
3. 显示日期
4. navigateTo('viewHome')
5. bindEvents()        ← 全局事件（主题按钮、返回按钮、Esc 键等）
6. bindModuleEvents()  ← 遍历 __modules，调用每个模块的 bindEvents()
7. bindUserPanelEvents()
8. 设置访客用户 → onUserReady() → dbLoadAll()  ← 加载数据并渲染
9. bindMigrateImport()
```

### 3.4 JavaScript 功能模块

四个功能模块都遵循相同模式，核心是调用 `DataModule(descriptor)` 注册自己。

#### `js/checkin.js` — 打卡模块（约 470 行）

**注册为 DataModule，提供**：
- `tables`: `checkin_tasks` + `checkin_history` 两张表
- `actions`: 5 个离线回放函数（checkin, createTask, updateTask, deleteTask, undoCheckin）
- `views`: `['viewCheckin']`

**核心逻辑**：
```
用户点击任务卡片
  → handleCheckin(taskId)
    → 更新全局 history[today][taskId]
    → saveCheckinEntry() 写 Supabase（或离线队列）
    → playDing() 音效
    → renderTasks() 刷新列表
```

**双重点击设计 — 打卡/取消**：
- 未完成时点击 → +1 进度
- 已完成时点击 → 撤销打卡（播放不同的音效 `playUndo()`）

**防抖**：300ms 内重复点击无效（`DEBOUNCE_MS` 常量）。

#### `js/stats.js` — 统计模块（约 329 行）

**特殊性**：不操作数据表（`tables: []`），只读取 `tasks` 和 `history` 全局变量做纯前端计算。

**热力图渲染**：生成 52 列 × 7 行（一年 52 周 × 每周 7 天）的网格，每个格子的颜色深度代表当天的完成率。这是模仿 GitHub 贡献热力图的设计。

**每个任务的详情统计**包含三重视图：
- 年度热力图（52 列 → 逐周）
- 月度日历视图（翻月查看）
- 本周完成情况

#### `js/todo.js` — 待办模块（约 659 行）

**4 种状态流转**：
```
pending → completed  （完成）
pending → postponed  （延期）
pending → cancelled  （取消）
completed → pending  （撤销完成）
cancelled → pending  （恢复）
```

**优先级系统**：high (P0) > medium (P1) > low (P2)，列表按优先级排序。

**分类系统**：默认为工作/生活/学习三个分类，支持自定义颜色和名称。删除分类时自动将其中待办迁移到第一个分类。

**多弹窗管理**：待办表单、分类管理、分类编辑、延期对话框——四个弹窗各自独立，Escape 键逐层关闭。

#### `js/bookkeeping.js` — 记账模块（约 704 行）

**三个子 Tab**：
1. 记账 — 选择类别 → 弹出计算器 → 填金额 + 日期 + 备注 → 保存
2. 记录 — 按月查看，分类汇总，支持滑动删除（移动端手势）
3. 统计 — 周/月/年切换，排行榜条形图，点击进入单类别 SVG 趋势图

**内置计算器**：支持加减法链式计算（非表达式求值），逐键输入，实时显示。这是移动端友好的设计——不需要系统键盘。

**分类系统**：支出 8 类（各有独立颜色）、收入 4 类（绿色系）。

#### `js/body-measurement.js` — 身材管理模块（约 250 行）

**最新添加的模块**。5 个测量类型各自对应一个 SVG 折线图：
- 体重 (kg) — 蓝色
- 腰围 (cm) — 粉色
- 臂围 (cm) — 绿色
- 胸围 (cm) — 橙色
- 臀围 (cm) — 紫色

**时间范围切换**（7天 / 30天 / 一年），图表即时重新渲染。Y 轴自动缩放（min/max + 15% 边距），单数据点时显示一个点，多数据点连线。

---

### 3.5 数据库

#### `supabase/schema.sql` — PostgreSQL 建表脚本

**语言**：SQL (PostgreSQL 方言)

**已定义 7 张表**（原有 6 张 + 新增身材管理 1 张）：

| 表名 | 存储内容 | 关键约束 |
|------|---------|---------|
| `checkin_tasks` | 打卡任务 | `user_id → auth.users` |
| `checkin_history` | 每次打卡记录 | `UNIQUE(user_id, task_id, date)` |
| `todo_categories` | 待办分类 | |
| `todo_items` | 待办事项 | `priority IN ('high','medium','low')` |
| `user_profiles` | 昵称、头像 | 一对一关联 `auth.users` |
| `bookkeeping_records` | 收支记录 | `type IN ('income','expense')` |
| `body_measurements` | 身材数据 | `type IN ('weight','waist','arm','chest','hip')` |

**每张表都有的固定模式**：
```sql
-- 1. 建表 + 约束 + 索引
-- 2. ENABLE ROW LEVEL SECURITY
-- 3. CREATE POLICY "user_own_xxx" ... USING (auth.uid() = user_id)
```

Row Level Security 是 Supabase 的核心安全机制：服务端强制执行，前端即使改 JS 代码也无法绕过。

### 3.6 文档文件

| 文件 | 内容 |
|------|------|
| `README.md` | 项目介绍、快速开始、技术栈、功能模块一览 |
| `CHANGELOG.md` | 每个版本的具体改动（v2.1.1 Remix Icons 替换、用户面板重构等） |
| `PITFALLS.md` | 开发过程中踩过的 12 个坑（Supabase 配置、RLS、DNS、端口转发等） |
| `CLAUDE.md` | 给 Claude Code AI 助手的项目指令（架构概述、运行方式、注意事项） |
| `SELF-HOSTING.md` | Supabase 自托管完整部署手册（10 个步骤） |
| `V3_ROADMAP.md` | V3 版本的 Agent 智能助手规划（QQ 对话操控、定时推送等） |
| `V3_INTERFACE_ANALYSIS.md` | V3 的接口约束分析与分阶段优化建议 |
| `PROJECT_GUIDE.md` | 本文档 |
| `.gitignore` | 告诉 Git 不要跟踪 IDE 配置、系统文件等 |

---

## 四、运行时完整流程

### 4.1 应用启动

```
浏览器打开 index.html
  │
  ├─ 下载 HTML → 解析 DOM → 下载 CSS
  ├─ 按顺序执行 script 标签:
  │   1. Supabase CDN SDK 加载（全局 supabase 对象可用）
  │   2. supabase-client.js 执行 → SUPABASE_URL / SUPABASE_ANON_KEY 定义
  │   3. db.js 执行 → DataModule / dbLoadAll / ... 函数定义
  │   4. offline.js 执行 → isOnline / queuePush / ... 定义
  │   5. auth.js 执行 → authUser / userProfile / ... 定义
  │   6. migrate.js 执行
  │   7. app.js 执行 → COLORS / navigator / ... 定义
  │   8. checkin.js 执行 → 调用 DataModule({id:'checkin', ...})
  │   9. stats.js 执行 → 调用 DataModule({id:'stats', ...})
  │   10. todo.js 执行 → 调用 DataModule({id:'todo', ...})
  │   11. bookkeeping.js 执行 → 调用 DataModule({id:'bookkeeping', ...})
  │   12. body-measurement.js 执行 → 调用 DataModule({id:'bodyMeasurement', ...})
  │
  ├─ DOMContentLoaded 事件触发 → init() 执行
  │   ├─ initTheme() → 应用亮色/暗色
  │   ├─ initOffline() → 绑定网络事件
  │   ├─ navigateTo('viewHome') → 显示主页
  │   ├─ bindEvents() → 全局 UI 事件绑定
  │   ├─ bindModuleEvents() → 遍历 __modules 调用 bindEvents()
  │   ├─ bindUserPanelEvents()
  │   ├─ 设置访客用户 → onUserReady()
  │   │   ├─ loadUserProfile(guestId) → 加载/默认
  │   │   ├─ dbLoadAll(guestId)
  │   │   │   ├─ 读 localStorage 缓存注入 module.state
  │   │   │   ├─ 各模块 init() → render → UI 出现
  │   │   │   └─ 后台 dbRefreshAllCaches → 对比更新
  │   │   └─ [syncOfflineQueue → 不适用，无 session]
  │   └─ bindMigrateImport()
  │
  └─ 用户看到主页，可开始操作
```

### 4.2 用户点击主页卡片

```
用户点击「打卡」
  → home-card onclick → navigateTo('viewCheckin')
    → 隐藏所有 .view → 显示 #viewCheckin
    → 更新 header 标题为「打卡」
    → 显示返回按钮
    → 显示 FAB 按钮（右下角 + 号）
    → dbRenderView('viewCheckin')
      → checkin.render() → renderTasks()
      → stats.render() → renderStats()
    → checkin.onNavigate() → 重置子 tab 为「打卡」
```

### 4.3 用户完成一次打卡

```
用户点击任务卡片的 ✓ 按钮
  → handleCheckin(taskId, card)
    → 防抖检查
    → 更新全局 history[today][taskId].count++
    → saveCheckinEntry(taskId, date, count, timestamp)
      ├─ 在线: getSupabase().from('checkin_history').upsert(...)
      ├─ 离线: queuePush({_module:'checkin', type:'checkin', ...})
      └─ dbCacheSave(uid, 'checkin_cache_history', history)
    → playDing()
    → 如果完成: showCheckmark() 动画
    → renderTasks() → 列表刷新
```

### 4.4 离线 → 联网切换

```
网络恢复 → window 'online' 事件触发
  → isOnline = true
  → syncOfflineQueue()
    → 读取 checkin_offline_queue
    → 逐个: dbReplayAction(sb, uid, action)
      → 找到 __modules[action._module]
      → 调用 module.actions[action.type](sb, uid, action)
    → 清空队列
    → dbRefreshAllCaches(sb, uid)
```

---

## 五、核心设计模式学习

### 5.1 模块注册模式（DataModule）

**问题**：如何让数据引擎管理所有模块而不硬编码任何模块信息？

**方案**：每个模块主动注册自己的元数据。

```javascript
// 打卡模块的最后几行：
DataModule({
  id: 'checkin',           // 唯一标识
  state: checkinState,     // 数据容器
  views: ['viewCheckin'],  // 对哪些页面负责
  tables: [...],           // 用到了哪些数据库表
  actions: {...},          // 离线回放函数
  init: function() {...},  // 缓存加载后做什么
  render: function(v) {...}, // 切到这个页面时做什么
  fabClick: function() {...}, // 点 + 号时做什么
  escape: function() {...},   // 按 Esc 时做什么
  // ...更多钩子
});
```

**好处**：
- 数据引擎完全通用，不包含任何业务逻辑
- 新增模块不会影响已有模块
- 每个模块的内部实现完全独立

### 5.2 缓存优先 + 后台刷新

```
用户打开 App
  → 立即从 localStorage 渲染（秒开）
  → 后台静默从服务器拉取最新数据
  → 如有变化，静默更新 UI
```

这是 PWA 和移动端 App 的标配体验，用极少的 localStorage 代码实现了。

### 5.3 离线操作队列

不要求网络始终可用。操作先执行（乐观更新），成功后再同步。网络断开期间的所有操作排队等待，恢复后自动回放。

### 5.4 单例模式

`getSupabase()` 确保整个应用只有一个 Supabase 连接，无论被调用多少次。

### 5.5 防抖

`DEBOUNCE_MS = 300` — 打卡按钮 300ms 内不会触发两次。防止用户手快误点，也防止网络延迟时堆积请求。

### 5.6 命名约定

| 前缀 | 含义 | 示例 |
|------|------|------|
| `db` | 数据引擎层函数 | `dbLoadAll`, `dbCacheSave` |
| `bm` | 身材管理模块 | `bmRecords`, `bmTimeRange` |
| `bk` | 记账模块 | `bkRecords`, `bkCalcCurrent` |
| `__` | 私有/内部变量 | `__modules`, `__sb` |

选择这个项目所用技术栈中实际存在但原始的作者在控制，名称也是其给定，本文件与原项目保持一致。

---

## 六、学习这个项目的最佳路径

如果你是新人，建议按以下顺序阅读代码：

```
1. README.md             ← 知道项目干什么
2. index.html            ← 了解有哪些页面和弹窗
3. js/supabase-client.js ← 最短的文件，看连接怎么建
4. js/db.js              ← 核心引擎，重点理解 DataModule 和 dbLoadAll
5. js/app.js             ← 入口、导航、全局状态、工具函数
6. js/checkin.js         ← 最简单的功能模块，学习模块怎么写
7. js/stats.js           ← 纯前端的统计模块，不操作表
8. js/todo.js            ← 复杂一些（4 种状态、分类管理）
9. js/bookkeeping.js     ← 最复杂的模块（计算器、3 个 tab）
10. js/body-measurement.js ← SVG 折线图渲染
11. js/offline.js         ← 离线机制
12. js/auth.js            ← 认证流程
13. js/migrate.js         ← 数据迁移
14. css/app.css           ← 样式（可配合浏览器 DevTools 边看边学）
15. supabase/schema.sql   ← 数据库设计
```

每看完一个 JS 文件，问自己三个问题：
1. 它定义了哪些全局变量和函数？
2. 它调用了哪些其他文件定义的函数？
3. 当用户做某个操作时（比如点击打卡按钮），这个文件的哪些代码会被执行？
