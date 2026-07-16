# 项目踩坑记录

---

## 1. Supabase 确认邮件链接指向 localhost 无法打开

### 现象

注册 Supabase 邮箱用户后，邮箱收到确认邮件，但点击链接后浏览器显示 **"localhost 拒绝连接"** 或 **"无法访问此网站"**，无法完成邮箱验证。

### 问题分析

Supabase Auth 在发送确认邮件时，邮件中的确认链接域名来自项目的 **Site URL** 配置。实际流程：

```
1. Supabase 默认 Site URL = http://localhost:3000
2. VS Code Live Server 默认端口 = 5500
3. 邮箱链接 → http://localhost:3000/auth/callback?token=...
4. Live Server 在 5500 端口监听，3000 端口无服务
5. 浏览器报告 "拒绝连接"
```

**根因**：端口不匹配。Supabase 生成 URL 用的是 `3000`，但本地开发服务器跑在 `5500`。两个端口之间没有自动发现机制，Supabase 无法感知开发者实际使用的端口。

### 处理方案

| 步骤 | 操作 |
|------|------|
| 1 | Supabase Dashboard → **Authentication** → **URL Configuration** |
| 2 | 将 **Site URL** 从 `http://localhost:3000` 改为 `http://localhost:5500` |
| 3 | 重新注册一次账号（或用之前的邮箱重新触发确认邮件） |

修改后，Supabase 发送的新确认邮件链接会自动指向 `http://localhost:5500/auth/callback?token=...`，Live Server 能正确接收。

> **端口取决于开发服务器**：VS Code Live Server 默认 5500；Vite 默认 5173；Create React App 默认 3000。根据自己使用的工具调整。

---

## 2. supabase-client.js URL 带 `/rest/v1/` 后缀导致 API 404

### 现象

Supabase JS SDK 初始化后，所有 API 请求返回 **404** 或 **请求超时**。前端功能全部不可用，但 Supabase 项目在线状态正常。

### 问题分析

Supabase JS SDK 的 `createClient(url, key)` 内部实现：

```javascript
// SDK 内部自动拼接 REST API 路径
this.restUrl = `${url}/rest/v1`;
```

如果传入的 `url` 已经包含 `/rest/v1/`：

```
传入: https://xxx.supabase.co/rest/v1/
SDK拼接: https://xxx.supabase.co/rest/v1//rest/v1/checkin_tasks
                                 ↑ 双重路径，永久 404
```

**根因**：`createClient` 的第一个参数应该是 Supabase 项目的**根域名**，而非 REST API 端点。这是 Supabase 文档和 Quickstart 示例中常见的误解——Dashboard API 页面展示的 `Project URL` 不带 `/rest/v1/`，但 `Config URL` 有时会带。

### 处理方案

```javascript
// ❌ 错误 —— 从 Supabase 面板 API 配置复制时多带了后缀
const SUPABASE_URL = 'https://xxx.supabase.co/rest/v1/';

// ✅ 正确 —— 只保留项目根域名
const SUPABASE_URL = 'https://xxx.supabase.co';
```

Supabase Dashboard → Settings → API → 复制 **Project URL** 字段（格式为 `https://<项目ID>.supabase.co`，不含路径后缀）。

---

## 3. RLS 策略未配置导致数据请求返回空

### 现象

用户已登录（右上角显示用户信息），但打卡任务列表始终为空，浏览器 Network 面板显示 API 返回 `200 OK []`，创建任务的请求也"成功"但实际上没有写入数据库。

### 问题分析

Supabase 的 Row Level Security 默认行为：

```
启用 RLS 的表：      无策略 → 拒绝所有访问（静默拒绝，不报错）
                    有 USING 策略 → 按策略过滤行
                    有 WITH CHECK 策略 → 按策略校验写入
```

```
用户发请求 → Supabase API 网关 → PostgreSQL
                                   │
                                   ├─ checkin_tasks 启用了 RLS
                                   │  但没有任何策略
                                   │  → SELECT: 返回 0 行（静默）
                                   │  → INSERT: 权限拒绝（静默，不报错）
                                   │
                                   └─ 前端看到: 空列表 / 空响应
```

**根因**：`ALTER TABLE ... ENABLE ROW LEVEL SECURITY` 启用了行级安全，但没有创建对应的 `CREATE POLICY` 策略。启用 RLS 后如果没有策略，PostgreSQL 的默认行为是"拒绝一切"，API 层为了安全也做了静默处理。

### 处理方案

在 Supabase SQL Editor 中运行完整的 `supabase/schema.sql`，确保每张表都包含 **USING + WITH CHECK 策略**：

```sql
-- 启用 RLS（只做一次）
ALTER TABLE checkin_tasks ENABLE ROW LEVEL SECURITY;

-- 创建策略（必须紧随其后）
CREATE POLICY "user_own_tasks" ON checkin_tasks
  FOR ALL                                -- 所有操作(SELECT/INSERT/UPDATE/DELETE)
  USING (auth.uid() = user_id)           -- 读取限制：只能读自己的行
  WITH CHECK (auth.uid() = user_id);     -- 写入限制：只能写 user_id=自己的行
```

**验证方法**：

| 状态 | 判断标准 |
|------|----------|
| 表不存在 | API 返回 `{code:"PGRST205", message:"Could not find the table..."}` |
| RLS 无策略 | 200 OK，body 始终为 `[]` |
| 正常 | 200 OK，返回实际数据 |

---

## 4. 路径体系混用（Windows + Git Bash）

### 现象

在 VS Code Terminal（Git Bash）中执行路径命令时：

```bash
# Git Bash Unix 风格路径
ls /c/Users/z10915/daily-checkin/    # ✅ 正常
ls C:\Users\z10915\daily-checkin\    # ❌ No such file or directory

# Windows 命令提示符风格路径
cd "D:\VIBECODING\daily-checkin"     # ✅ 正常
cd "/d/VIBECODING/daily-checkin"     # ❌ No such file or directory
```

### 问题分析

| 终端 | 路径风格 | C 盘 | D 盘 |
|------|----------|------|------|
| Git Bash | Unix (`/c/`, `/d/`) | `/c/Users/...` | `/d/VIBECODING/...` |
| Cmd / PowerShell | Windows (`C:\`, `D:\`) | `C:\Users\...` | `D:\VIBECODING\...` |
| WSL | Linux (`/mnt/c/`) | `/mnt/c/Users/...` | `/mnt/d/VIBECODING/...` |

**根因**：项目实际存储在 Windows 文件系统（`D:\VIBECODING`），但 Claude Code 的 Bash 工具运行在 Git Bash 环境（Unix 路径），路径风格不匹配时脚本执行失败。

### 处理方案

在 Git Bash 中统一使用 Unix 路径风格：

```bash
# C 盘 ⇒ /c/
ls /c/Users/z10915/daily-checkin/

# D 盘 ⇒ /d/
cd "/d/VIBECODING/daily-checkin"
```

---

## 5. localStorage 新旧 Key 并存导致混淆

### 现象

v1.x → v2.0 迁移后，localStorage 中同时存在两套 key：

```
checkin_tasks        ← v1.x 数据
checkin_history      ← v1.x 数据
checkin_cache_tasks  ← v2.0 离线缓存
checkin_cache_history← v2.0 离线缓存
```

浏览器 DevTools Application 面板显得混乱，不确定哪些 key 正在生效。

### 问题分析

| Key | 版本 | 用途 | 是否当前使用 |
|-----|------|------|------------|
| `checkin_tasks` | v1.x | 旧版任务存储 | ❌ v2.0 不读 |
| `checkin_history` | v1.x | 旧版打卡记录 | ❌ v2.0 不读 |
| `checkin_cache_tasks` | v2.0 | 离线任务缓存 | ✅ 当前使用 |
| `checkin_cache_history` | v2.0 | 离线记录缓存 | ✅ 当前使用 |
| `checkin_theme` | v1/2 | 主题偏好 | ✅ 当前使用 |
| `checkin_offline_queue` | v2.0 | 离线操作队列 | ✅ 当前使用 |

v2.0 不再读写旧 key，但旧 key 不会自动删除。

**根因**：v2.0 离线缓存层使用了新的 key 命名空间（`checkin_cache_*`），目的有二：
1. 不与 v1.x 数据冲突（保证回退到 `main` 分支时旧数据还在）
2. 缓存数据附加了 `_uid` 字段区分用户，与 v1.x 纯数据结构不兼容

### 处理方案

迁移完成并确认数据正常后，手动清理旧 key：

1. 浏览器 DevTools → Application → Local Storage → `http://localhost:5500`
2. 删除旧 key（仅删旧 key，保留 `checkin_cache_*` 和 `checkin_theme`）：

```
🗑 checkin_tasks
🗑 checkin_history
🗑 todo_categories
🗑 todo_items
```

> 保留 `checkin_theme`、`checkin_cache_*`、`checkin_offline_queue`，删除其余。

---

## 6. iOS「添加到主屏幕」≠ PWA

### 现象

iOS Safari（以及 Edge iOS 版）提供「分享 → 添加到主屏幕」功能。用户添加后，桌面出现图标，点击打开**全屏无地址栏**。表面体验与 PWA 无异。

### 问题分析

这是 iOS WebKit 的默认行为——任何网页添加到桌面都会获得干净 WebView，**但这不等于 PWA**：

| 能力 | 桌面书签 | 真正 PWA（有 manifest） |
|------|---------|----------------------|
| 全屏无地址栏 | ✅ iOS 自动给 | ✅ |
| 自定义图标 | ❌ 截图或文字首字 | ✅ `apple-touch-icon` 指定 |
| 自定义启动画面 | ❌ 白屏 | ✅ manifest `background_color` + `theme_color` |
| 多任务独立卡片 | ❌ 混在 Safari/Edge 里 | ✅ iOS standalone 模式 |
| 离线打开 | ❌ 断网白屏 | ✅ Service Worker 缓存 |
| Android 安装提示 | ❌ 无 | ✅ Chrome 主动弹窗引导安装 |
| Web Push | ❌ | ⚠️ Android ✅，iOS ❌（Apple 至今不支持） |

**根因**：iOS 对"添加到桌面"的优化只是表面功夫——给了一个干净窗口，但没有给 PWA 的工具链（Service Worker、manifest、push）。真正判断 PWA 是否生效要看 `manifest.json` 是否被加载，而非是否有全屏。

### 处理方案

至少加这两行即可解决图标和名称问题（不需要完整 PWA）：

```html
<link rel="apple-touch-icon" href="icon-180.png">
<meta name="apple-mobile-web-app-title" content="打卡">
```

完整 PWA 见 [CHANGELOG.md v2.2.0 方案](#v220-pwa-方案)。

---

## 7. Supabase Storage 免费额度与照片需求不匹配

### 现象

如果计划在记账或打卡模块中加入拍照功能（如收据/打卡照片），上传后很快发现存储空间耗尽或带宽超标。

### 问题分析

Supabase 免费额度（截至 2026 年）：

| 资源 | 免费额度 | 一张手机照片按 3MB 算 |
|------|---------|---------------------|
| 数据库 | 500MB | 结构化数据基本忽略不计 |
| 对象存储 | **1GB** | ≈ 340 张照片 |
| 月带宽 | **5GB** | ≈ 1700 次查看（上传+下载） |

一个活跃用户每天拍一张打卡照：一年 1GB 存储打满。10 个用户拍照片 + 查看月消耗轻松超过 5GB 带宽。

**根因**：Supabase 免费套餐面向原型和小项目，不适合图片/UGC 密集型场景。PostgreSQL 存 TEXT 很便宜（几百 KB/人），但存 binary（照片）很贵。

### 处理方案

| 策略 | 存储 | 带宽 | 效果 |
|------|------|------|------|
| 前端 Canvas 压缩（200KB quality 0.5） | 15x 省 | 15x 省 | 免费额度撑 50-100 活跃用户 |
| 缩略图 Supabase + 原图阿里云 OSS | 降低 | 降低 | 国内访问更快 + 成本可控 |
| 升级 Supabase Pro ($25/月) | 8GB | 50GB | 够小团队用 |

> **建议**：个人或小团队用前端压缩就够。3MB → 200KB 肉眼几乎看不出差异。

---

## 8. 微信/支付宝支付后无法自动通知第三方

### 现象

希望实现「微信/支付宝支付成功后 → 自动弹出记账记录」，但无论在 PWA 还是原生 App 中都无法实现。

### 问题分析

| 环节 | iOS | Android | 原因 |
|------|-----|---------|------|
| 读取微信/支付宝通知 | ❌ | ⚠️ NotificationListener（需授权） | iOS 无等效 API |
| 接收支付回调 URL | ❌ | ❌ | 微信/支付宝不开放此接口 |
| 读取支付短信 | ❌ | ⚠️ Android 12+ 受限 | 银行短信不含商户名 |

**根因**：微信和支付宝不向第三方应用提供「支付后回调」能力，这是**商业决策**而非技术瓶颈。Apple Pay 有 `PKPaymentAuthorizationViewController`，但微信支付和支付宝没有等效开放接口。

### 处理方案

唯一可行的自动化路径是截图 OCR：

```
用户支付 → 截图 → 回 App 粘贴截图 → OCR 提取金额 → 选类别
```

iOS 有 Vision 框架（原生 OCR），Android 可用 ML Kit Text Recognition。PWA 可用 Tesseract.js（纯前端，约 2MB）。准确率针对支付成功页面的规整大字体接近 100%。

---

## 9. Supabase 邮箱确认开启导致注册后无法登录

### 现象

注册成功（`signUp` 返回 200），但立即点击登录时报 `Invalid login credentials`。刷新页面也显示未登录。邮箱中收到 Supabase 确认邮件，但未点确认。

### 问题分析

Supabase Auth 的邮箱确认机制：

```
signUp(email, password)
  └─ Email Confirm ON（默认）
       ├─ 创建 auth.users 行（email_confirmed_at = NULL）
       ├─ 发送确认邮件
       └─ 返回 { user, session: null }  ← 没有 session！

signInWithPassword(email, password)
  └─ 检查 email_confirmed_at
       ├─ NULL → 拒绝登录 "Invalid login credentials"
       └─ 有值 → 允许登录，返回 session
```

**根因**：Supabase 默认开启邮箱确认（需手动在 Dashboard 关闭）。确认关闭前，`signUp` 返回的 `session` 始终为 `null`，用户没有活跃会话。此时间点调用 `signInWithPassword` 会因 `email_confirmed_at = NULL` 被拒绝。

### 处理方案

| 步骤 | 操作 |
|------|------|
| 1 | Supabase Dashboard → **Authentication** → **Settings** → **Email** |
| 2 | 关闭 **Confirm email** 开关 |
| 3 | 保存。新注册用户 `signUp` 直接返回 `{ user, session }`，自动登录 |

前端也应做兼容处理：注册后检查 `resp.data.session` 是否存在：
- 有 `session` → 自动登录（`onAuthStateChange` 触发进应用）
- 无 `session` → 提示"请查收确认邮件后登录"，不自动进应用

---

## 10. 登录/注册混在同一界面导致用户困惑

### 现象

旧版登录界面同时展示昵称、头像、邮箱、密码四个字段，底部两个按钮「登录」「注册新账号」。用户在登录时会困惑是否需要填昵称和头像，注册流程也不清晰。

### 问题分析

单卡片混合设计的问题：

| 场景 | 困惑点 |
|------|--------|
| 用户登录 | 看到昵称和头像字段，不确定是否需要填写 |
| 用户注册 | 注册按钮样式弱化（灰底黑字），视觉上不如登录按钮突出 |
| 注册成功 | 提示"注册成功！请登录"但表单仍显示注册状态，用户需手动再点登录 |

**根因**：登录和注册是两个不同场景，所需字段不同（登录仅邮箱+密码），但 UI 没有区分。底部切换链接也不明显。

### 处理方案

拆为两张独立卡片，通过点击链接切换：

```
登录卡片                      注册卡片
┌──────────────────┐         ┌──────────────────┐
│ 邮箱              │         │ 昵称              │
│ 密码              │         │ 头像（emoji 选择） │
│ [登录]            │         │ 邮箱              │
│ 没有账号？注册 →  │  ←──→   │ 密码              │
│                  │         │ [注册新账号]       │
└──────────────────┘         │ 已有账号？登录 ←   │
                             └──────────────────┘
```

关键行为：
- 切换卡片时保留已填邮箱
- 注册成功（有 session）→ 直接进应用，无需手动登录
- 已注册邮箱 → 提示并自动切回登录卡片

实现见 `js/auth.js` 中 `getAuthHTML()`、`switchAuthCard()`、`bindAuthEvents()`。

---

## 11. GitHub Pages 更改源分支后不自动重建

### 现象

在 GitHub repo 的 Settings → Pages 中将源分支从 `main` 改为 `v2`，保存后显示部署成功，但访问页面仍然是旧版本内容。

### 问题分析

GitHub Pages 在更改源分支后**不一定触发自动重建**。原因：
1. 新的源分支上如果没有新的 commit（最后 commit 时间早于切换操作），Pages 可能认为无需重新部署
2. Pages 构建队列有时会跳过"无变更"的分支切换
3. 浏览器或 CDN 缓存了旧版本（`index.html` 被强缓存）

**根因**：GitHub Pages 的部署触发条件是源分支有新 commit，仅更改设置不产生新 commit。加上 Cloudflare CDN 默认缓存静态资源，用户看到的可能是多层缓存叠加的结果。

### 处理方案

强制触发重新部署：

```bash
git commit --allow-empty -m "trigger: force GitHub Pages redeploy"
git push origin v2
```

空 commit 会在源分支上产生新 SHA，Pages 检测到 commit 变更后必然重新构建。

验证方法：
- 访问 `https://xxx.github.io/daily-checkin/?v=2`（加随机参数绕过 CDN 缓存）
- 或在 DevTools Network 面板勾选 "Disable cache" 后刷新

---

## 12. 网络断开时登录按钮无反馈

### 现象

填写邮箱密码后点击登录，按钮没有任何变化，也没有错误提示。用户以为功能坏了。

### 问题分析

登录代码使用 `await supabase.auth.signInWithPassword(...)`，网络断开时 TCP 连接超时通常需要 **30-120 秒**。在此期间：
- `await` 一直等待 Promise resolve/reject
- 按钮没有视觉变化（无 loading、无 disabled）
- 用户连续点击多次，堆积多个等待中的请求

**根因**：异步请求没有立即给用户反馈。浏览器默认的 TCP 超时很长，`fetch` 不会快速失败。用户需要知道"请求已发出，正在等待响应"，而非"点了没反应"。

### 处理方案

点击后立即给三个反馈：

```javascript
btn.textContent = '登录中…';   // 文字变化
btn.disabled = true;            // 不可重复点击
// 请求完成后恢复
btn.textContent = '登录';
btn.disabled = false;
```

这三个改动成本极低（每个按钮 2 行代码），但对体验的影响远大于代码量。对所有需要网络等待的按钮（登录、注册、保存等）都应加此处理。
