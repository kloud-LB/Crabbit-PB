"""查询工具 — query_expense_stats（跨模块统计查询）"""

from datetime import datetime, timedelta
from collections import defaultdict
from src.tools.registry import ToolRegistry
from src.db.pocketbase import pb_get_list
from src.config import settings


def _get_period_range(period: str) -> tuple[str, str]:
    """计算时间范围"""
    today = datetime.now().date()

    if period == "this_week":
        monday = today - timedelta(days=today.weekday())
        return monday.strftime("%Y-%m-%d"), today.strftime("%Y-%m-%d")
    elif period == "last_week":
        last_monday = today - timedelta(days=today.weekday() + 7)
        last_sunday = last_monday + timedelta(days=6)
        return last_monday.strftime("%Y-%m-%d"), last_sunday.strftime("%Y-%m-%d")
    elif period == "this_month":
        start = today.replace(day=1)
        return start.strftime("%Y-%m-%d"), today.strftime("%Y-%m-%d")
    elif period == "last_month":
        first_of_this = today.replace(day=1)
        last_of_prev = first_of_this - timedelta(days=1)
        start_of_prev = last_of_prev.replace(day=1)
        return start_of_prev.strftime("%Y-%m-%d"), last_of_prev.strftime("%Y-%m-%d")
    elif period == "this_year":
        start = today.replace(month=1, day=1)
        return start.strftime("%Y-%m-%d"), today.strftime("%Y-%m-%d")
    else:
        # 默认本月
        start = today.replace(day=1)
        return start.strftime("%Y-%m-%d"), today.strftime("%Y-%m-%d")


@ToolRegistry.register(
    name="query_expense_stats",
    description="查询消费统计。用户问花了多少钱、消费情况、收支状况时调用。",
    parameters={
        "type": "object",
        "properties": {
            "period": {
                "type": "string",
                "enum": ["this_week", "last_week", "this_month", "last_month", "this_year"],
                "description": "时间范围",
            },
            "type": {
                "type": "string",
                "enum": ["expense", "income", "both"],
                "description": "查询类型",
            },
        },
        "required": ["period"],
    },
)
async def query_expense_stats(
    user_id: str,
    period: str = "this_month",
    query_type: str = "expense",
):
    date_from, date_to = _get_period_range(period)

    type_filter = ""
    if query_type == "expense":
        type_filter = ' && type="expense"'
    elif query_type == "income":
        type_filter = ' && type="income"'

    records = await pb_get_list(
        settings.col_bookkeeping,
        f'user_id="{user_id}" && date>="{date_from}" && date<="{date_to}"{type_filter}',
        sort="-date",
    )

    # 按类别汇总
    by_category = defaultdict(float)
    total = 0.0
    for r in records:
        cat = r.get("category", "其他")
        amt = float(r.get("amount", 0))
        by_category[cat] += amt
        total += amt

    period_labels = {
        "this_week": "本周",
        "last_week": "上周",
        "this_month": "本月",
        "last_month": "上月",
        "this_year": "今年",
    }

    # 排序：金额高的在前
    sorted_cats = sorted(by_category.items(), key=lambda x: -x[1])

    return {
        "period": period_labels.get(period, period),
        "date_range": f"{date_from} ~ {date_to}",
        "total": round(total, 2),
        "by_category": [
            {"category": cat, "amount": round(amt, 2)}
            for cat, amt in sorted_cats
        ],
        "record_count": len(records),
    }
