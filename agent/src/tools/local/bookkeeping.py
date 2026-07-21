"""记账工具 — record_expense / record_income"""

from datetime import datetime
from src.tools.registry import ToolRegistry
from src.db.pocketbase import pb_create
from src.engine.synonyms import map_category_or_other
from src.config import settings


@ToolRegistry.register(
    name="record_expense",
    description="记录一笔支出。用户花了钱的时候调用。",
    parameters={
        "type": "object",
        "properties": {
            "amount": {
                "type": "number",
                "description": "金额（元），必填",
            },
            "category": {
                "type": "string",
                "description": "支出类别，如：餐饮/交通/娱乐/居家/学习/服饰/礼物/其他",
            },
            "note": {
                "type": "string",
                "description": "备注，可选。比如具体买了什么",
            },
            "date": {
                "type": "string",
                "description": "日期 YYYY-MM-DD，默认今天",
            },
        },
        "required": ["amount"],
    },
)
async def record_expense(
    user_id: str,
    amount: float,
    category: str = "其他",
    note: str = "",
    date: str = "",
):
    if amount <= 0:
        return {"success": False, "error": "金额必须大于0"}

    cat = map_category_or_other(category)
    record_date = date or datetime.now().strftime("%Y-%m-%d")

    record = await pb_create(settings.col_bookkeeping, {
        "user_id": user_id,
        "type": "expense",
        "amount": amount,
        "category": cat,
        "note": note,
        "date": record_date,
        "created_at": datetime.now().isoformat(),
    })

    return {
        "record_id": record.get("id"),
        "amount": amount,
        "category": cat,
        "date": record_date,
    }


@ToolRegistry.register(
    name="record_income",
    description="记录一笔收入。用户进钱的时候调用。",
    parameters={
        "type": "object",
        "properties": {
            "amount": {
                "type": "number",
                "description": "金额（元），必填",
            },
            "category": {
                "type": "string",
                "description": "收入类别，如：工资/奖金/卖出/其他",
            },
            "note": {
                "type": "string",
                "description": "备注，可选",
            },
            "date": {
                "type": "string",
                "description": "日期 YYYY-MM-DD，默认今天",
            },
        },
        "required": ["amount"],
    },
)
async def record_income(
    user_id: str,
    amount: float,
    category: str = "其他",
    note: str = "",
    date: str = "",
):
    if amount <= 0:
        return {"success": False, "error": "金额必须大于0"}

    cat = map_category_or_other(category, default="其他")
    record_date = date or datetime.now().strftime("%Y-%m-%d")

    record = await pb_create(settings.col_bookkeeping, {
        "user_id": user_id,
        "type": "income",
        "amount": amount,
        "category": cat,
        "note": note,
        "date": record_date,
        "created_at": datetime.now().isoformat(),
    })

    return {
        "record_id": record.get("id"),
        "amount": amount,
        "category": cat,
        "date": record_date,
    }
