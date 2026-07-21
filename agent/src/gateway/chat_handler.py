"""PWA 内嵌对话窗口 — WebSocket Handler

PWA 通过 WebSocket 连接 Agent，实现：
- 用户手动输入消息 → Agent 处理 → 回复
- 用户切换人设
- 查看日志审查
"""

import json
from fastapi import WebSocket, WebSocketDisconnect
from src.engine.router import route_message
from src.logger import save_message_log
from src.memory.conversation import get_user_persona
from src.reply.personas import list_personas
from src.db.pocketbase import pb_get_list
from src.config import settings
import time


class ChatManager:
    """管理 PWA 聊天 WebSocket 连接"""

    def __init__(self):
        self._connections: dict[str, WebSocket] = {}  # user_id → ws

    async def connect(self, user_id: str, ws: WebSocket):
        self._connections[user_id] = ws

    async def disconnect(self, user_id: str):
        self._connections.pop(user_id, None)

    async def handle_message(self, user_id: str, message: dict) -> dict:
        """处理来自 PWA 的消息

        message 格式:
          {"type": "chat", "text": "午饭花了35"}
          {"type": "set_persona", "persona_id": "cat_master"}
          {"type": "get_personas"}
          {"type": "get_review_logs"}

        返回:
          {"type": "reply", ...} 或 {"type": "personas", ...} 等
        """
        msg_type = message.get("type", "chat")

        if msg_type == "chat":
            raw_text = message.get("text", "").strip()
            if not raw_text:
                return {"type": "reply", "text": "请输入内容"}

            start_ms = int(time.time() * 1000)
            route_result = await route_message(raw_text, user_id)
            elapsed = int(time.time() * 1000) - start_ms

            # 保存日志
            await save_message_log(
                user_id=user_id,
                qq_id="",
                direction="inbound",
                raw_text=raw_text,
                log_data=route_result.get("log_data", {}),
                reply_text=route_result.get("reply_text", ""),
                latency_ms=elapsed,
            )

            return {
                "type": "reply",
                "text": route_result.get("reply_text", ""),
                "intent": route_result.get("intent", ""),
                "source": route_result.get("source", ""),
                "latency_ms": elapsed,
            }

        elif msg_type == "get_personas":
            return {
                "type": "personas",
                "personas": list_personas(),
                "current": await get_user_persona(user_id),
            }

        elif msg_type == "set_persona":
            persona_id = message.get("persona_id", "crab_boss")
            from src.engine.llm_client import llm_reply
            # 保存到 user_context
            from src.db.pocketbase import pb_upsert
            await pb_upsert(
                settings.col_agent_user_context,
                {
                    "user_id": user_id,
                    "preferences": {"reply_persona": persona_id},
                    "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                },
                f'user_id="{user_id}"',
            )
            return {
                "type": "persona_set",
                "persona_id": persona_id,
                "text": f"人设已切换 ✨",
            }

        elif msg_type == "get_review_logs":
            try:
                records = await pb_get_list(
                    settings.col_agent_message_logs,
                    f'user_id="{user_id}" && needs_review=true && review_status="pending"',
                    sort="-created_at",
                )
                return {
                    "type": "review_logs",
                    "logs": [
                        {
                            "id": r.get("id"),
                            "raw_text": r.get("raw_text"),
                            "final_intent": r.get("final_intent"),
                            "review_reason": r.get("review_reason"),
                            "reply_text": r.get("reply_text"),
                            "created_at": r.get("created_at"),
                        }
                        for r in (records or [])
                    ],
                }
            except Exception:
                return {"type": "review_logs", "logs": []}

        return {"type": "reply", "text": "未知命令"}


chat_manager = ChatManager()
