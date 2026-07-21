"""消息日志系统 — 全量记录 + needs_review 标记"""

from datetime import datetime
from src.db.pocketbase import pb_create, pb_get_list
from src.config import settings


def _should_flag(log_entry: dict) -> tuple[bool, str]:
    """判断是否需要人工复盘"""
    # 1. 工具执行失败
    if log_entry.get("tool_executed") and not log_entry.get("tool_success"):
        return True, f"tool_failed: {log_entry.get('tool_error', 'unknown')}"

    # 2. LLM 置信度低但仍执行了
    if log_entry.get("llm_intent_called") and log_entry.get("llm_confidence", 0) < 0.7:
        return True, f"low_llm_confidence: {log_entry.get('llm_confidence', 0)}"

    # 3. 正则和 LLM 意图不一致
    if log_entry.get("regex_matched") and log_entry.get("llm_intent_called"):
        if log_entry.get("regex_intent") != log_entry.get("llm_intent"):
            return True, f"regex_llm_disagree: regex={log_entry.get('regex_intent')} vs llm={log_entry.get('llm_intent')}"

    # 4. 需要追问澄清
    if log_entry.get("final_intent") == "clarification_needed":
        return True, f"clarification_needed: {log_entry.get('regex_concern', 'llm_uncertain')}"

    # 5. 完全无匹配（滑到闲聊，但可能其实是操作）
    if log_entry.get("final_intent") == "casual_chat" and not log_entry.get("regex_matched"):
        return True, "no_match_fallback_to_chat"

    return False, ""


async def save_message_log(
    user_id: str,
    qq_id: str,
    direction: str,
    raw_text: str,
    log_data: dict,
    reply_text: str,
    latency_ms: int,
    reply_tokens: int = 0,
    intent_tokens: int = 0,
    clarification_of: str = "",
) -> dict:
    """保存消息日志并标记是否需要复盘"""

    needs_review, review_reason = _should_flag(log_data)

    record = await pb_create(settings.col_agent_message_logs, {
        "user_id": user_id,
        "qq_id": qq_id,
        "direction": direction,
        "raw_text": raw_text,
        "regex_matched": log_data.get("regex_matched", False),
        "regex_intent": log_data.get("regex_intent", ""),
        "regex_params": log_data.get("regex_params", {}),
        "regex_confidence": log_data.get("regex_confidence", 0),
        "regex_concern": log_data.get("regex_concern", ""),
        "llm_intent_called": log_data.get("llm_intent_called", False),
        "llm_intent": log_data.get("llm_intent", ""),
        "llm_params": log_data.get("llm_params", {}),
        "llm_confidence": log_data.get("llm_confidence", 0),
        "final_intent": log_data.get("final_intent", ""),
        "final_params": log_data.get("final_params", {}),
        "tool_executed": log_data.get("tool_executed", False),
        "tool_success": log_data.get("tool_success", False),
        "tool_result": log_data.get("tool_result", {}),
        "tool_error": log_data.get("tool_error", ""),
        "reply_text": reply_text,
        "reply_tokens": reply_tokens,
        "intent_tokens": intent_tokens,
        "total_latency_ms": latency_ms,
        "clarification_of": clarification_of,
        "needs_review": needs_review,
        "review_reason": review_reason,
        "review_status": "pending" if needs_review else "",
        "created_at": datetime.now().isoformat(),
    })

    return {"log_id": record.get("id"), "needs_review": needs_review, "review_reason": review_reason}


async def get_pending_reviews() -> list[dict]:
    """获取所有待复盘的记录"""
    records = await pb_get_list(
        settings.col_agent_message_logs,
        'needs_review=true && review_status="pending"',
        sort="-created_at",
    )
    return records


async def mark_reviewed(log_id: str, status: str = "reviewed", notes: str = "") -> None:
    """标记日志为已复盘"""
    from src.db.pocketbase import pb_update
    await pb_update(settings.col_agent_message_logs, log_id, {
        "review_status": status,
        "review_notes": notes,
    })
