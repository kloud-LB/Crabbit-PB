"""Crabbit! V3 Agent — FastAPI 入口

启动:
  uvicorn src.main:app --host 0.0.0.0 --port 8080

端点:
  /ws/qq        — NapCatQQ OneBot v11 WebSocket
  /ws/chat      — PWA 内嵌对话窗口 WebSocket
  /health       — 健康检查
  /api/personas — 人设列表
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
import json
import logging

from src.config import settings
from src.gateway.qq_handler import qq_gateway
from src.gateway.chat_handler import chat_manager
from src.db.pocketbase import pb_admin_auth

# ================================================================
# 初始化
# ================================================================

logging.basicConfig(
    level=getattr(logging, settings.agent_log_level.upper(), logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("crabbit-agent")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """启动时初始化，关闭时清理"""
    logger.info("🚀 Crabbit! V3 Agent starting...")

    # 预认证 PocketBase admin
    try:
        await pb_admin_auth()
        logger.info("✅ PocketBase admin authenticated")
    except Exception as e:
        logger.error(f"❌ PocketBase admin auth failed: {e}")
        logger.error("   Please check PB_ADMIN_EMAIL and PB_ADMIN_PASSWORD")

    logger.info(f"📡 QQ Gateway: ws://0.0.0.0:8080/ws/qq")
    logger.info(f"💬 Chat Gateway: ws://0.0.0.0:8080/ws/chat")
    logger.info(f"🤖 LLM: {settings.deepseek_model} @ {settings.deepseek_base_url}")

    yield

    logger.info("👋 Crabbit! V3 Agent shutting down...")


app = FastAPI(
    title="Crabbit! V3 Agent",
    version="3.0.0",
    lifespan=lifespan,
)


# ================================================================
# REST 端点
# ================================================================

@app.get("/health")
async def health():
    return {"status": "ok", "version": "3.0.0"}


@app.get("/api/personas")
async def get_personas():
    from src.reply.personas import list_personas
    return {"personas": list_personas()}


# ================================================================
# WebSocket: NapCatQQ OneBot v11
# ================================================================

@app.websocket("/ws/qq")
async def ws_qq(websocket: WebSocket):
    """NapCatQQ 反向 WebSocket 连接"""
    await websocket.accept()
    await qq_gateway.connect(websocket)
    logger.info("🔗 NapCatQQ connected")

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                event = json.loads(raw)
            except json.JSONDecodeError:
                continue

            # 处理消息
            reply = await qq_gateway.handle_message(event)
            if reply:
                qq_id = str(event.get("user_id", ""))
                await qq_gateway.send_reply(qq_id, reply)

    except WebSocketDisconnect:
        logger.info("🔌 NapCatQQ disconnected")
    except Exception as e:
        logger.error(f"QQ WS error: {e}")


# ================================================================
# WebSocket: PWA 内嵌对话窗口
# ================================================================

@app.websocket("/ws/chat")
async def ws_chat(websocket: WebSocket):
    """PWA 聊天窗口 WebSocket

    连接时需要传 user_id 参数: ws://host:8080/ws/chat?user_id=xxx
    """
    user_id = websocket.query_params.get("user_id", "")
    if not user_id:
        await websocket.close(code=4001, reason="Missing user_id")
        return

    await websocket.accept()
    await chat_manager.connect(user_id, websocket)
    logger.info(f"💬 Chat connected: user={user_id[:8]}...")

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                message = json.loads(raw)
            except json.JSONDecodeError:
                await websocket.send_json({"type": "error", "text": "Invalid JSON"})
                continue

            # 处理消息
            response = await chat_manager.handle_message(user_id, message)
            await websocket.send_json(response)

    except WebSocketDisconnect:
        await chat_manager.disconnect(user_id)
        logger.info(f"💬 Chat disconnected: user={user_id[:8]}...")
    except Exception as e:
        logger.error(f"Chat WS error: {e}")
        await chat_manager.disconnect(user_id)
