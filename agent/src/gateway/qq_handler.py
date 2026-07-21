"""QQ 消息网关 — OneBot v11 WebSocket 协议适配

OneBot v11 事件格式:
  {"post_type":"message","message_type":"private","user_id":123456,"message":"午饭花了35"}

发送消息 API:
  {"action":"send_msg","params":{"user_id":123456,"message":"回复内容"}}
"""

import json
from fastapi import WebSocket, WebSocketDisconnect
from src.engine.router import route_message
from src.logger import save_message_log
from src.memory.conversation import (
    save_clarification_context,
    get_clarification_context,
    delete_clarification_context,
    get_user_persona,
)
from src.db.pocketbase import pb_get_list, pb_get_one
from src.config import settings
import time


class QQGateway:
    """管理 NapCatQQ WebSocket 连接"""

    def __init__(self):
        self._ws = None

    async def connect(self, ws: WebSocket):
        self._ws = ws

    async def handle_message(self, event: dict) -> str | None:
        """处理一条 OneBot 消息，返回要发送的回复"""
        if event.get("post_type") != "message":
            return None

        msg_type = event.get("message_type", "private")
        qq_id = str(event.get("user_id", ""))
        raw_text = event.get("message", "").strip()

        if not qq_id or not raw_text:
            return None

        # 1. QQ号 → PocketBase user_id
        binding = await pb_get_one(
            settings.col_user_qq_bindings,
            f'qq_id="{qq_id}"',
        )
        if not binding:
            return "请先在 Crabbit! App 中绑定 QQ。绑定码获取方式：App → 头像 → 绑定QQ"

        user_id = binding.get("user_id", "")

        # 2. 检查是否是追问回复（简单的 A/B 选项回复）
        clarification = await get_clarification_context(qq_id)
        if clarification:
            # 用户回复了选项 → 执行原始意图
            await delete_clarification_context(qq_id)
            # 这里简化处理：如果用户回复了选项，在消息前加上上下文
            raw_text = f"[追问回复: {clarification.get('intent')}] {raw_text}"

        # 3. 读取用户人设
        persona_id = await get_user_persona(user_id)

        # 4. 路由 + 执行
        start_ms = int(time.time() * 1000)
        route_result = await route_message(raw_text, user_id)
        elapsed = int(time.time() * 1000) - start_ms

        # 5. 如果需要追问，保存上下文
        if route_result.get("source") == "clarification":
            await save_clarification_context(qq_id, {
                "intent": route_result.get("intent"),
                "params": route_result.get("params"),
            })

        # 6. 保存日志
        await save_message_log(
            user_id=user_id,
            qq_id=qq_id,
            direction="inbound",
            raw_text=raw_text,
            log_data=route_result.get("log_data", {}),
            reply_text=route_result.get("reply_text", ""),
            latency_ms=elapsed,
        )

        return route_result.get("reply_text", "")

    async def send_reply(self, qq_id: str, text: str):
        """通过 NapCat 发送回复"""
        if not self._ws:
            return

        # OneBot v11 send_msg API
        payload = {
            "action": "send_private_msg",
            "params": {
                "user_id": int(qq_id),
                "message": text,
            },
        }
        await self._ws.send_text(json.dumps(payload))


qq_gateway = QQGateway()
