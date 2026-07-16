# Crabbit 后端自托管部署手册

将 Crabbit 后端从 Supabase 云服务迁移到家庭 Mac Mini 自托管，前端代码**只改两行 URL**，其余零改动。

---

## 目录

- [前置条件](#前置条件)
- [第 1 步：Mac Mini 基础配置](#第-1-步mac-mini-基础配置)
- [第 2 步：安装 Docker 和 Supabase CLI](#第-2-步安装-docker-和-supabase-cli)
- [第 3 步：初始化本地 Supabase 项目](#第-3-步初始化本地-supabase-项目)
- [第 4 步：导入数据库 Schema](#第-4-步导入数据库-schema)
- [第 5 步：配置邮箱认证](#第-5-步配置邮箱认证)
- [第 6 步：获取 Anon Key 和 Service Key](#第-6-步获取-anon-key-和-service-key)
- [第 7 步：设置开机自启](#第-7-步设置开机自启)
- [第 8 步：公网访问 — Cloudflare Tunnel](#第-8-步公网访问--cloudflare-tunnel)
- [第 9 步：前端代码修改](#第-9-步前端代码修改)
- [第 10 步：重新部署前端](#第-10-步重新部署前端)
- [日常维护](#日常维护)
- [故障排查](#故障排查)

---

## 前置条件

| 项目 | 要求 |
|------|------|
| Mac Mini | macOS 12+，8GB+ RAM（推荐 16GB），保持 24h 开机 |
| 域名 | 一个自己的域名，DNS 托管在 Cloudflare（约 $1/年） |
| 网络 | 家庭宽带即可，不需要公网 IP |
| 时间 | 首次部署约 1-2 小时 |

---

## 第 1 步：Mac Mini 基础配置

### 1.1 取消自动休眠

```
系统偏好设置 → 节能
  - 此时间段后关闭显示器：永不
  - 防止自动睡眠：勾选
  - 断电后自动重启：勾选
```

### 1.2 固定内网 IP

```
系统偏好设置 → 网络 → 选中当前连接 → 高级 → TCP/IP
  - 配置 IPv4：使用 DHCP（手动设定地址）
  - IPv4 地址：192.168.1.200
```

记下这个 IP，后续需要在同一局域网内访问管理面板。

### 1.3 开启远程登录（方便维护）

```
系统偏好设置 → 通用 → 共享 → 远程管理：开启
```

### 1.4 安装 Homebrew

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

---

## 第 2 步：安装 Docker 和 Supabase CLI

### 2.1 安装 Docker Desktop

```bash
brew install --cask docker
```

启动 Docker Desktop，完成初始化向导。进入 Settings：

- General → `Start Docker Desktop when you log in`：**勾选**
- Resources → Memory：分配 **4GB**（最低 2GB）
- Resources → Disk image location：确认有 20GB+ 可用空间

### 2.2 安装 Supabase CLI

```bash
brew install supabase/tap/supabase
```

验证安装：

```bash
supabase --version
# 预期输出: 1.x.x 或 2.x.x
```

---

## 第 3 步：初始化本地 Supabase 项目

```bash
# 创建项目目录
mkdir -p ~/crabbit && cd ~/crabbit

# 初始化 Supabase（这会创建一个 docker-compose 相关的配置）
supabase init
```

### 3.1 配置 docker-compose 环境变量

编辑 `~/crabbit/.env`（`supabase init` 自动生成），关键配置：

```ini
# JWT 密钥 — 生成一个随机字符串，至少 32 位
# 生成方式：openssl rand -base64 32
JWT_SECRET=替换为你的随机字符串

# API 密钥
ANON_KEY=替换为你的匿名密钥
SERVICE_ROLE_KEY=替换为你的服务密钥

# 邮箱配置（先留空，后面配置）
ENABLE_EMAIL_AUTOCONFIRM=false
ENABLE_EMAIL_SIGNUP=true

# SMTP 配置（开发阶段用本地 mailhog）
ENABLE_EMAIL_SIGNUP=true
SMTP_ADMIN_EMAIL=admin@example.com
SMTP_HOST=mailhog
SMTP_PORT=1025
SMTP_USER=
SMTP_PASS=

# API 外部 URL（部署后改成你的域名）
API_EXTERNAL_URL=http://localhost:54321
SITE_URL=http://localhost:3000
ADDITIONAL_REDIRECT_URLS=http://localhost:5500
```

### 3.2 生成密钥

```bash
# 生成 JWT_SECRET
openssl rand -base64 32

# 生成 ANON_KEY 和 SERVICE_ROLE_KEY
# 可以直接用 Supabase 自带的工具：
supabase status
```

### 3.3 启动 Supabase

```bash
cd ~/crabbit
supabase start
```

首次启动会拉取 Docker 镜像（约 5-10 分钟）。启动完成后会显示：

```
Started supabase local development setup.

         API URL: http://127.0.0.1:54321
     GraphQL URL: http://127.0.0.1:54321/graphql/v1
          DB URL: postgresql://postgres:postgres@127.0.0.1:54322/postgres
      Studio URL: http://127.0.0.1:54323
    Inbucket URL: http://127.0.0.1:54324
      anon key: eyJh......
service_role key: eyJh......
```

记下 **API URL**、**anon key** 和 **Studio URL**。Studio 是 Supabase 的本地管理面板。

---

## 第 4 步：导入数据库 Schema

先把项目的 Schema 文件复制到 Mac Mini 上（通过 AirDrop、scp 或直接粘贴均可），然后导入：

```bash
# 连接到本地 PostgreSQL
docker exec -i $(docker ps --filter "name=supabase_db" -q) \
  psql -U postgres -d postgres < ~/crabbit/schema.sql
```

验证表是否创建成功：

```bash
docker exec -i $(docker ps --filter "name=supabase_db" -q) \
  psql -U postgres -d postgres -c "\dt"
```

预期输出：

```
            List of relations
 Schema |         Name         | Type  |  Owner
--------+----------------------+-------+----------
 public | bookkeeping_records  | table | postgres
 public | checkin_history      | table | postgres
 public | checkin_tasks        | table | postgres
 public | todo_categories      | table | postgres
 public | todo_items           | table | postgres
 public | user_profiles        | table | postgres
```

验证 RLS 策略：

```bash
docker exec -i $(docker ps --filter "name=supabase_db" -q) \
  psql -U postgres -d postgres -c "\d checkin_tasks"
```

确认输出中包含 `Row level security` 和对应的 POLICY。

---

## 第 5 步：配置邮箱认证

### 5.1 Studio 中配置

浏览器打开 `http://192.168.1.200:54323`（Studio URL），用默认凭据登录：

```
用户名: supabase
密码:   postgres
```

进入 **Authentication → Settings**：

| 配置项 | 值 | 说明 |
|--------|---|------|
| Site URL | `http://localhost:5500` | VS Code Live Server 端口 |
| Redirect URLs | `http://localhost:5500,**` | 允许更多重定向来源 |

进入 **Authentication → Providers → Email**：

| 配置项 | 值 | 说明 |
|--------|---|------|
| Enable Email provider | ✅ 开启 | |
| Confirm email | ❌ 关闭 | 开发阶段关闭，正式上线可开启 |

### 5.2 测试邮箱验证流程

注册流程中的邮箱确认邮件会发送到本地 MailHog（`http://192.168.1.200:54324`）。关闭 Confirm email 后，注册即自动登录。

---

## 第 6 步：获取 Anon Key 和 Service Key

这些密钥用于前端 SDK 初始化。有两种方式获取：

**方式一**：`supabase start` 时终端打印的 `anon key` 和 `service_role key`

**方式二**：Studio → Settings → API → 复制 `anon public key`

前端只需要 **anon key**。Service role key 是管理端用的，**不能**暴露到前端代码中。

---

## 第 7 步：设置开机自启

### 7.1 创建 LaunchAgent

创建 `~/Library/LaunchAgents/com.crabbit.supabase.plist`：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
 "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.crabbit.supabase</string>
    <key>WorkingDirectory</key>
    <string>/Users/你的用户名/crabbit</string>
    <key>ProgramArguments</key>
    <array>
        <string>/opt/homebrew/bin/supabase</string>
        <string>start</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/Users/你的用户名/crabbit/supabase.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/你的用户名/crabbit/supabase_error.log</string>
</dict>
</plist>
```

### 7.2 加载并测试

```bash
# 先停掉当前运行的 Supabase
supabase stop

# 加载 LaunchAgent
launchctl load ~/Library/LaunchAgents/com.crabbit.supabase.plist

# 验证状态
launchctl list | grep crabbit

# 等待 30 秒后测试
curl http://localhost:54321/rest/v1/checkin_tasks \
  -H "apikey: 你的anon_key"
```

### 7.3 重启验证

```bash
sudo shutdown -r now
# 重启后等待 2-3 分钟，Docker 和 Supabase 自动启动
# 用手机或另一台设备访问 http://192.168.1.200:54321 验证
```

---

## 第 8 步：公网访问 — Cloudflare Tunnel

Cloudflare Tunnel 让外网可以访问你的 Mac Mini，**不需要公网 IP**，**不需要端口转发**。

### 8.1 前提：域名托管在 Cloudflare

1. 注册域名（如 `crabbit.xyz`，约 $1/年）
2. 在 Cloudflare 中，域名 → DNS → 确认 DNS 记录由 Cloudflare 管理

### 8.2 安装 cloudflared

```bash
brew install cloudflare/cloudflare/cloudflared
```

### 8.3 登录 Cloudflare

```bash
cloudflared tunnel login
```

浏览器会打开 Cloudflare 授权页面，选择你的域名 → Authorize。

### 8.4 创建隧道

```bash
cloudflared tunnel create crabbit-tunnel
```

输出示例：

```
Tunnel credentials written to /Users/xxx/.cloudflared/<tunnel-id>.json
```

记下这个 JSON 文件路径。

### 8.5 创建 DNS 路由

```bash
# 将你的域名指向这个隧道
cloudflared tunnel route dns crabbit-tunnel crabbit.你的域名.com
```

Cloudflare 会自动在 DNS 中添加一条 CNAME 记录。

### 8.6 配置隧道规则

创建 `~/.cloudflared/config.yml`：

```yaml
tunnel: crabbit-tunnel
credentials-file: /Users/你的用户名/.cloudflared/<tunnel-id>.json

ingress:
  # Supabase API（GoTrue + PostgREST）
  - hostname: crabbit.你的域名.com
    service: http://localhost:54321

  # catch-all
  - service: http_status:404
```

### 8.7 安装为系统服务并启动

```bash
sudo cloudflared service install
```

验证：

```bash
# 切到手机移动数据，浏览器访问
https://crabbit.你的域名.com/rest/v1/
# 应该返回 {"swagger":"2.0",...}
```

### 8.8 更新 Supabase 配置

隧道配好后，Supabase 需要知道外部域名：

```bash
# 编辑 ~/crabbit/.env
API_EXTERNAL_URL=https://crabbit.你的域名.com
SITE_URL=https://crabbit.你的域名.com
ADDITIONAL_REDIRECT_URLS=https://crabbit.你的域名.com,http://localhost:5500

# 重启 Supabase
supabase stop
supabase start
```

---

## 第 9 步：前端代码修改

只需修改 `js/supabase-client.js` 中的两个常量：

```javascript
// 改前（旧 Supabase 云项目，已失效）
const SUPABASE_URL = 'https://krvztfxtybxnlqauefhz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOi...';

// 改后（你的自托管实例）
const SUPABASE_URL = 'https://crabbit.你的域名.com';
const SUPABASE_ANON_KEY = '你的 anon key';  // 从 supabase start 输出或 Studio Settings → API 获取
```

> **注意**：`SUPABASE_URL` 不要带 `/rest/v1/` 后缀。SDK 的 `createClient()` 内部会自动拼接此路径。详情见 [PITFALLS.md #2](PITFALLS.md#2-supabase-clientjs-url-带-restv1-后缀导致-api-404)。

---

## 第 10 步：重新部署前端

前端是纯静态文件，部署到任意静态托管服务，**只需指向你的域名**。

### GitHub Pages

```bash
git add .
git commit -m "chore: switch to self-hosted Supabase"
git push
# Settings → Pages → 选择分支 → Save
```

### Vercel

```bash
vercel deploy --prod
```

### 本地测试

```bash
# VS Code 安装 Live Server 插件，右键 index.html → Open with Live Server
# 浏览器打开 http://localhost:5500
```

---

## 日常维护

### 状态检查

```bash
# Docker 运行状态
docker ps

# 隧道状态
cloudflared tunnel info crabbit-tunnel

# Supabase 日志
tail -f ~/crabbit/supabase.log
```

### 数据库备份

创建 `~/backup.sh`：

```bash
#!/bin/bash
mkdir -p ~/backups
docker exec $(docker ps --filter "name=supabase_db" -q) \
  pg_dump -U postgres postgres > ~/backups/crabbit_$(date +%Y%m%d).sql
# 保留最近 7 天
ls -t ~/backups/crabbit_*.sql | tail -n +8 | xargs rm -f --
```

```bash
chmod +x ~/backup.sh
crontab -e
# 添加（每天凌晨 3 点）
# 0 3 * * * /Users/你的用户名/backup.sh
```

### 更新 Supabase

```bash
brew upgrade supabase
cd ~/crabbit
supabase stop
supabase start
```

---

## 故障排查

### Supabase 启动失败

```bash
# 查看容器状态
docker ps -a

# 查看容器日志
docker logs $(docker ps --filter "name=supabase_db" -q)

# 完全重置
supabase stop
docker system prune -a
supabase start
```

### 无法从外网访问

```bash
# 检查隧道状态
cloudflared tunnel info crabbit-tunnel

# 查看 tunnel 日志
sudo cloudflared service logs

# 检查 DNS 解析
dig crabbit.你的域名.com
# 应返回 CNAME 指向 <tunnel-id>.cfargotunnel.com
```

### 前端登录无响应

参照 [PITFALLS.md](PITFALLS.md) 中记录的常见问题：

1. Site URL 端口是否正确（Live Server 是 5500）
2. Email provider 是否在 Auth Settings 中启用
3. Confirm email 是否关闭（开发阶段）
4. `supabase-client.js` 的 URL 是否带 `/rest/v1/`（不能带）
5. RLS 策略是否正确导入（参见 PITFALLS #3）

### Mac Mini 重启后服务未启动

```bash
# 检查 LaunchAgent 是否加载
launchctl list | grep crabbit

# 手动加载
launchctl load ~/Library/LaunchAgents/com.crabbit.supabase.plist
```

---

## 完成检查清单

- [ ] Mac Mini 取消休眠、固定 IP
- [ ] Docker Desktop 安装并设置开机自启
- [ ] `supabase start` 正常启动，6 个容器运行中
- [ ] schema.sql 导入成功，6 张表 + RLS 策略存在
- [ ] Studio 面板（`http://IP:54323`）可访问
- [ ] Auth → Email provider 启用，Confirm email 关闭
- [ ] LaunchAgent 注册，重启后 Supabase 自动启动
- [ ] Cloudflare Tunnel 安装并配置为服务
- [ ] 域名成功指向隧道，HTTPS 可访问
- [ ] `js/supabase-client.js` 中 URL 和 anon key 已更新
- [ ] 前端重新部署
- [ ] 手机移动数据测试：注册 → 登录 → 打卡 → 记账 → 刷新后数据还在
- [ ] 备份脚本配置到 crontab
