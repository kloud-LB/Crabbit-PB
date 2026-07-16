# 更新日志

## v2.2.0 (2026-05-31)

### 新增模块：身材管理、吃喝拉撒、睡眠记录 + 认证绕过 + 多项 UI 优化

#### 认证绕过
- 登录/注册功能暂时禁用，应用以本地访客模式运行
- `app.js` 中绕过 `initAuth()`，设置虚拟访客用户
- 用户面板退出改为无操作提示，所有数据存储在 localStorage

#### 身材管理 (`js/body-measurement.js`)
- 5 维度折线图：体重(kg) / 腰围(cm) / 臂围(cm) / 胸围(cm) / 臀围(cm)
- 时间范围切换：近 7 天 / 近 30 天 / 近一年
- 新增数据弹窗：选择类型 + 数值 + 日期
- Y 轴自动缩放 + 网格线 + 数据点标记

#### 吃喝拉撒 (`js/diet.js`)
- 三页签：吃饭 / 喝水 / 拉屎（sub-nav 风格，icon + 文字）
- **吃饭**：环形进度图（3/4 缺口环）+ 碳水/蛋白/脂肪占比 + 早/午/晚/加餐卡片 + 多行添加食物 + 编辑/删除 + 每日千焦目标设置 + 日期轨道（7 天）
- **喝水**：人形投影 SVG + 灌水动画（水滴下落 + 身体发光） + 三档水量按钮（200/500/1500ml） + 撤销按钮 + 2500ml 上限 + 80% 合格线
- **拉屎**：距上次时间显示 + 月日历（记录数分级染色：浅咖/咖啡/深咖） + 点击日期查看记录 + 6 字段记录（形状/颜色/分量/感觉/气味/时长） + 颜色色块选择器 + 编辑/删除

#### 睡眠记录 (`js/sleep.js`)
- 今日主睡眠卡片：SVG 时钟表盘（24h 紫色扇形弧） + 时长 + 入睡/起床时间
- 今日小憩卡片：暖色系，多次小憩各自 90px 表盘 + 合计时长
- 近一周统计：平均睡眠时长 / 平均入睡时间 / 平均起床时间
- 新增记录：主睡眠/小憩类型切换 + 入睡/起床时间输入 + 自动计算时长 + 可选评价/质量
- 跨午夜时长自动 +24h 计算

#### UI 优化
- 主页卡片增至 6 个（新增身材管理、吃喝拉撒、睡眠记录）
- 登录/注册按钮增加加载转圈动效（旋转圆环 + 15s 超时提示）
- 页签 UI 统一使用 `.sub-nav` / `.sub-nav-item` 组件
- 日期轨道：毛玻璃背景 + `space-between` 均布 + 圆形按钮
- 饮食总览：3/4 环形进度图（底部缺口 SVG 弧）

#### 数据库扩展
- `body_measurements`：5 种测量类型（weight/waist/arm/chest/hip）
- `food_items`：餐别 + 名称 + 克数 + 千焦 + 碳水/蛋白/脂肪
- `diet_settings`：每日千焦目标
- `drink_records`：喝水毫升数
- `bathroom_records`：形状/颜色/分量/感觉/气味/时长
- `sleep_records`：类型 + 入睡/起床时间 + 时长 + 评价/质量
- 全部 12 张表启用 RLS 行级安全

---

## v2.1.1 (2026-05-14)

### Remix Icons 全面替换 + 低饱和度蓝主题色 + 用户面板重构

将全站图标从 Emoji 替换为 [Remix Icon](https://remixicon.com) 矢量图标，统一全局主题色为低饱和度蓝（`#6b7db3`），并重构用户管理面板。

#### 全局主题色变更

- 全局 accent 色从 `#6366f1`（高饱和靛蓝）降为 `#6b7db3`（低饱和度钢蓝）
- 涉及：导航激活态、表单提交按钮、焦点框、进度条、图表、日历热力图、水波纹等所有 UI 组件
- **记账模块除外**：保留 8 种独立支出分类色 + 4 种绿色系收入分类色

#### Remix Icons 替换清单

| 位置 | 旧图标 | 新图标（Remix Icon） |
|------|--------|---------------------|
| 返回按钮 | `←` 文字 | `ri-arrow-left-s-fill` |
| 主题切换 | 🌙/☀️ emoji | `ri-moon-fill` / `ri-sun-fill` |
| 主页-打卡 | ✅ | `ri-checkbox-circle-fill` |
| 主页-待办 | 📝 | `ri-list-check-3` |
| 主页-记账 | 💰 | `ri-exchange-dollar-fill` |
| 主页-体重 | ⚖️ | `ri-scales-fill` |
| 打卡子导航 | ✅/📊 | `ri-checkbox-circle-fill` / `ri-bar-chart-fill` |
| 记账子导航 | 💰/📋/📊 | `ri-edit-circle-fill` / `ri-file-list-3-fill` / `ri-pie-chart-fill` |
| 悬浮按钮 | `+` 文字 | `ri-add-fill` |
| 打卡-补打卡 | 📅 | `ri-calendar-event-fill` |
| 打卡-编辑 | ✎ | `ri-edit-fill` |
| 打卡-删除 | 🗑 | `ri-delete-bin-fill` |
| 待办-完成 | ✅ | `ri-check-line` |
| 待办-撤销 | ✅ | `ri-arrow-go-back-line` |
| 待办-延期 | 📅 | `ri-calendar-event-fill` |
| 待办-删除 | ❌ | `ri-delete-bin-fill` |
| 分类-编辑 | ✎ | `ri-edit-fill` |
| 分类-删除 | 🗑 | `ri-delete-bin-fill` |
| 用户-头像 | 🖼 | `ri-image-edit-fill` |
| 用户-昵称 | ✏️ | `ri-edit-fill` |
| 用户-导出 | — | `ri-file-download-fill` |
| 用户-导入 | — | `ri-file-upload-fill` |
| 退出登录 | 纯文字 | `ri-logout-box-r-fill` |

#### 登录页去迁移

- 移除登录表单中"从旧版迁移数据"入口 —— 该功能需已登录用户才能使用，出现在登录页无意义
- 迁移功能保留在用户面板中（见下方导入按钮）

#### 导入/导出迁移至用户面板

- 从打卡统计页移除独立的 `data-bar` 导出/导入按钮
- 在用户面板新增一行两个并排按钮：导出（`ri-file-download-fill`）+ 导入（`ri-file-upload-fill`）
- 新增 `.user-panel-row` CSS 实现并排布局

#### CSS 新增

```css
.user-panel-row { display: flex; gap: 8px; }
.user-panel-row .user-panel-action { flex: 1; }
.home-card-icon { color: var(--card-accent, #6b7db3); }
```

---

## v2.1.0 (2026-05-13)

### 统一数据层架构：模块注册机制 + 缓存优先渲染

对 v2.0.0 的核心架构进行重构，引入通用数据引擎 `js/db.js`，解决模块样板代码膨胀和串行加载延迟问题。

#### 核心变更：新增 js/db.js 通用数据引擎

`DataModule(descriptor)` 注册机制：每个模块声明自己的数据表、缓存键、离线操作和生命周期钩子，不再需要在核心文件中添加样板代码。

主要 API：
- `DataModule(desc)` / `getModule(id)` — 模块注册与查询
- `dbLoadAll(uid)` — 缓存优先加载（同步渲染 + 后台 Promise.all 刷新）
- `dbRefreshAllCaches(sb, uid)` — 并行刷新所有注册表
- `dbReplayAction(sb, uid, action)` — 表驱动离线队列重放
- `dbRenderView` / `dbMigrateAll` / `dbExportAll` — 统一调度

#### 性能提升

| 指标 | v2.0.0 | v2.1.0 |
|------|--------|--------|
| 首次可交互 | ~1-2s（5 串行 await） | ~5ms（同步读缓存） |
| 数据刷新 | 串行请求 | Promise.all 并行 |
| 新增模块样板代码 | ~225 行 / 6 文件 | 0 行核心文件 |

#### 文件结构变更

```
v2.0.0:
js/offline.js  (239 行，含 8 个 cacheGet/Set + 10-case switch + 顺序 refresh)
js/auth.js     (174 行，含 loadAllDataFromCache + renderAll)
js/migrate.js  (126 行，含 4 个 per-table upsert 循环)
js/app.js      (280 行，含 5 个串行 await + 18 个全局变量)

v2.1.0:
js/db.js       (180 行，新增 — 通用数据引擎)
js/offline.js  (80 行，精简 — 仅网络检测 + 队列读写 + syncOfflineQueue)
js/auth.js     (153 行，精简 — 删除 loadAllDataFromCache/renderAll)
js/migrate.js  (45 行，精简 — 使用 dbMigrateAll 统一迁移)
js/app.js      (248 行，精简 — 使用 dbLoadAll/dbRenderView/dbExportAll)
```

现有模块（checkin.js、todo.js、stats.js）均在末尾调用 `DataModule()` 向引擎注册自身。

#### 新增模块流程（重构后）

后续新增模块（体重管理、记账、购物清单等）仅需：

1. 创建 `js/modules/<name>.js` — IIFE + `DataModule({...})` + render/CRUD 函数
2. `index.html` — 1 个 `<script>` + 1 个 `<div>` + 1 个 `<button>`
3. `app.css` — 模块专属样式
4. `supabase/schema.sql` — CREATE TABLE + RLS

核心文件（db.js / offline.js / auth.js / migrate.js / app.js）零改动。

---

## v2.0.0 (2026-05-12)

### 重大更新：前端 + Supabase 后端全栈架构

项目从单文件 localStorage 应用升级为前端 + 后端的全栈架构，使用 [Supabase](https://supabase.com) 作为后端服务。

#### 架构变更

- **代码拆分**：单文件 `index.html`（2053行）→ 模块化结构（`index.html` App Shell + 9 个 JS 模块 + 1 个 CSS 文件）
- **数据存储**：localStorage → Supabase PostgreSQL（Row Level Security 隔离用户数据）
- **用户系统**：新增邮箱登录/注册（Supabase Auth）

#### 文件结构

```
daily-checkin/
├── index.html              # App Shell（~210行）
├── css/app.css             # 样式（500行，从 v1 提取）
├── js/
│   ├── app.js              # 入口：常量、状态、主题、音效、路由
│   ├── supabase-client.js  # Supabase 客户端初始化
│   ├── offline.js          # 离线缓存层（localStorage 镜像 + 操作队列）
│   ├── auth.js             # 邮箱登录/注册/登出
│   ├── checkin.js          # 打卡模块（Supabase 数据层 + 渲染）
│   ├── todo.js             # 待办模块（Supabase 数据层 + 渲染）
│   ├── stats.js            # 统计热力图模块
│   └── migrate.js          # v1.x 数据迁移工具
├── supabase/schema.sql     # 数据库建表 + RLS 策略
└── CHANGELOG.md
```

#### 新增特性

- **多端同步**：同一账号在任意设备登录后数据自动同步
- **数据持久化**：清除浏览器缓存后重新登录即可恢复数据
- **离线缓存**：断网时自动降级到 localStorage，网络恢复后自动同步
- **v1 迁移**：登录后可导入 v1.x JSON 备份文件，迁移到云端
- **数据安全**：Supabase RLS 确保每个用户只能访问自己的数据

#### 用户视角：v1.x vs v2.0

| 场景 | v1.x | v2.0 |
|------|------|------|
| 首次使用 | 打开文件即用 | 注册邮箱（30秒）→ 开始使用 |
| 换设备 | 导出 JSON → 传输 → 导入 | 登录同一邮箱 → 数据自动出现 |
| 断网时 | 正常使用 | 正常使用，显示"离线"标记 |
| 网络恢复 | — | 自动同步离线操作到云端 |
| 清除缓存 | 数据全部丢失 | 重新登录后从云端拉回 |

#### 部署方式

- 推荐使用 GitHub Pages 或 Vercel 托管静态文件
- 需要在 `js/supabase-client.js` 中配置 Supabase 项目凭证
- 在 Supabase SQL Editor 中运行 `supabase/schema.sql`

---

## v1.3.0 (2026-05-12)

### 新增：待办事项模块

底部导航新增「📝 待办」页签，独立于打卡功能，提供完整的待办事项管理。

#### 两级分类体系

- **待办分类**（父级）：默认预设工作、生活、学习三个分类，用户可新增、编辑、删除任意分类
- **待办任务**（子级）：每条待办属于一个分类，通过顶部横滚 pill 栏按分类筛选
- 分类支持自定义名称和颜色（8 种预设 + 取色器）

#### 新建待办表单

- **待办事项**：标题必填（最长 60 字）
- **详细描述**：可选，多行文本
- **截止时间**：日期选择器 + 可选时间选择器
- **优先级**：三段式按钮（低/中/高），分别以绿/黄/红标识，默认选中"中"
- **待办分类**：下拉选择已有分类

#### 待办操作

| 操作 | 按钮 | 说明 |
|------|------|------|
| 完成 | ✅ | status → completed，记录完成时间，播放叮声 |
| 延期 | 📅 | 弹出日期选择器，自由选择新截止日期或清除 |
| 删除 | ❌ | 二次确认后硬删除 |
| 撤销/恢复 | ✅ | 已完成/已取消的卡片可一键恢复为待办状态 |

#### 卡片排序规则

待办列表按以下规则自动排序：
1. 优先级（高 → 中 → 低）
2. 同优先级按截止时间（近 → 远，无截止时间排最后）
3. 已完成和已取消的任务自动沉底

#### 卡片标签系统

描述下方为横向标签行，从左到右：

| 标签 | 内容 | 颜色 |
|------|------|------|
| 状态 | `进行中` / `已超期` / `已完成` / `已取消` | 蓝 / 橙 / 绿 / 灰 |
| 优先级 | `P0`(高) / `P1`(中) / `P2`(低) | 橙 / 黄 / 灰绿 |
| 剩余天数 | `还剩X天` / `已超期`（超期时显示） | 灰 / 橙 |

- 无截止时间的任务不显示剩余天数标签

#### UI 设计

- 卡片左侧 4px 颜色条指示所属分类
- 操作按钮横向排布于标签行右侧，40px 圆形，仅保留 3 个：✅ 📅 ❌
- 已完成卡片：降低透明度 + 绿色左边条
- 已取消卡片：灰色中间删除线样式
- 配色方案：全局降低饱和度，红→橙(#c97a3c)、橙→黄(#9e7f2e)、绿→灰绿(#5a9b6a)
- 卡片 `max-width: 420px` 防止过宽
- PC 端（≥768px）双列网格布局，与打卡页风格一致

#### 数据独立性

- 待办数据使用独立 localStorage key：`todo_categories`、`todo_items`
- 不混入打卡数据，统计面板暂不包含待办统计
- 导入/导出功能暂不包含待办数据

---

## v1.2.0 (2026-05-11)

### 新增：撤销打卡

点击已完成任务的卡片，一键将打卡状态重置。

- **单次任务**：点击已完成卡片 → 状态 toggle 为未完成，卡片回到列表上方
- **多次任务**：点击已完成卡片 → 进度直接清零（非逐次递减），卡片回到列表上方
- 未完成任务的行为不变（正常累加）
- 撤销操作播放独立低沉提示音（500→300Hz），区别于打卡叮声

---

## v1.1.0 (2026-05-10)

### 新增：数据导入/导出

统计页面顶部增加「数据管理」栏，支持手动备份和恢复数据。

- **📤 导出**：下载 `checkin_backup_YYYY-MM-DD.json`，包含全部任务定义和打卡历史
- **📥 导入**：选择之前导出的 JSON 文件，确认后替换当前数据
- 错误格式文件会提示"导入失败"，不会损坏现有数据

### 使用场景

- 换手机 / 换浏览器前导出，新设备导入
- 定期导出存网盘，防止浏览器缓存被清理后丢失

---

## v1.0.0 (2026-05-10)

### 初始发布

零依赖、纯前端打卡记录应用，用浏览器打开即用。

#### 核心功能

**任务管理**
- 自定义每日任务：名称、每日完成次数（默认 1）、主题颜色（8 种预设 + 自定义取色器）
- 列表排序：未完成任务在上（按创建时间正序），已完成任务自动沉底
- 编辑 / 删除任务（删除需二次确认），历史数据保留

**打卡交互**
- 单次任务：点击卡片直接完成，触发对勾动画 + 叮声音效
- 多次任务：进度条平滑填充，达标后自动完成动画
- 防抖：点击后 300ms 内不可重复点击

**补打卡**
- 支持为昨天、前天未完成的任务补打卡
- 入口：任务卡片上的 📅 图标 → 弹出日期选择 → 逐次累加

**统计页面**
- 总览热力图：52 列 × 7 行（GitHub 贡献图风格），显示全年每日完成率
- 单任务统计（折叠卡片）：年度热力图 + 月日历视图 + 本周圆点 + 历史总计
- 支持切换年份（← →）
- 点击热力图方格查看当日详情

**暗色 / 亮色模式**
- 跟随系统偏好自动切换
- 手动切换（🌙 / ☀️ 按钮），状态持久化
- 所有颜色、背景、阴影 0.3s 平滑过渡

**设计风格**
- 液态玻璃（Glassmorphism）：毛玻璃卡片、柔和阴影、半透明背景
- 响应式布局：移动端单列 / PC 端（≥768px）双列网格
- 系统原生字体栈，中文优先

#### 技术细节

- 数据存储在浏览器 localStorage（`checkin_tasks`、`checkin_history`）
- 无后端依赖，下载 index.html 即可使用
- 纯 HTML/CSS/JS，无框架、无构建工具

---

## 版本规划

| 版本 | 状态 | 内容 |
|------|------|------|
| v1.0.0 | ✅ 已发布 | 核心打卡功能 |
| v1.1.0 | ✅ 已发布 | 数据导入/导出 |
| v1.2.0 | ✅ 已发布 | 撤销打卡 |
| v1.3.0 | ✅ 已发布 | 待办事项模块（两级分类、优先级、截止时间） |
| v2.0.0 | ✅ 已发布 | Supabase 全栈架构（多端同步、邮箱登录、离线缓存） |
| v2.1.0 | ✅ 已发布 | 统一数据层架构（模块注册机制、缓存优先渲染、并行加载） |
| v2.2.0 | 📋 规划中 | PWA 支持（全屏安装、离线缓存、桌面图标） |

---

## v2.2.0 PWA 方案

### 目标

将现有 Web 应用升级为 PWA（Progressive Web App），用户可"安装"到桌面，获得全屏沉浸体验和离线访问能力。

### 核心改动概览

```
新增文件：
  manifest.json          ~25行  PWA 清单（名称、图标、全屏模式、主题色）
  sw.js                  ~60行  Service Worker（缓存策略 + 离线兜底）
  icons/icon-192.png     app 图标（192×192）
  icons/icon-512.png     app 图标（512×512）
  icons/apple-icon-180.png  iOS 专用图标

修改文件：
  index.html             +10行  <head> 标签 + SW 注册脚本

不改动文件：
  css/app.css            (0 改动)
  js/*.js                (0 改动)
  supabase/schema.sql    (0 改动)
```

### 详细方案

#### 1. manifest.json

浏览器读取这个文件来决定"安装"时的行为：

```json
{
  "name": "每日打卡",
  "short_name": "打卡",
  "description": "任务打卡 · 待办 · 记账",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#e8eaf6",
  "theme_color": "#6b7db3",
  "icons": [
    { "src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

关键字段说明：

| 字段 | 值 | 效果 |
|------|-----|------|
| `display` | `standalone` | 全屏无浏览器边框，独立任务卡片 |
| `theme_color` | `#6b7db3` | Android 状态栏颜色，与全局主题色一致 |
| `background_color` | `#e8eaf6` | 启动瞬间背景色，与亮色主题渐变起点一致 |

#### 2. Service Worker（sw.js）

核心职责：拦截网络请求，优先用缓存，离线时兜底。

**缓存策略（Cache-First）**

```
用户访问 → SW 拦截请求
              ├─ 缓存中有？ → 直接返回缓存（毫秒级）
              └─ 缓存中无？ → 走网络 → 成功后存入缓存 → 返回
```

**分三类缓存：**

| 类型 | 内容 | 策略 | Cache 名 |
|------|------|------|------|
| App Shell | index.html, app.css, js/*.js, manifest | 预缓存（install 时写入） | `app-shell-v2` |
| CDN 资源 | remixicon.css, supabase-js@2 | 缓存优先，24h 过期 | `cdn-libs-v1` |
| 动态数据 | Supabase API 响应 | **不缓存**（数据由 offline.js 管理） | — |

**为什么 Supabase 数据不进 SW 缓存：**
现有 `offline.js` + `db.js` 的 localStorage 缓存层已经处理了离线数据，SW 只负责"让页面能打开"，两者分工清晰：

```
SW：管代码（HTML/CSS/JS 离线可加载）
offline.js：管数据（打卡记录离线可读写）
```

**更新机制：**
- SW 版本号从 `sw.js` 文件内容 hash 自动判定
- 新版本 SW 在后台 install → activate → 清旧缓存
- 用户下次打开应用自动生效，无需任何操作

#### 3. index.html 改动

在 `<head>` 中追加：

```html
<!-- PWA -->
<link rel="manifest" href="manifest.json">
<meta name="theme-color" content="#6b7db3">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="打卡">
<link rel="apple-touch-icon" href="icons/apple-icon-180.png">
```

页面底部（`</body>` 前）注册 SW：

```html
<script>
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js');
}
</script>
```

#### 4. 图标

需要一个 512×512 的 PNG 图标。建议设计：

- **深色圆角方块底板**（`#6b7db3` 主题蓝）
- **白色对勾**（与打卡功能关联）或 **日历图标** 简化版
- 直接用 CSS/Canvas 生成即可，不需要设计师

可以用 [maskable.app](https://maskable.app) 在线生成适配不同平台的 safe zone 裁剪。

#### 5. iOS 特殊情况处理

| 问题 | iOS 实际表现 | 处理方式 |
|------|-------------|--------|
| 无"安装"弹窗 | 用户需手动「分享 → 添加到主屏幕」 | 首页可加一个轻提示引导 |
| 无 Web Push | 推送通知不可用 | 不加推送功能，保持现状 |
| localStorage 上限 | ~200-300MB per PWA | 当前数据量 ~450KB/人，远未触及 |
| 不显示 splash screen | 用 `apple-touch-icon` + meta 标签指定 | 已在上方 index.html 改动中覆盖 |
| iOS 后台被杀后 | SW 也会被冻结 | 重新打开时 SW 自动恢复，无感知 |

### 对现有功能的影响

| 现有功能 | PWA 后变化 |
|----------|-----------|
| 登录/注册 | 无变化，Supabase Auth cookie 正常工作 |
| 打卡/待办/记账 | 无变化 |
| 离线使用 | **增强**：断网仍能打开页面 + 用本地缓存数据 |
| 主题切换 | 无变化 |
| 声音 | 无变化（AudioContext 在 standalone 模式下可用） |
| 导出/导入 | 无变化 |
| Remix Icon CDN | SW 缓存后离线也能显示图标 |
| Supabase SDK CDN | SW 缓存后离线加载不报错 |

### 实施步骤（总耗时 ~1 小时）

| 步骤 | 内容 | 预估 |
|------|------|------|
| 1 | 生成 3 个尺寸的图标 | 15 分钟 |
| 2 | 创建 `manifest.json` | 5 分钟 |
| 3 | 创建 `sw.js` | 20 分钟 |
| 4 | `index.html` 加 meta 标签 + SW 注册 | 5 分钟 |
| 5 | 部署 + Chrome DevTools 验证 | 10 分钟 |
| 6 | 真机测试（Android + iOS） | 15 分钟 |

### 验证方法

- **Chrome DevTools** → Application → Manifest（检查图标、全屏配置）
- **Chrome DevTools** → Application → Service Workers（检查 SW 已注册、缓存已填充）
- **Lighthouse** → PWA 审计（目标 90+ 分）
- **Android Chrome** → 打开网站 → 等待 5 秒 → 底部应弹出安装提示
- **iOS Safari** → 分享 → 添加到主屏幕 → 图标出现 → 打开验证全屏
