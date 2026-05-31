# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 如何运行

- 用 VS Code Live Server 打开 `index.html`（默认端口 5500）
- 也可直接部署到 GitHub Pages / Vercel 等静态托管
- 无构建步骤、无包管理器、无测试套件。纯 HTML/CSS/JS，修改即刷新。

## 当前状态

- **认证已绕过**：`app.js` `init()` 中注释掉了 `initAuth()` 调用，直接以访客身份进入。`authUser` 被设为虚拟对象 `{ id: 'guest_...', email: '' }`。用户面板退出按钮为 no-op。
- **Supabase 云实例已失效**：`krvztfxtybxnlqauefhz.supabase.co` DNS 已不存在。数据全部走 localStorage。未来规划自托管迁移（见 SELF-HOSTING.md）。
- **v3 Agent 联动已规划**：见 V3_ROADMAP.md 和 V3_INTERFACE_ANALYSIS.md，当前尚未实施。

## 架构概览

### 核心引擎：`js/db.js` — 模块注册 + 缓存优先 + 离线回放

`DataModule(descriptor)` 是应用的基础设施。每个功能模块调用它注册自己的数据表、缓存键、渲染函数和离线操作。

### 已注册模块（按加载顺序）

| 模块 | 文件 | id | views | 表数 |
|------|------|----|-------|------|
| 打卡 | checkin.js | checkin | viewCheckin | 2 (checkin_tasks, checkin_history) |
| 统计 | stats.js | stats | viewCheckin | 0 |
| 待办 | todo.js | todo | viewTodo | 2 (todo_categories, todo_items) |
| 记账 | bookkeeping.js | bookkeeping | viewBookkeeping, viewBookkeepingDetail | 1 (bookkeeping_records) |
| 身材管理 | body-measurement.js | bodyMeasurement | viewBodyMeasurement | 1 (body_measurements) |
| 吃喝拉撒 | diet.js | diet | viewDiet | 2 (food_items, diet_settings) |
| 睡眠记录 | sleep.js | sleep | viewSleep | 1 (sleep_records) |

### 模块 DataModule 钩子

| 钩子 | 调用时机 |
|------|----------|
| `init()` | `dbLoadAll` 加载缓存后，从缓存即时渲染 |
| `render(viewName)` | `navigateTo` 切换视图后 |
| `onNavigate(viewName, previousView)` | 导航后状态重置（子 tab、FAB、日期等） |
| `fabClick()` | 点击右下角 + 按钮 |
| `escape()` | Esc 键 |
| `bindEvents()` | 应用初始化时绑定 DOM 事件 |
| `actions` | 离线队列回放时的 Supabase 写入 |
| `migrate(data, sb, uid)` | v1.x 数据迁移 |
| `export()` | 导出模块数据 |

### 导航与视图

`navigateTo(viewName)` 在 `app.js` 中：隐藏所有 `.view` → 显示目标 → 更新 header/返回按钮/FAB → `dbRenderView()` → 各模块 `onNavigate()`。

当前 VIEW_TITLES：主页、打卡、待办、记账、记账详情、身材管理、吃喝拉撒、睡眠记录。

### 主页卡片路由

`data-nav` → `navigateTo('viewXxx')`：
checkin / todo / bookkeeping / body / diet / sleep

### 全局状态（app.js 声明，各模块读写）

`tasks[]`, `history{}`, `todoCategories[]`, `todoItems[]`, `bkRecords[]`, `bmRecords[]`, `foodItems[]`, `drinkRecords[]`, `bathroomRecords[]`, `sleepRecords[]`

### 全局快捷函数

`$` / `$$` = `querySelector` / `querySelectorAll`
`todayStr(d)`, `fmtDate(str)`, `weekday(str)`, `escHtml(s)`, `showToast(msg, dur)`, `playDing()`, `playUndo()`

### 脚本加载顺序（不可变）

supabase SDK CDN → supabase-client → db → offline → auth → migrate → app → checkin → stats → todo → bookkeeping → body-measurement → diet → sleep

`db.js` 必须最先加载（定义 DataModule），`app.js` 必须在模块之后（调用 `bindModuleEvents()`）。

### localStorage 缓存规范

- key 格式：`checkin_cache_<表名>`（如 `checkin_cache_tasks`）
- 值格式：`{ _uid: 'guest_xxx', data: [...], _ts: 时间戳 }`
- 离线队列 key：`checkin_offline_queue`
- 主题 key：`checkin_theme`
- 用户资料缓存：`checkin_cache_profile`、`checkin_cache_diet_settings`

## 注意事项

- **Supabase 凭证**在 [js/supabase-client.js](js/supabase-client.js) 中硬编码，当前云实例已失效
- **Live Server 端口 5500**：若恢复 Supabase Auth，Site URL 需配置为 `http://localhost:5500`
- **Supabase URL 不能带 `/rest/v1/`**：SDK 内部自动拼接
- **所有模块遵循相同 DataModule 模式**：新增功能模块时复制已有模块的结构即可
- **diet.js 为最大模块**（约 700 行），内含三个子 tab（eating/drinking/bathroom）各自独立的渲染逻辑
- **CSS 为单文件** `css/app.css`（约 1300 行），按模块用注释分隔
- **index.html 约 600 行**，包含所有视图和弹窗的 HTML

## 关键文档

| 文件 | 内容 |
|------|------|
| README.md | 项目简介、模块一览 |
| CHANGELOG.md | 版本更新日志 |
| PROJECT_GUIDE.md | 新人入门完整指南（文件逐一介绍 + 运行时流程 + 设计模式） |
| PITFALLS.md | 开发中踩过的 12 个坑 |
| SELF-HOSTING.md | Supabase 自托管部署手册 |
| V3_ROADMAP.md | V3 Agent 智能助手规划 |
| V3_INTERFACE_ANALYSIS.md | V3 接口约束分析 |
