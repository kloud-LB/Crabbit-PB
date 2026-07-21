"""联网搜索工具 — 自部署 SearXNG（免费、无限制）"""

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
    """使用 SearXNG 进行搜索（自部署，免费无限制）"""
    count = min(count, 10)

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"{settings.searxng_url}/search",
                params={
                    "q": query,
                    "format": "json",
                    "categories": "general",
                    "language": "zh-CN",
                },
            )
            resp.raise_for_status()
            data = resp.json()

        results = []
        for r in (data.get("results", []) or [])[:count]:
            results.append({
                "title": r.get("title", ""),
                "url": r.get("url", ""),
                "description": (r.get("content", "") or r.get("snippet", ""))[:300],
            })

        return {
            "query": query,
            "results": results,
            "count": len(results),
        }
    except httpx.ConnectError:
        return {"success": False, "error": "搜索服务未启动，请检查 SearXNG 容器状态"}
    except Exception as e:
        return {"success": False, "error": f"搜索失败: {e}"}
