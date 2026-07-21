"""饮食工具 — record_food / record_drink / record_bathroom"""

from datetime import datetime
from src.tools.registry import ToolRegistry
from src.db.pocketbase import pb_create
from src.config import settings


@ToolRegistry.register(
    name="record_food",
    description="记录饮食（吃了什么）。用户描述吃了某餐时调用。",
    parameters={
        "type": "object",
        "properties": {
            "meal_type": {
                "type": "string",
                "enum": ["breakfast", "lunch", "dinner", "snack"],
                "description": "餐别",
            },
            "name": {
                "type": "string",
                "description": "食物名称",
            },
            "calories": {
                "type": "number",
                "description": "热量（千卡），如果知道就填，不知道可填0",
            },
            "weight": {
                "type": "number",
                "description": "重量（克），可选",
            },
            "date": {
                "type": "string",
                "description": "日期 YYYY-MM-DD，默认今天",
            },
        },
        "required": ["meal_type", "name"],
    },
)
async def record_food(
    user_id: str,
    meal_type: str,
    name: str,
    calories: float = 0,
    weight: float = 0,
    date: str = "",
):
    record = await pb_create(settings.col_food_items, {
        "user_id": user_id,
        "meal_type": meal_type,
        "name": name,
        "calories": calories,
        "weight": weight,
        "carbs": 0,
        "protein": 0,
        "fat": 0,
        "date": date or datetime.now().strftime("%Y-%m-%d"),
        "created_at": datetime.now().isoformat(),
    })

    return {
        "meal_type": meal_type,
        "name": name,
        "calories": calories,
    }


@ToolRegistry.register(
    name="record_drink",
    description="记录喝水。用户说喝了多少杯水时调用。",
    parameters={
        "type": "object",
        "properties": {
            "amount": {
                "type": "integer",
                "description": "杯数",
            },
            "date": {
                "type": "string",
                "description": "日期 YYYY-MM-DD，默认今天",
            },
        },
        "required": ["amount"],
    },
)
async def record_drink(user_id: str, amount: int = 1, date: str = ""):
    record = await pb_create(settings.col_drink_records, {
        "user_id": user_id,
        "amount": amount,
        "date": date or datetime.now().strftime("%Y-%m-%d"),
        "created_at": datetime.now().isoformat(),
    })

    return {"amount": amount}


@ToolRegistry.register(
    name="record_bathroom",
    description="记录排便。用户说'上厕所'、'拉屎'、'排便'时调用。",
    parameters={
        "type": "object",
        "properties": {
            "feeling": {
                "type": "string",
                "description": "感受，如：顺畅/困难/正常",
            },
            "date": {
                "type": "string",
                "description": "日期 YYYY-MM-DD，默认今天",
            },
            "time": {
                "type": "string",
                "description": "时间 HH:MM，默认现在",
            },
        },
    },
)
async def record_bathroom(
    user_id: str,
    feeling: str = "",
    date: str = "",
    time: str = "",
):
    now = datetime.now()
    record = await pb_create(settings.col_bathroom_records, {
        "user_id": user_id,
        "feeling": feeling,
        "date": date or now.strftime("%Y-%m-%d"),
        "time": time or now.strftime("%H:%M"),
        "created_at": now.isoformat(),
    })

    return {"feeling": feeling, "date": date or now.strftime("%Y-%m-%d")}
