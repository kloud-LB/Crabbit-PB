"""两级意图路由 — 关键词正则 + LLM Function Call"""

import re
from typing import Any
from src.engine.llm_client import llm_intent
from src.engine.synonyms import map_category


# ================================================================
# Level 1: 正则匹配器
# ================================================================

class RegexMatcher:
    """第一级路由：本地正则匹配，0延迟，0token"""

    @staticmethod
    def match(raw_text: str) -> dict[str, Any] | None:
        """
        尝试正则匹配。

        返回: None（未匹配）或 {
            "intent": "record_expense",
            "params": {...},
            "confidence": 0.95,
            "concern": ""  # 如果为空则无顾虑
        }
        """
        text = raw_text.strip()

        # ---- 显式命令前缀 ----
        result = RegexMatcher._match_prefix(text)
        if result:
            return result

        # ---- 搜索前缀 ----
        result = RegexMatcher._match_search(text)
        if result:
            return result

        # ---- 记账：花了/买了 系列（高置信度） ----
        result = RegexMatcher._match_expense_high(text)
        if result:
            return result

        # ---- 记账：收入 系列 ----
        result = RegexMatcher._match_income(text)
        if result:
            return result

        # ---- 记账：[类别] [金额] 简洁系列（中置信度） ----
        result = RegexMatcher._match_expense_medium(text)
        if result:
            return result

        # ---- 待办：提醒我 / 别忘了 系列 ----
        result = RegexMatcher._match_todo(text)
        if result:
            return result

        # ---- 打卡：/打卡 或 完成了 系列 ----
        result = RegexMatcher._match_checkin(text)
        if result:
            return result

        # ---- 查询：花了多少 / 统计 系列 ----
        result = RegexMatcher._match_query(text)
        if result:
            return result

        # ---- 金额前置 ----
        result = RegexMatcher._match_amount_first(text)
        if result:
            return result

        return None

    @staticmethod
    def _match_prefix(text: str) -> dict | None:
        """显式命令前缀"""
        prefixes = [
            (r'^/打卡\s*(.+?)\s*$', "record_checkin", 0.98),
            (r'^/checkin\s*(.+?)\s*$', "record_checkin", 0.98),
            (r'^/账\s*(收入\s+)?(.+?)\s+([\d.]+)\s*$', None, 0.98),  # 特殊处理
            (r'^/记账\s*(收入\s+)?(.+?)\s+([\d.]+)\s*$', None, 0.98),
            (r'^/待办\s*(.+?)\s*$', "create_todo", 0.98),
            (r'^/todo\s*(.+?)\s*$', "create_todo", 0.98),
            (r'^/提醒\s*(.+?)\s*$', "create_todo", 0.98),
            (r'^/查\s*(.+)', "query_or_search", 0.9),
            (r'^/睡\s*(.+?)\s+(.+?)$', "record_sleep", 0.98),
            (r'^/体重\s*([\d.]+)\s*$', "record_body_measurement", 0.98),
        ]

        for pattern, intent, conf in prefixes:
            m = re.match(pattern, text)
            if not m:
                continue

            if intent == "record_checkin":
                return {
                    "intent": "record_checkin",
                    "params": {"task_name": m.group(1).strip(), "count": 1},
                    "confidence": conf,
                }

            if intent is None:  # /账 /记账
                groups = m.groups()
                is_income = groups[0] and "收入" in (groups[0] or "")
                cat_or_title = (groups[1] or "").strip()
                amount_str = (groups[2] or "").strip()
                try:
                    amount = float(amount_str)
                except ValueError:
                    amount = 0

                intent_name = "record_income" if is_income else "record_expense"
                cat, _ = map_category(cat_or_title)
                return {
                    "intent": intent_name,
                    "params": {
                        "amount": amount,
                        "category": cat or cat_or_title,
                    },
                    "confidence": conf,
                }

            if intent == "create_todo":
                return {
                    "intent": "create_todo",
                    "params": {"title": m.group(1).strip()},
                    "confidence": conf,
                }

            if intent == "query_or_search":
                query_text = m.group(1).strip()
                # 判断查自己数据还是外部搜索
                if any(kw in query_text for kw in ["消费", "花了", "支出", "收入", "待办", "打卡", "统计", "账单", "记账"]):
                    return {
                        "intent": "query_expense_stats",
                        "params": {"period": RegexMatcher._extract_period(query_text)},
                        "confidence": 0.85,
                    }
                else:
                    return {
                        "intent": "web_search",
                        "params": {"query": query_text},
                        "confidence": 0.9,
                    }

            if intent == "record_sleep":
                return {
                    "intent": "record_sleep",
                    "params": {"sleep_time": m.group(1), "wake_time": m.group(2)},
                    "confidence": conf,
                }

            if intent == "record_body_measurement":
                return {
                    "intent": "record_body_measurement",
                    "params": {"measure_type": "weight", "value": float(m.group(1))},
                    "confidence": conf,
                }

        return None

    @staticmethod
    def _match_search(text: str) -> dict | None:
        """/搜 前缀 或 搜索一下 关键词"""
        m = re.match(r'^/搜\s*(.+)', text)
        if not m:
            m = re.match(r'^/search\s*(.+)', text)
        if m:
            return {
                "intent": "web_search",
                "params": {"query": m.group(1).strip()},
                "confidence": 0.98,
            }

        m = re.match(r'(?:搜索|搜一下|搜一搜|帮我查|查一下|帮我搜)\s*(.+)', text)
        if m:
            query = m.group(1).strip()
            # 避免误匹配"查一下消费"
            if any(kw in query for kw in ["消费", "花了", "支出", "收入", "待办", "打卡"]):
                return None  # 是查自己数据
            return {
                "intent": "web_search",
                "params": {"query": query},
                "confidence": 0.85,
            }

        return None

    @staticmethod
    def _match_expense_high(text: str) -> dict | None:
        """花了/买了/用了/付了 + 金额 → 高置信度记账"""
        # 排除模式
        if re.search(r'(?:每天|每月|每周|大概|左右|差不多|估计|可能)', text):
            return None

        # "午饭花了35" / "打车花了50块"
        m = re.match(r'(.+?)(?:花了|消费了?|买了|用了|付了|支付了?)\s*([\d.]+)\s*(?:块|元|块钱|元钱)?[。！]?$', text)
        if m:
            cat_text = m.group(1).strip()
            amount = float(m.group(2))
            cat, _ = map_category(cat_text)
            return {
                "intent": "record_expense",
                "params": {"amount": amount, "category": cat or cat_text},
                "confidence": 0.95,
            }

        return None

    @staticmethod
    def _match_income(text: str) -> dict | None:
        """收入关键词"""
        m = re.match(
            r'(?:收入|到账|工资|奖金|退款|收到|进账|卖了?)\s*(.+?)?\s*([\d.]+)\s*(?:块|元|块钱|元钱)?[。！]?$',
            text,
        )
        if m:
            cat_text = (m.group(1) or "其他").strip()
            amount = float(m.group(2))
            cat, _ = map_category(cat_text)
            return {
                "intent": "record_income",
                "params": {"amount": amount, "category": cat or cat_text},
                "confidence": 0.9,
            }

        return None

    @staticmethod
    def _match_expense_medium(text: str) -> dict | None:
        """[类别] [数字][块/元] → 中置信度记账"""
        if re.search(r'(?:每天|每月|每周|大概|左右|差不多|估计|可能)', text):
            return None

        # 排除时间词开头（"明天下午3点开会" 不应匹配为记账）
        if re.match(r'^(?:今天|明天|后天|下周|下个|这周|这个|提醒|别忘了|记得|待办)', text):
            return None

        m = re.match(r'^(.{1,15}?)\s+([\d.]+)\s*(?:块|元|块钱|元钱)?[。！]?$', text)
        if m:
            cat_text = m.group(1).strip()
            # 额外检查：类别不能全是数字或标点
            if re.match(r'^[\d\s\W]+$', cat_text):
                return None

            amount = float(m.group(2))
            cat, _ = map_category(cat_text)

            # 如果映射成功，confidence 更高
            conf = 0.85 if cat else 0.55

            return {
                "intent": "record_expense",
                "params": {"amount": amount, "category": cat or cat_text},
                "confidence": conf,
                "concern": "" if cat else f"无法确定'{cat_text}'对应哪个标准类别",
            }

        return None

    @staticmethod
    def _match_todo(text: str) -> dict | None:
        """待办创建"""
        # "提醒我明天下午3点开会"
        m = re.match(r'提醒我\s*(.+)', text)
        if m:
            return {
                "intent": "create_todo",
                "params": {"title": m.group(1).strip()},
                "confidence": 0.9,
            }

        # "别忘了周五交报告"
        m = re.match(r'(?:别忘了|记得|要记得)\s*(.+)', text)
        if m:
            return {
                "intent": "create_todo",
                "params": {"title": m.group(1).strip()},
                "confidence": 0.9,
            }

        return None

    @staticmethod
    def _match_checkin(text: str) -> dict | None:
        """打卡"""
        # "打卡" 在消息中
        m = re.match(r'(.+?)(?:打卡|已打卡|完成打卡)\s*(?:完成|成功|失败)?[。！]?$', text)
        if m:
            return {
                "intent": "record_checkin",
                "params": {"task_name": m.group(1).strip(), "count": 1},
                "confidence": 0.9,
            }

        # "做了50个俯卧撑" / "完成了跑步"
        m = re.match(r'(?:做了|完成了?|搞定了?|练了?)\s*(\d+)?\s*(?:个|次|组|分钟)?\s*(.+?)[。！]?$', text)
        if m:
            count = int(m.group(1)) if m.group(1) else 1
            task = (m.group(2) or "").strip()
            return {
                "intent": "record_checkin",
                "params": {"task_name": task, "count": count},
                "confidence": 0.8,
            }

        # "50个俯卧撑"（无动词）
        m = re.match(r'^(\d+)\s*(?:个|次|组)\s*(.+?)[。！]?$', text)
        if m:
            count = int(m.group(1))
            task = m.group(2).strip()
            # 只有看起来像运动/打卡任务的才匹配
            exercise_words = ["俯卧撑", "仰卧起坐", "深蹲", "跳绳", "引体向上", "跑步", "游泳",
                             "冥想", "阅读", "背单词", "喝水", "吃药"]
            if any(ew in task for ew in exercise_words):
                return {
                    "intent": "record_checkin",
                    "params": {"task_name": task, "count": count},
                    "confidence": 0.75,
                }

        return None

    @staticmethod
    def _match_query(text: str) -> dict | None:
        """查询统计"""
        period = RegexMatcher._extract_period(text)

        # 花了多少/花了多少钱
        if re.search(r'花[了多]少', text) or "花了多少" in text:
            return {
                "intent": "query_expense_stats",
                "params": {"period": period},
                "confidence": 0.9,
            }

        # 统计/报告/汇总
        if any(kw in text for kw in ["统计", "报告", "汇总", "账单", "待办列表", "打卡情况"]):
            if any(kw in text for kw in ["消费", "花了", "支出", "收入", "记账", "账单"]):
                return {
                    "intent": "query_expense_stats",
                    "params": {"period": period},
                    "confidence": 0.85,
                }
            if any(kw in text for kw in ["待办", "任务"]):
                return {
                    "intent": "query_todo_list",
                    "params": {"status": "pending"},
                    "confidence": 0.85,
                }
            if any(kw in text for kw in ["打卡"]):
                return {
                    "intent": "query_checkin_stats",
                    "params": {},
                    "confidence": 0.85,
                }

        return None

    @staticmethod
    def _match_amount_first(text: str) -> dict | None:
        """"35块的午饭" / "18块买了咖啡" → 金额在前"""
        m = re.match(r'([\d.]+)\s*(?:块|元|块钱?)(?:的)?\s*(.+)', text)
        if m:
            amount = float(m.group(1))
            cat_text = m.group(2).strip()
            cat, _ = map_category(cat_text)
            return {
                "intent": "record_expense",
                "params": {"amount": amount, "category": cat or cat_text},
                "confidence": 0.7,
            }
        return None

    @staticmethod
    def _extract_period(text: str) -> str:
        """从文本中提取时间周期"""
        if any(w in text for w in ["本周", "这周", "这个星期"]):
            return "this_week"
        if any(w in text for w in ["上周", "上个星期"]):
            return "last_week"
        if any(w in text for w in ["本月", "这个月", "这月"]):
            return "this_month"
        if any(w in text for w in ["上月", "上个月"]):
            return "last_month"
        if any(w in text for w in ["今年", "这一年"]):
            return "this_year"
        return "this_month"


# ================================================================
# Level 2: 主路由
# ================================================================


def _needs_clarification(regex_result: dict | None) -> bool:
    """判断是否需要追问（而非直接执行或丢 LLM）"""
    if not regex_result:
        return False

    # 中置信度 + 有关注点 → 追问
    if 0.5 <= regex_result.get("confidence", 0) < 0.6:
        if regex_result.get("concern"):
            return True

    return False


async def route_message(
    raw_text: str,
    user_id: str,
) -> dict:
    """
    两级路由：正则 → 工具执行 / 追问 / LLM

    返回:
        {
            "source": "regex" | "llm" | "clarification",
            "intent": "record_expense",
            "params": {...},
            "confidence": 0.95,
            "reply_text": "...",
            "log_data": {...}  # 用于写入 agent_message_logs
        }
    """
    from src.tools.registry import ToolRegistry
    from src.engine.llm_client import llm_reply

    log = {
        "regex_matched": False,
        "regex_intent": "",
        "regex_params": {},
        "regex_confidence": 0,
        "regex_concern": "",
        "llm_intent_called": False,
        "llm_intent": "",
        "llm_params": {},
        "llm_confidence": 0,
        "final_intent": "",
        "final_params": {},
        "tool_executed": False,
        "tool_success": False,
        "tool_result": {},
        "tool_error": "",
    }

    # ===== Step 1: 正则匹配 =====
    regex_result = RegexMatcher.match(raw_text)

    if regex_result:
        log["regex_matched"] = True
        log["regex_intent"] = regex_result["intent"]
        log["regex_params"] = regex_result.get("params", {})
        log["regex_confidence"] = regex_result.get("confidence", 0)
        log["regex_concern"] = regex_result.get("concern", "")

        # 需要追问？
        if _needs_clarification(regex_result):
            log["final_intent"] = "clarification_needed"
            log["final_params"] = regex_result.get("params", {})

            reply = await llm_reply(
                persona_id="crab_boss",
                tool_intent=regex_result["intent"],
                tool_params=regex_result.get("params", {}),
                tool_result={"success": False, "error": regex_result.get("concern", "消息歧义")},
                is_clarification=True,
            )

            return {
                "source": "clarification",
                "intent": regex_result["intent"],
                "params": regex_result.get("params", {}),
                "confidence": regex_result.get("confidence", 0),
                "reply_text": reply,
                "log_data": log,
            }

        # 高置信度 → 直接执行
        if regex_result.get("confidence", 0) >= 0.85:
            log["final_intent"] = regex_result["intent"]
            log["final_params"] = regex_result.get("params", {})

            result = await ToolRegistry.execute(
                regex_result["intent"],
                user_id=user_id,
                **regex_result.get("params", {}),
            )

            log["tool_executed"] = True
            log["tool_success"] = result.get("success", True)
            log["tool_result"] = {k: v for k, v in result.items() if k != "success"}

            if not result.get("success"):
                log["tool_error"] = result.get("error", "")

            reply = await llm_reply(
                persona_id="crab_boss",
                tool_intent=regex_result["intent"],
                tool_params=regex_result.get("params", {}),
                tool_result=result,
            )

            return {
                "source": "regex",
                "intent": regex_result["intent"],
                "params": regex_result.get("params", {}),
                "confidence": regex_result.get("confidence", 0),
                "reply_text": reply,
                "log_data": log,
            }

        # 中置信度 → 丢给 LLM 补充，带 hints
        hints = {
            "likely_intent": regex_result["intent"],
            "extracted": regex_result.get("params", {}),
            "concern": regex_result.get("concern", ""),
            "confidence": regex_result.get("confidence", 0),
        }
    else:
        hints = None

    # ===== Step 2: LLM Function Calling =====
    log["llm_intent_called"] = True

    llm_result = await llm_intent(raw_text, hints)
    log["llm_intent"] = llm_result["intent"]
    log["llm_params"] = llm_result.get("params", {})
    log["llm_confidence"] = llm_result.get("confidence", 0)

    # LLM 需要追问？
    if llm_result["intent"] == "clarification_needed":
        log["final_intent"] = "clarification_needed"

        reply = await llm_reply(
            persona_id="crab_boss",
            tool_intent=llm_result.get("params", {}).get("likely_intent", ""),
            tool_params=llm_result.get("params", {}),
            tool_result={"success": False, "error": "LLM判断需要澄清"},
            is_clarification=True,
        )

        return {
            "source": "llm",
            "intent": "clarification_needed",
            "params": llm_result.get("params", {}),
            "confidence": llm_result.get("confidence", 0),
            "reply_text": reply,
            "log_data": log,
        }

    # LLM 闲聊？
    if llm_result["intent"] == "casual_chat":
        log["final_intent"] = "casual_chat"

        reply = llm_result.get("params", {}).get("reply", "") or await llm_reply(
            persona_id="crab_boss",
            tool_intent="casual_chat",
            tool_params={},
            tool_result={"success": True},
        )

        return {
            "source": "llm",
            "intent": "casual_chat",
            "params": {},
            "confidence": llm_result.get("confidence", 0),
            "reply_text": reply,
            "log_data": log,
        }

    # LLM 置信度低 → 追问
    if llm_result.get("confidence", 0) < 0.7:
        log["final_intent"] = "clarification_needed"

        reply = await llm_reply(
            persona_id="crab_boss",
            tool_intent=llm_result["intent"],
            tool_params=llm_result.get("params", {}),
            tool_result={"success": False, "error": f"LLM置信度过低({llm_result.get('confidence', 0)})"},
            is_clarification=True,
        )

        return {
            "source": "llm",
            "intent": "clarification_needed",
            "params": llm_result.get("params", {}),
            "confidence": llm_result.get("confidence", 0),
            "reply_text": reply,
            "log_data": log,
        }

    # LLM 置信度够 → 执行工具
    log["final_intent"] = llm_result["intent"]
    log["final_params"] = llm_result.get("params", {})

    result = await ToolRegistry.execute(
        llm_result["intent"],
        user_id=user_id,
        **llm_result.get("params", {}),
    )

    log["tool_executed"] = True
    log["tool_success"] = result.get("success", True)
    log["tool_result"] = {k: v for k, v in result.items() if k != "success"}

    if not result.get("success"):
        log["tool_error"] = result.get("error", "")

    reply = await llm_reply(
        persona_id="crab_boss",
        tool_intent=llm_result["intent"],
        tool_params=llm_result.get("params", {}),
        tool_result=result,
    )

    return {
        "source": "llm",
        "intent": llm_result["intent"],
        "params": llm_result.get("params", {}),
        "confidence": llm_result.get("confidence", 0),
        "reply_text": reply,
        "log_data": log,
    }
