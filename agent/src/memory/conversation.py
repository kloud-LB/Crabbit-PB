"""多轮对话上下文管理 — Redis 缓存 + PocketBase 持久化"""

import json
import redis.asyncio as redis
from src.config import settings
from src.db.pocketbase import pb_get_list

_redis_client = None

async def _get_redis():
    global _redis_client
    if _redis_client is None:
        try:
            _redis_client = redis.from_url(settings.redis_url)
        except Exception:
            return None
    return _redis_client


async def save_clarification_context(qq_id: str, context: dict, ttl: int = 30):
    """保存追问上下文（Redis，TTL 30秒）"""
    r = await _get_redis()
    if not r:
        return
    try:
        await r.setex(
            f"clarification:{qq_id}",
            ttl,
            json.dumps(context),
        )
    except Exception:
        pass


async def get_clarification_context(qq_id: str) -> dict | None:
    """获取追问上下文"""
    r = await _get_redis()
    if not r:
        return None
    try:
        data = await r.get(f"clarification:{qq_id}")
        if data:
            return json.loads(data)
    except Exception:
        pass
    return None


async def delete_clarification_context(qq_id: str):
    """删除追问上下文"""
    r = await _get_redis()
    if not r:
        return
    try:
        await r.delete(f"clarification:{qq_id}")
    except Exception:
        pass


async def get_user_persona(user_id: str) -> str:
    """读取用户当前人设"""
    try:
        records = await pb_get_list(
            settings.col_agent_user_context,
            f'user_id="{user_id}"',
        )
        if records:
            prefs = records[0].get("preferences", {})
            if isinstance(prefs, dict):
                return prefs.get("reply_persona", "crab_boss")
    except Exception:
        pass
    return "crab_boss"
