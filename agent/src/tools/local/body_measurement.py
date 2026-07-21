"""身材管理工具 — record_body_measurement / query_body_measurement"""

from datetime import datetime
from src.tools.registry import ToolRegistry
from src.db.pocketbase import pb_create, pb_get_list
from src.config import settings


@ToolRegistry.register(
    name="record_body_measurement",
    description="记录身材数据。用户说体重、腰围等数据时调用。",
    parameters={
        "type": "object",
        "properties": {
            "measure_type": {
                "type": "string",
                "enum": ["weight", "waist", "arm", "chest", "hip"],
                "description": "测量类型：weight=体重(kg), waist=腰围(cm), arm=臂围, chest=胸围, hip=臀围",
            },
            "value": {
                "type": "number",
                "description": "数值",
            },
            "date": {
                "type": "string",
                "description": "日期 YYYY-MM-DD，默认今天",
            },
        },
        "required": ["measure_type", "value"],
    },
)
async def record_body_measurement(
    user_id: str,
    measure_type: str,
    value: float,
    date: str = "",
):
    if value <= 0 or value > 500:
        return {"success": False, "error": "数值不合理"}

    type_names = {
        "weight": "体重", "waist": "腰围", "arm": "臂围",
        "chest": "胸围", "hip": "臀围",
    }

    record = await pb_create(settings.col_body_measurements, {
        "user_id": user_id,
        "type": measure_type,
        "value": value,
        "date": date or datetime.now().strftime("%Y-%m-%d"),
        "created_at": datetime.now().isoformat(),
    })

    return {
        "type_name": type_names.get(measure_type, measure_type),
        "value": value,
        "date": date or datetime.now().strftime("%Y-%m-%d"),
    }
