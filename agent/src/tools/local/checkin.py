"""打卡工具 — record_checkin / query_checkin_stats"""

from datetime import datetime
from src.tools.registry import ToolRegistry
from src.db.pocketbase import pb_create, pb_get_list, pb_upsert
from src.config import settings


@ToolRegistry.register(
    name="record_checkin",
    description="记录一次打卡。用户说完成了某件事、打卡某个任务时调用。",
    parameters={
        "type": "object",
        "properties": {
            "task_name": {
                "type": "string",
                "description": "打卡任务名称，如：健身/阅读/冥想/早起",
            },
            "count": {
                "type": "integer",
                "description": "完成次数，默认1。比如'50个俯卧撑'则count=50",
            },
            "date": {
                "type": "string",
                "description": "日期 YYYY-MM-DD，默认今天",
            },
        },
        "required": ["task_name"],
    },
)
async def record_checkin(
    user_id: str,
    task_name: str,
    count: int = 1,
    date: str = "",
):
    record_date = date or datetime.now().strftime("%Y-%m-%d")

    # 先查打卡任务，匹配名称
    tasks = await pb_get_list(
        settings.col_checkin_tasks,
        f'user_id="{user_id}"',
    )

    # 模糊匹配任务名
    matched_task = None
    for t in tasks:
        t_name = t.get("name", "")
        if task_name in t_name or t_name in task_name:
            matched_task = t
            break

    if not matched_task and tasks:
        # 取第一个作为兜底（不够好，但比直接失败强）
        # 更好的做法是提示用户先创建打卡任务
        return {"success": False, "error": f"未找到打卡任务「{task_name}」，请先在App中创建"}

    if not matched_task:
        return {"success": False, "error": "你还没有创建任何打卡任务，请先在App中创建"}

    task_id = matched_task["id"]

    # Upsert: 同一天同一任务只更新计数
    record = await pb_upsert(
        settings.col_checkin_history,
        {
            "user_id": user_id,
            "task_id": task_id,
            "date": record_date,
            "count": count,
            "completed_at": datetime.now().isoformat(),
        },
        f'user_id="{user_id}" && task_id="{task_id}" && date="{record_date}"',
    )

    # 计算今日完成情况
    today_records = await pb_get_list(
        settings.col_checkin_history,
        f'user_id="{user_id}" && date="{record_date}"',
    )

    return {
        "task_name": matched_task["name"],
        "count": count,
        "date": record_date,
        "today_total": len(today_records),
        "today_tasks": len(tasks),
    }


@ToolRegistry.register(
    name="query_checkin_stats",
    description="查询打卡统计。用户问打卡情况、完成了多少时调用。",
    parameters={
        "type": "object",
        "properties": {
            "date": {
                "type": "string",
                "description": "查询日期 YYYY-MM-DD，默认今天",
            },
        },
    },
)
async def query_checkin_stats(user_id: str, date: str = ""):
    record_date = date or datetime.now().strftime("%Y-%m-%d")

    tasks = await pb_get_list(
        settings.col_checkin_tasks,
        f'user_id="{user_id}"',
    )

    today_records = await pb_get_list(
        settings.col_checkin_history,
        f'user_id="{user_id}" && date="{record_date}"',
    )

    completed_task_ids = {r.get("task_id") for r in today_records}

    task_status = []
    for t in tasks:
        task_status.append({
            "name": t.get("name"),
            "done": t["id"] in completed_task_ids,
            "count": next(
                (r.get("count", 1) for r in today_records if r.get("task_id") == t["id"]),
                0,
            ),
        })

    done_count = sum(1 for ts in task_status if ts["done"])
    total = len(task_status)

    return {
        "date": record_date,
        "done": done_count,
        "total": total,
        "tasks": task_status,
    }
