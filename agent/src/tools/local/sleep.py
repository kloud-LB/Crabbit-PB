"""睡眠工具 — record_sleep"""

from datetime import datetime
from src.tools.registry import ToolRegistry
from src.db.pocketbase import pb_create
from src.config import settings


def _calc_duration(sleep_time: str, wake_time: str) -> int:
    """计算睡眠时长（分钟）"""
    try:
        sh, sm = map(int, sleep_time.split(":"))
        wh, wm = map(int, wake_time.split(":"))
        dur = (wh * 60 + wm) - (sh * 60 + sm)
        if dur <= 0:
            dur += 1440  # 跨午夜
        return dur
    except Exception:
        return 480  # 默认8小时


@ToolRegistry.register(
    name="record_sleep",
    description="记录睡眠。用户说睡觉/起床时间时调用。",
    parameters={
        "type": "object",
        "properties": {
            "type": {
                "type": "string",
                "enum": ["main", "nap"],
                "description": "主睡眠还是小憩",
            },
            "sleep_time": {
                "type": "string",
                "description": "入睡时间 HH:MM，如 23:00",
            },
            "wake_time": {
                "type": "string",
                "description": "起床时间 HH:MM，如 07:00",
            },
            "date": {
                "type": "string",
                "description": "日期 YYYY-MM-DD，默认今天",
            },
            "rating": {
                "type": "string",
                "description": "睡眠质量评价，可选",
            },
        },
        "required": ["sleep_time", "wake_time"],
    },
)
async def record_sleep(
    user_id: str,
    sleep_time: str,
    wake_time: str,
    sleep_type: str = "main",
    date: str = "",
    rating: str = "",
):
    dur = _calc_duration(sleep_time, wake_time)

    record = await pb_create(settings.col_sleep_records, {
        "user_id": user_id,
        "type": sleep_type,
        "sleep_time": sleep_time,
        "wake_time": wake_time,
        "duration_min": dur,
        "date": date or datetime.now().strftime("%Y-%m-%d"),
        "rating": rating,
        "created_at": datetime.now().isoformat(),
    })

    hours = dur // 60
    mins = dur % 60
    return {
        "duration_hours": hours,
        "duration_mins": mins,
        "sleep_time": sleep_time,
        "wake_time": wake_time,
    }
