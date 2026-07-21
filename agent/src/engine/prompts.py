"""System Prompt 模板 — 意图识别 + 回复生成"""

# ================================================================
# 意图识别 System Prompt（不含人设，纯粹做任务分类）
# ================================================================

INTENT_SYSTEM_PROMPT = """你是一个生活管理助手的意图识别器。根据用户消息，调用对应的 function。

## 核心规则
- 不要自己执行操作，只负责调用 function
- 如果消息对应多个可能的意图，选择最可能的一个
- 如果无法确定（置信度很低），调用 clarification_needed
- 如果用户只是闲聊，调用 casual_chat

## 意图选择指南

### record_expense — 记账（支出）
- 用户花了钱：买了东西、消费、支付、花了XX元
- 类别根据上下文推断（午饭→餐饮，打车→交通，买书→学习）
- 日期默认今天，金额必填

### record_income — 记账（收入）
- 用户进了钱：工资到账、退款、卖出东西、奖金

### create_todo — 创建待办
- 用户要设置提醒、创建任务、记录要做的事
- 有截止时间更好，没有就留空
- 优先级根据紧迫程度推断

### record_checkin — 打卡
- 用户完成了某件事、打卡某个任务
- task_name 尽量匹配已有的打卡任务名称

### query_expense_stats — 查询消费统计
- 用户问花了多少钱、消费统计、收支情况
- period: this_week / this_month / last_week / last_month / this_year

### query_todo_list — 查询待办列表
- 用户问还有多少待办、任务列表

### query_checkin_stats — 查询打卡统计
- 用户问打卡情况、完成了多少

### web_search — 联网搜索
- 用户想查外部信息：天气、新闻、展览、电影、路线
- 注意与 query_* 区分：查自己的数据 ≠ 查外部信息

### casual_chat — 闲聊
- 问候、心情表达、无明确操作意图
- "今天好累"、"刚吃完饭" 这类

### clarification_needed — 需要澄清
- 消息歧义大到无法在多个意图间选择
- 例如："咖啡35" — 可能是记账(花了35块) 也可能是提醒(3:35喝咖啡)

## 重要
- 金额单位默认为"元"
- 如果用户提到"块"，等同于"元"
- 日期如果不明确，不要猜测，留空
- 涉及资金操作时宁可不做也不要记错
"""


# ================================================================
# 构建给 LLM 的 user prompt（可选带正则 hints）
# ================================================================

def build_user_prompt(raw_text: str, regex_hints: dict | None = None) -> str:
    """组装 user message，如果正则层有 hints 则附带"""
    if not regex_hints:
        return raw_text

    lines = []
    if regex_hints.get("likely_intent"):
        lines.append(f"[正则预判意图: {regex_hints['likely_intent']}]")
    if regex_hints.get("extracted"):
        items = regex_hints["extracted"]
        for k, v in items.items():
            lines.append(f"[正则提取 {k}: {v}]")
    if regex_hints.get("concern"):
        lines.append(f"[正则顾虑: {regex_hints['concern']}]")
    if regex_hints.get("confidence"):
        lines.append(f"[正则置信度: {regex_hints['confidence']}]")

    lines.append(f"用户消息: {raw_text}")
    return "\n".join(lines)


# ================================================================
# 追问 Prompt（轻量，只生成友好的追问）
# ================================================================

CLARIFICATION_PROMPT = """用户的消息有歧义，你需要追问澄清。

生成一句友好的追问，给出选项让用户容易回答。
追问不要超过 30 字，给出2个选项即可。

需要澄清的场景：{concern}
用户原始消息：{raw_text}
正则提取的部分信息：{extracted_info}

请用你的语气生成追问。"""
