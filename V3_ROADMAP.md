# Crabbit! v3.0 — Agent 智能联动架构方案

## 版本定位

v3.0 将 Crabbit! 从一个**被动记录的 PWA 应用**升级为**主动服务的智能助手**。用户在 QQ 对话框里用自然语言完成打卡、记账、待办、查询等操作，Agent 定时主动推送摘要与提醒，未来还能基于用户习惯和出行计划智能推荐信息。

核心变化：
- **输入方式**：从「打开 App → 手动填写表单」变为「QQ 里说一句话」
- **角色转变**：从「工具」变为「管家」——主动提醒、预警、推荐
- **数据闭环**：QQ 发消息 → Agent 识别意图 → 写入 Supabase → PWA 实时展示

---

## 一、总体架构

```
┌──────────────────────────────────────────────────────────────────────┐
│                         Mac Mini (Agent Server)                       │
│                                                                       │
│  ┌─────────────┐   ┌──────────────┐   ┌──────────────────────────┐  │
│  │  QQ Gateway │   │  Scheduler   │   │   Web Tools              │  │
│  │  (NapCat)   │   │  (APScheduler)│   │  (BraveSearch+Playwright)│  │
│  └──────┬──────┘   └──────┬───────┘   └───────────┬──────────────┘  │
│         │                 │                       │                   │
│         └─────────────────┼───────────────────────┘                   │
│                           │                                           │
│                    ┌──────┴──────────┐                                │
│                    │  Message Bus    │  ← Redis / in-memory queue     │
│                    └──────┬──────────┘                                │
│                           │                                           │
│                    ┌──────┴──────────┐                                │
│                    │  Intent Engine  │  ← LLM (DeepSeek / OpenAI)    │
│                    └──────┬──────────┘                                │
│                           │                                           │
│              ┌────────────┼────────────┐                              │
│              ▼            ▼            ▼                              │
│        ┌─────────┐ ┌──────────┐ ┌──────────────┐                    │
│        │  Tool   │ │  Reply   │ │  Context     │                    │
│        │ Executor│ │ Generator│ │  Memory      │                    │
│        └────┬────┘ └────┬─────┘ └──────────────┘                    │
│             │           │                                             │
└─────────────┼───────────┼────────────────────────────────────────────┘
              │           │
              ▼           ▼
     ┌──────────────────────────┐
     │       Supabase           │
     │  PostgreSQL + Auth + RLS │
     └───────────┬──────────────┘
                 │
                 ▼
     ┌──────────────────────────┐
     │    Crabbit! PWA          │
     │  (现有 v2.x 前端)         │
     └──────────────────────────┘
```

---

## 二、核心技术选型

### 2.1 Agent 框架

| 方案 | 优点 | 缺点 | 推荐度 |
|------|------|------|--------|
| OpenClaw | 开源、轻量、可自部署 | 社区小、生态不成熟、QQ 适配需自建 | ⭐⭐ |
| **LangChain + FastAPI** | 生态最成熟、工具链完整、QQ 适配灵活 | 稍重、学习曲线 | ⭐⭐⭐⭐⭐ |
| Dify | 可视化编排、开箱即用 | 黑盒、定制受限、QQ 通道需 hack | ⭐⭐⭐ |
| Camel + NoneBot | 原生支持 QQ、Python 生态 | 耦合度高、不便于扩展到其他通道 | ⭐⭐⭐ |

**选定：LangChain + FastAPI 自建 Agent**

理由：
- QQ 消息网关独立部署，Agent 核心通过标准 WebSocket/HTTP 与之通信——网关与大脑解耦
- LangChain 的 Tool / Agent / Memory 抽象与需求完美匹配
- 后续扩展其他消息通道（Telegram、钉钉、飞书）只需加适配器
- 自建方案对定时触发、本地函数调用、多轮对话记忆的控制粒度最细

### 2.2 组件选型清单

| 组件 | 选型 | 说明 |
|------|------|------|
| QQ 消息网关 | NapCatQQ + OneBot v11 | QQ NT 协议，WS 反向代理到 Agent |
| Agent 运行时 | Python 3.11+ / FastAPI | 异步高性能，WebSocket 原生支持 |
| LLM 主力 | DeepSeek-V3 | 成本优先，中文理解强 |
| LLM 备选 | GPT-4o-mini | 复杂任务备用 |
| 意图识别 | LangChain Function Calling | 利用 LLM 原生 function call 做意图路由 |
| 消息队列 | Redis（轻量） | 消峰 + 重试 |
| 定时调度 | APScheduler | Python 原生 cron，支持持久化 |
| 联网搜索 | Brave Search API / SearXNG 自建 | 前者简单但收费，后者免费但需部署 |
| 网页爬虫 | Playwright + BeautifulSoup | 无头浏览器处理 SPA，BS4 处理静态 |
| 数据库 | Supabase（不变） | 扩表现有 schema |
| 进程管理 | Docker Compose | 一键启动/重启/日志收集 |

---

## 三、数据库扩展

在现有 6 张业务表 + 1 张 user_profiles 表基础上，新增 5 张 Agent 相关表。

### 3.1 `agent_messages` — 消息全量日志

```sql
CREATE TABLE agent_messages (
  id            BIGSERIAL PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel       TEXT NOT NULL DEFAULT 'qq',          -- qq / web / telegram
  direction     TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  raw_text      TEXT NOT NULL,
  intent        TEXT,                                 -- 识别出的意图
  confidence    REAL,                                 -- 意图置信度 0-1
  tool_called   TEXT,                                 -- 调用的工具名
  tool_result   JSONB,                                -- 工具返回结果
  reply_text    TEXT,                                 -- 回复内容
  latency_ms    INT,                                  -- 端到端延迟
  created_at    TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_agent_msgs_user ON agent_messages(user_id, created_at DESC);
```

### 3.2 `agent_scheduled_jobs` — 定时/触发任务

```sql
CREATE TABLE agent_scheduled_jobs (
  id            BIGSERIAL PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_type      TEXT NOT NULL CHECK (job_type IN ('cron', 'once', 'event')),
  trigger_rule  JSONB NOT NULL,                       -- {cron:"0 9 * * *"} 或 {event:"travel_approaching"}
  action        JSONB NOT NULL,                       -- {tool:"push_summary", params:{module:"bookkeeping"}}
  enabled       BOOLEAN DEFAULT true,
  last_run_at   TIMESTAMPTZ,
  next_run_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT now()
);
```

### 3.3 `agent_user_context` — 用户画像

```sql
CREATE TABLE agent_user_context (
  user_id       UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  habits        JSONB DEFAULT '[]',                   -- [{type:"exercise", time:"07:00", freq:"daily"}]
  preferences   JSONB DEFAULT '{}',                   -- {reply_style:"brief", push_channels:["qq"]}
  locations     JSONB DEFAULT '[]',                   -- [{name:"家", lat:..., lng:...}, {name:"公司"}]
  recent_topics JSONB DEFAULT '[]',                   -- 最近关注话题
  updated_at    TIMESTAMPTZ DEFAULT now()
);
```

### 3.4 `agent_conversation_memory` — 对话记忆

```sql
CREATE TABLE agent_conversation_memory (
  id            BIGSERIAL PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id    TEXT NOT NULL,                         -- 会话标识
  role          TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'tool')),
  content       TEXT NOT NULL,
  metadata      JSONB DEFAULT '{}',
  created_at    TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_agent_conv_user_session ON agent_conversation_memory(user_id, session_id, created_at);
```

### 3.5 `user_qq_bindings` — QQ 绑定

```sql
CREATE TABLE user_qq_bindings (
  user_id     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  qq_id       TEXT NOT NULL UNIQUE,                   -- QQ 号
  bind_code   TEXT,                                    -- 一次性绑定码
  bind_at     TIMESTAMPTZ DEFAULT now()
);
```

### 3.6 RLS 策略（与其他表一致）

```sql
ALTER TABLE agent_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_scheduled_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_user_context ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_conversation_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_qq_bindings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_own_messages" ON agent_messages
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user_own_jobs" ON agent_scheduled_jobs
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user_own_context" ON agent_user_context
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user_own_conv_memory" ON agent_conversation_memory
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user_own_qq_bindings" ON user_qq_bindings
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
```

---

## 四、Agent 核心流程

### 4.1 完整请求链路

```
QQ 用户发送 "午饭花了35块"
        │
   ┌────▼────────────────────────────────────────────┐
   │  NapCatQQ (Mac Mini Docker)                      │
   │  ← 接收 QQ NT 消息，转为 OneBot v11 格式          │
   │  ← WS push → ws://agent:8080/ws/qq               │
   └────┬────────────────────────────────────────────┘
        │
   ┌────▼────────────────────────────────────────────┐
   │  FastAPI /ws/qq handler                         │
   │  1. 解析 OneBot 消息，提取 user_qq, raw_text     │
   │  2. 查 user_qq_bindings → 映射到 Supabase uid    │
   │  3. 写入 agent_messages (direction=inbound)      │
   │  4. 入队 MessageBus                              │
   └────┬────────────────────────────────────────────┘
        │
   ┌────▼────────────────────────────────────────────┐
   │  Intent Engine (LLM Function Call)               │
   │  System Prompt:                                  │
   │  "你是一个生活管理助手的意图识别器。根据用户消息， │
   │   调用对应的 function。支持的函数:                │
   │   - record_expense(amount, category, note)       │
   │   - create_todo(title, deadline, priority)       │
   │   - record_checkin(task_name, count)             │
   │   - query_stats(module, period)                  │
   │   - web_search(query)                            │
   │   - schedule_reminder(time, content)             │
   │   - casual_chat(reply)                           │
   │   ..."                                           │
   │                                                   │
   │  LLM 返回: {function:"record_expense",            │
   │             args:{amount:35, category:"午餐",      │
   │                   note:"", date:"2026-05-20"}}     │
   └────┬────────────────────────────────────────────┘
        │
   ┌────▼────────────────────────────────────────────┐
   │  Tool Executor                                   │
   │  1. 查 Tool Registry → record_expense 处理器     │
   │  2. 执行业务逻辑:                                 │
   │     - 校验参数                                    │
   │     - 调用 Supabase insert bookkeeping_records    │
   │     - 返回结果 {success:true, record_id:123}      │
   │  3. 写入 agent_messages (tool_called, tool_result)│
   └────┬────────────────────────────────────────────┘
        │
   ┌────▼────────────────────────────────────────────┐
   │  Reply Generator                                 │
   │  LLM 二次调用 (带上下文):                          │
   │  "用户记账成功。金额35元，类别午餐。                │
   │   请生成简短确认回复，语气轻松。"                   │
   │  → "收到！已记一笔午餐 ¥35.00 🍜"                 │
   └────┬────────────────────────────────────────────┘
        │
   ┌────▼────────────────────────────────────────────┐
   │  NapCatQQ send_msg API                          │
   │  ← 回复推送到 QQ 对话框                           │
   └──────────────────────────────────────────────────┘
        │
   ┌────▼────────────────────────────────────────────┐
   │  Crabbit! PWA                                   │
   │  ← 用户打开 App，dbRefreshAllCaches 拉取最新数据  │
   │  ← 记账页面自动显示新记录                          │
   └──────────────────────────────────────────────────┘
```

### 4.2 意图分发策略（两级路由，降成本）

```
用户消息
    │
    ▼
┌──────────────┐
│ 第一级：关键词  │  ← 本地正则 / 快速匹配（0ms，免费）
│ 前缀匹配       │
│ /打卡 → checkin│
│ /账  → expense │
│ /查  → query   │
│ /搜  → search  │
│ /提醒 → remind │
└──────┬───────┘
       │ 未命中
       ▼
┌──────────────┐
│ 第二级：LLM    │  ← DeepSeek-V3 Function Call（~200ms，¥0.001/次）
│ 语义理解       │
│ 置信度 > 0.7  → 执行工具
│ 置信度 < 0.7  → 澄清追问 或 casual_chat
└──────────────┘
```

---

## 五、工具注册表（Tool Registry）

Agent 核心的可扩展工具系统，每个工具是一个 Python 函数 + LLM 可理解的描述 schema。

### 5.1 本地函数工具（操作 Crabbit! 数据库）

| 工具名 | 功能 | 对应模块 | 操作表 |
|--------|------|----------|--------|
| `record_checkin` | 打卡 | 打卡 | checkin_tasks / checkin_history |
| `create_todo` | 创建待办 | 待办 | todo_items |
| `record_expense` | 记账（支出） | 记账 | bookkeeping_records |
| `record_income` | 记账（收入） | 记账 | bookkeeping_records |
| `query_checkin_stats` | 查询打卡统计 | 打卡 | checkin_history (read) |
| `query_todo_list` | 查询待办列表 | 待办 | todo_items (read) |
| `query_expense_stats` | 查询消费统计 | 记账 | bookkeeping_records (read) |
| `update_todo_status` | 更新待办状态 | 待办 | todo_items (update) |
| `delete_todo` | 删除待办 | 待办 | todo_items (delete) |

### 5.2 外部工具

| 工具名 | 功能 | 实现 |
|--------|------|------|
| `web_search` | 联网搜索 | Brave Search API / SearXNG |
| `web_scrape` | 网页内容抓取 | Playwright + readability-extractor |
| `get_weather` | 天气查询 | wttr.in / 和风天气 API |
| `translate` | 翻译 | DeepSeek / Google Translate |
| `calculate` | 计算器 | Python eval (沙箱) |

### 5.3 元工具

| 工具名 | 功能 | 说明 |
|--------|------|------|
| `schedule_reminder` | 创建提醒 | 写入 agent_scheduled_jobs |
| `save_context` | 记录用户偏好 | 写入 agent_user_context |
| `casual_chat` | 闲聊兜底 | LLM 自由回复 |

### 5.4 工具注册代码示例

```python
# agent/src/tools/registry.py
from typing import Callable, Dict, Any
from langchain.tools import Tool

class ToolRegistry:
    _tools: Dict[str, Callable] = {}

    @classmethod
    def register(cls, name: str, description: str):
        """装饰器：注册一个工具"""
        def decorator(func: Callable):
            cls._tools[name] = Tool(
                name=name,
                description=description,
                func=func
            )
            return func
        return decorator

    @classmethod
    def get_all(cls) -> list:
        return list(cls._tools.values())

    @classmethod
    def get(cls, name: str):
        return cls._tools.get(name)


# 使用示例
@ToolRegistry.register(
    name="record_expense",
    description="记录一笔支出。参数: amount(金额), category(类别如午餐/交通/购物), note(备注,可选), date(日期YYYY-MM-DD,可选,默认今天)"
)
async def record_expense(user_id: str, amount: float, category: str,
                         note: str = "", date: str = None):
    if amount <= 0:
        return {"success": False, "error": "金额必须大于0"}
    # ... Supabase insert ...
    return {"success": True, "record_id": record_id}
```

---

## 六、定时触发 & 主动推送

### 6.1 定时任务清单

| 任务名 | 触发规则 | 推送内容 | 通道 |
|--------|----------|----------|------|
| 早间简报 | 每天 8:00 | 今日待办 + 天气 + 今日安排 | QQ |
| 晚间打卡提醒 | 每天 21:00 | 未完成的打卡 + 今日回顾 | QQ |
| 周消费报告 | 每周一 10:00 | 上周消费分类汇总 + 环比 | QQ |
| 月总结报告 | 每月1日 9:00 | 上月全模块总结（打卡率 + 待办完成 + 收支） | QQ |
| 待办到期提醒 | 每天 9:00 | 今日到期 + 已逾期待办 | QQ |
| 旅行准备提醒 | 旅行前3天 | 待办清单 + 行前提醒 | QQ |

### 6.2 智能推送引擎（v3.2+）

```python
# agent/src/scheduler/proactive.py
class ProactiveEngine:
    """
    根据以下数据源主动生成推送：
    - agent_user_context.habits（用户习惯模式）
    - agent_user_context.locations（位置信息）
    - todo_items（待办 deadline）
    - checkin_history（打卡规律）
    - bookkeeping_records（消费模式）
    """

    def evaluate_triggers(self, user_id: str) -> list[str]:
        triggers = []

        # 规则1: 连续3天未打卡 → 提醒
        if self.consecutive_missed_checkin(user_id) >= 3:
            triggers.append("你已经3天没打卡了，今天要加油哦 🔥")

        # 规则2: 本周消费超过上周 150% → 预警
        if self.weekly_spend_ratio(user_id) > 1.5:
            triggers.append("本周花费已超过上周的150%，注意预算 💰")

        # 规则3: 旅行出发前 N 天 → 清单推送
        for trip in self.get_upcoming_trips(user_id):
            days_left = (trip.date - today).days
            if days_left == 3:
                triggers.append(f"距离{trip.name}还有3天，记得检查准备清单 🧳")

        # 规则4: 习惯时间未活动 → 提醒
        for h in self.check_habit_patterns(user_id):
            triggers.append(f"今天还没{h.name}呢，别忘了 🏃")

        return triggers
```

### 6.3 推送内容格式

```json
{
  "type": "daily_brief",
  "timestamp": "2026-05-20T08:00:00+08:00",
  "blocks": [
    { "type": "header", "text": "☀️ 早上好！今天是5月20日 周三" },
    { "type": "weather", "text": "深圳 阴转多云 22°C~28°C" },
    { "type": "section", "title": "📋 今日待办 (3项)", "items": ["..."] },
    { "type": "section", "title": "💰 昨日消费", "text": "¥127.50 (午餐35 + 交通8 + 购物84.5)" },
    { "type": "tip", "text": "💡 你已经连续打卡12天，保持下去！" }
  ]
}
```

---

## 七、QQ 用户绑定流程

```
┌─────────────────────────────────────────────────────┐
│  QQ 用户首次发消息                                    │
│  "你好"                                              │
└──────────┬──────────────────────────────────────────┘
           │
           ▼
   ┌──────────────────────────────────────┐
   │  Agent 检测未绑定                      │
   │  → 回复: "请先在 Crabbit! App 中       │
   │    绑定 QQ。绑定码: X7K2M"             │
   │  → 写入 agent_messages + 缓存绑定码    │
   └──────────┬───────────────────────────┘
              │
              ▼
   ┌──────────────────────────────────────┐
   │  用户在 Crabbit! PWA 用户面板          │
   │  → 点击「绑定QQ」                      │
   │  → 输入绑定码: X7K2M                   │
   │  → 前端调用 Supabase 写入绑定关系       │
   │     INSERT INTO user_qq_bindings      │
   │     (user_id, qq_id, bind_code)       │
   └──────────┬───────────────────────────┘
              │
              ▼
   ┌──────────────────────────────────────┐
   │  Agent 检测到绑定完成                  │
   │  → QQ 回复: "绑定成功！现在可以        │
   │    直接通过 QQ 管理你的生活数据了 🦀"   │
   └──────────────────────────────────────┘
```

---

## 八、典型交互场景

### 场景1：记账

```
User:  午饭花了35
Agent: 收到！已记一笔午餐 ¥35.00 🍜
```

### 场景2：创建待办

```
User:  提醒我明天下午3点开会
Agent: 已创建待办「开会」，截止时间 5月21日 15:00，优先级 高 ⏰
```

### 场景3：打卡

```
User:  /打卡 健身
Agent: ✅ 健身打卡成功！今日已完成 1/3
```

### 场景4：查询

```
User:  这周花了多少钱
Agent: 本周（5/18-5/24）共支出 ¥847.30
       餐饮 ¥285 | 交通 ¥62 | 购物 ¥420 | 其他 ¥80.3
```

### 场景5：联网搜索

```
User:  /搜 周末深圳有什么好玩的展览
Agent: 帮你查到了深圳本周末的展览：
       1. 深圳博物馆《古代中国》常设展（免费）
       2. 海上世界文化艺术中心「光影之间」数字艺术展（¥88）
       3. ...
```

### 场景6：主动推送

```
Agent: ☀️ 早上好！今天是5月20日 周三
       深圳 阴转多云 22°C~28°C
       📋 今日待办: 开会(15:00) | 交报告
       💰 昨日消费: ¥127.50
       💡 你已经连续打卡12天，保持下去！
```

---

## 九、项目目录结构

```
crabbit/
├── agent/                          # ← v3.0 新增，Mac Mini 部署
│   ├── docker-compose.yml          # NapCat + Redis + Agent 一键部署
│   ├── Dockerfile                  # Agent 镜像
│   ├── requirements.txt
│   ├── .env.example
│   │
│   ├── src/
│   │   ├── main.py                 # FastAPI 入口
│   │   ├── config.py               # 配置管理（env → pydantic settings）
│   │   │
│   │   ├── gateway/                # 消息网关层
│   │   │   ├── qq_handler.py       # OneBot v11 WS 协议处理
│   │   │   └── web_handler.py      # PWA 内嵌聊天窗口 (预留)
│   │   │
│   │   ├── engine/                 # 意图引擎
│   │   │   ├── router.py           # 两级路由（关键词 + LLM）
│   │   │   ├── llm_client.py       # LLM 调用封装（DeepSeek/OpenAI）
│   │   │   └── prompts.py          # System prompt 模板
│   │   │
│   │   ├── tools/                  # 工具注册 & 执行
│   │   │   ├── registry.py         # Tool Registry（装饰器注册）
│   │   │   ├── local/              # 本地工具（操作 Supabase）
│   │   │   │   ├── checkin_tools.py
│   │   │   │   ├── todo_tools.py
│   │   │   │   ├── bookkeeping_tools.py
│   │   │   │   └── query_tools.py
│   │   │   └── external/           # 外部工具
│   │   │       ├── web_search.py
│   │   │       ├── web_scraper.py
│   │   │       └── weather.py
│   │   │
│   │   ├── scheduler/              # 定时调度
│   │   │   ├── jobs.py             # 任务定义
│   │   │   └── proactive.py        # 主动推送引擎
│   │   │
│   │   ├── memory/                 # 对话记忆
│   │   │   ├── conversation.py     # 多轮会话管理
│   │   │   └── user_context.py     # 用户画像读写
│   │   │
│   │   ├── reply/                  # 回复生成
│   │   │   └── generator.py        # 模板 + LLM 混合生成
│   │   │
│   │   └── db/                     # 数据库
│   │       ├── supabase_client.py  # Supabase SDK 封装
│   │       └── models.py           # Pydantic 数据模型
│   │
│   └── tests/
│       ├── test_router.py
│       ├── test_checkin_tools.py
│       └── test_e2e.py
│
├── supabase/
│   └── schema.sql                  # ← 扩展 5 张 agent 表
│
├── js/                             # 现有 PWA 前端（不变）
├── css/
├── index.html
└── ...
```

---

## 十、常见交互流程对应的意图路由

```
消息输入                          → 一级路由        → 二级路由(LLM)              → 工具                       → 回复
─────────────────────────────────────────────────────────────────────────────────────────────────────────
"/打卡 健身"                      → checkin        → -                         → record_checkin             → "✅ 健身打卡成功"
"午饭花了35"                      → -              → expense, {amount:35,       → record_expense             → "收到！午餐 ¥35 🍜"
                                                      cat:"午餐"}
"明天下午3点开会"                  → -              → todo, {title:"开会",      → create_todo                → "已创建待办「开会」⏰"
                                                      deadline:"2026-05-21
                                                      T15:00"}
"这周花了多少钱"                   → /查 → query    → query_stats,              → query_expense_stats        → "本周共支出 ¥847 ..."
                                                      {module:"bookkeeping",
                                                       period:"this_week"}
"/搜 周末深圳展览"                  → /搜 → search   → web_search,               → web_search                 → "帮你查到了 ..."
                                                      {query:"深圳周末展览"}
"每天早上8点推送今日待办"            → /提醒 → remind → schedule_reminder,       → schedule_reminder          → "已设置每日8点推送"
                                                      {cron:"0 8 * * *",
                                                       action:"daily_brief"}
"感觉今天好累"                     → -              → casual_chat               → casual_chat                → "辛苦了，今天早点休息吧 🌙"
```

---

## 十一、部署方案（Mac Mini）

### 11.1 Docker Compose 编排

```yaml
# agent/docker-compose.yml
version: '3.8'
services:
  napcat:
    image: napcat/napcatqq:latest
    container_name: napcat
    environment:
      - WS_SERVER=ws://agent:8080/ws/qq
    volumes:
      - ./napcat_data:/app/data
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    container_name: agent-redis
    restart: unless-stopped

  agent:
    build: .
    container_name: crabbit-agent
    environment:
      - SUPABASE_URL=${SUPABASE_URL}
      - SUPABASE_SERVICE_KEY=${SUPABASE_SERVICE_KEY}
      - DEEPSEEK_API_KEY=${DEEPSEEK_API_KEY}
      - BRAVE_API_KEY=${BRAVE_API_KEY}
      - REDIS_URL=redis://redis:6379
    ports:
      - "8080:8080"
    depends_on:
      - redis
    restart: unless-stopped
```

### 11.2 常用命令

```bash
# Mac Mini 终端
cd ~/crabbit-agent
docker compose up -d              # 启动所有服务
docker compose logs -f agent      # 查看 Agent 日志
docker compose restart agent      # 重启 Agent（代码更新后）
docker compose down               # 停止所有服务
```

### 11.3 环境变量

```bash
# agent/.env
SUPABASE_URL=https://krvztfxtybxnlqauefhz.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGciOi...      # service_role key（服务端用，绕过 RLS）
DEEPSEEK_API_KEY=sk-...
BRAVE_API_KEY=BSA-...                   # 可选，联网搜索用
REDIS_URL=redis://redis:6379
AGENT_LOG_LEVEL=INFO
```

### 11.4 备选方案：裸进程部署

如果不想用 Docker，可以用 pm2 管理：

```bash
# 安装依赖
pip install -r requirements.txt

# 用 pm2 管理（需先装 Node.js + pm2）
pm2 start "uvicorn src.main:app --host 0.0.0.0 --port 8080" --name crabbit-agent
pm2 save
pm2 startup  # 开机自启
```

---

## 十二、分阶段实施路线

| 阶段 | 版本 | 内容 | 预估周期 |
|------|------|------|----------|
| **Phase 0** | v2.3 | 基础设施：Supabase schema 扩展（5 张 agent 表 + QQ 绑定表）、PWA 绑定 QQ 页面 | 1 周 |
| **Phase 1** | v3.0 | 核心链路：QQ 消息接收 → 意图识别 → 本地工具执行（打卡/记账/待办）→ 回复 → PWA 渲染 | 3-4 周 |
| **Phase 2** | v3.1 | 联网搜索/爬虫 + 定时推送（早报/周报/待办到期提醒） | 2-3 周 |
| **Phase 3** | v3.2 | 智能主动推送引擎（习惯识别、消费预警、旅行提醒） | 2-3 周 |
| **Phase 4** | v3.3 | 多轮对话记忆 + 上下文感知（"上次那个30块的再记一笔"） | 2 周 |
| **Phase 5** | v4.0 | 多通道扩展（Telegram/钉钉/飞书）、PWA 内嵌对话窗口、macOS 菜单栏 App | 按需 |

### Phase 0 详细任务（v2.3）

- [ ] 在 `supabase/schema.sql` 追加 5 张 agent 表 + RLS
- [ ] PWA 用户面板新增「绑定 QQ」入口
- [ ] 生成/展示绑定码 UI
- [ ] 后端绑定接口（Supabase RPC 或 Edge Function）
- [ ] Mac Mini 搭建 Docker 环境，拉取 NapCat 镜像测试

### Phase 1 详细任务（v3.0）

- [ ] FastAPI 项目骨架搭建（config / models / db client）
- [ ] `/ws/qq` WebSocket handler 开发（OneBot v11 协议适配）
- [ ] Tool Registry 装饰器系统 + 3 个本地工具（checkin / todo / bookkeeping）
- [ ] Intent Router 两级路由实现（关键词 + LLM Function Call）
- [ ] System Prompt 模板编写与调优
- [ ] Reply Generator（工具结果 → 拟人回复）
- [ ] QQ 绑定/解绑完整流程
- [ ] 端到端测试：QQ 发消息 → 数据入 Supabase → PWA 正确显示

---

## 十三、关键风险 & 缓解措施

| 风险 | 影响 | 概率 | 缓解方案 |
|------|------|------|----------|
| QQ 协议被封禁 | 无法收发消息 | 中 | NapCat 活跃社区持续跟进协议更新；预留 Telegram 备选通道 |
| LLM 意图误判 | 记错账/建错待办 | 中 | 涉及资金操作增加确认；置信度 < 0.7 时追问澄清 |
| Mac Mini 断电/断网 | 服务中断 | 低 | Docker restart: unless-stopped；关键定时任务状态写 Supabase |
| LLM API 成本超预期 | 月费过高 | 低 | 两级路由（50%+ 走本地关键词）；DeepSeek 极低单价（¥0.001/千 token） |
| 用户隐私泄露 | 消息经过 LLM | 中 | 敏感信息正则过滤；可切换本地 Ollama 模型（Mac Mini 可跑 7B 模型） |
| QQ 账号风控 | 被限制登录 | 低 | NapCat 内置心跳 + 行为模拟；小号中转方案 |

---

## 十四、关于 OpenClaw 的判断

不推荐 OpenClaw 作为主框架，原因：

1. **社区生态太小** — 遇到问题只能看源码，QQ 适配需要从零写
2. **LangChain 的工具注册 / Agent / Memory 抽象更成熟** — 需要的 Function Call + Tool Registry + Conversation Memory 都是 LangChain 一等公民
3. **实际上用 FastAPI + LangChain 约 500 行 Python 就能跑通核心链路** — 不需要"大而全"的框架

如果确实偏好轻量方案，替代路径是 **纯 OpenAI Function Call SDK + FastAPI** 手写 Agent 循环，约 300 行，比 LangChain 更透明，但需自己处理对话记忆和重试逻辑。
