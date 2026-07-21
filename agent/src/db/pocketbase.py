"""PocketBase Admin API 封装 — Agent 使用 admin token 绕过 RLS"""

from pocketbase import PocketBase
from src.config import settings

_pb_client = None
_admin_token = None


def _get_pb() -> PocketBase:
    """懒初始化 PocketBase client"""
    global _pb_client
    if _pb_client is None:
        _pb_client = PocketBase(settings.pb_url)
    return _pb_client


async def pb_admin_auth() -> str:
    """使用 admin 账号认证，返回 token。已缓存则复用。"""
    global _admin_token
    if _admin_token:
        return _admin_token

    pb = _get_pb()
    try:
        auth_data = pb.admins.auth_with_password(
            settings.pb_admin_email,
            settings.pb_admin_password,
        )
        _admin_token = auth_data.token
        return _admin_token
    except Exception as e:
        raise RuntimeError(f"PocketBase admin auth failed: {e}")


async def pb_get_list(collection: str, filter_str: str = "", sort: str = "") -> list:
    """查询列表（admin 权限，可跨用户）"""
    await pb_admin_auth()
    pb = _get_pb()
    try:
        result = pb.collection(collection).get_full_list(query_params={
            "filter": filter_str,
            "sort": sort,
        })
        return result
    except Exception as e:
        raise RuntimeError(f"pb_get_list({collection}) failed: {e}")


async def pb_get_one(collection: str, filter_str: str) -> dict | None:
    """查询单条"""
    await pb_admin_auth()
    pb = _get_pb()
    try:
        return pb.collection(collection).get_first_list_item(filter_str)
    except Exception:
        return None


async def pb_create(collection: str, data: dict) -> dict:
    """创建记录"""
    await pb_admin_auth()
    pb = _get_pb()
    try:
        return pb.collection(collection).create(data)
    except Exception as e:
        raise RuntimeError(f"pb_create({collection}) failed: {e}")


async def pb_update(collection: str, record_id: str, data: dict) -> dict:
    """更新记录"""
    await pb_admin_auth()
    pb = _get_pb()
    try:
        return pb.collection(collection).update(record_id, data)
    except Exception as e:
        raise RuntimeError(f"pb_update({collection}.{record_id}) failed: {e}")


async def pb_delete(collection: str, record_id: str) -> None:
    """删除记录"""
    await pb_admin_auth()
    pb = _get_pb()
    try:
        pb.collection(collection).delete(record_id)
    except Exception as e:
        raise RuntimeError(f"pb_delete({collection}.{record_id}) failed: {e}")


async def pb_upsert(collection: str, data: dict, filter_str: str) -> dict:
    """Upsert: 先查后改"""
    existing = await pb_get_one(collection, filter_str)
    if existing:
        return await pb_update(collection, existing["id"], data)
    else:
        return await pb_create(collection, data)
