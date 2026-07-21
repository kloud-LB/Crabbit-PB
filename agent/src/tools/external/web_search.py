"""联网搜索工具 — Brave Search API"""

import httpx
from src.tools.registry import ToolRegistry
from src.config import settings


@ToolRegistry.register(
    name="web_search",
    description="联网搜索。用户想查外部信息（天气、新闻、展览、路线等）时调用。注意：查询自己的消费/待办/打卡数据不用这个，用 query_expense_stats 等。",
    parameters={
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "搜索关键词",
            },
            "count": {
                "type": "integer",
                "description": "返回结果数，默认5，最多10",
            },
        },
        "required": ["query"],
    },
)
async def web_search(user_id: str, query: str, count: int = 5):
    if not settings.brave_api_key:
        return {
            "success": False,
            "error": "搜索服务未配置（缺少 BRAVE_API_KEY）",
        }

    count = min(count, 10)

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                "https://api.search.brave.com/res/v1/web/search",
                params={"q": query, "count": count},
                headers={
                    "Accept": "application/json",
                    "Accept-Encoding": "gzip",
                    "X-Subscription-Token": settings.brave_api_key,
                },
            )
            resp.raise_for_status()
            data = resp.json()

        results = []
        for r in (data.get("web", {}).get("results", []) or [])[:count]:
            results.append({
                "title": r.get("title", ""),
                "url": r.get("url", ""),
                "description": r.get("description", ""),
            })

        return {
            "query": query,
            "results": results,
            "count": len(results),
        }
    except Exception as e:
        return {"success": False, "error": f"搜索失败: {e}"}
