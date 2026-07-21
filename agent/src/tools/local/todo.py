"""待办工具 — create_todo / query_todo_list / update_todo_status / delete_todo"""

from datetime import datetime
from src.tools.registry import ToolRegistry
from src.db.pocketbase import pb_create, pb_get_list, pb_update, pb_delete
from src.config import settings


@ToolRegistry.register(
    name="create_todo",
    description="创建一个待办事项。用户说'提醒我...'、'别忘了...'或提到要做的事情时调用。",
    parameters={
        "type": "object",
        "properties": {
            "title": {
                "type": "string",
                "description": "待办标题",
            },
            "deadline": {
                "type": "string",
                "description": "截止时间，ISO格式如 2026-07-22T15:00:00。如果不确定，留空",
            },
            "priority": {
                "type": "string",
                "enum": ["high", "medium", "low"],
                "description": "优先级。紧急/有明确时间→high，普通→medium，不着急→low",
            },
            "description": {
                "type": "string",
                "description": "额外描述，可选",
            },
        },
        "required": ["title"],
    },
)
async def create_todo(
    user_id: str,
    title: str,
    deadline: str = "",
    priority: str = "medium",
    description: str = "",
):
    if not title.strip():
        return {"success": False, "error": "标题不能为空"}

    record = await pb_create(settings.col_todo_items, {
        "user_id": user_id,
        "title": title.strip(),
        "description": description,
        "deadline": deadline or None,
        "priority": priority,
        "status": "pending",
        "created_at": datetime.now().isoformat(),
    })

    return {
        "record_id": record.get("id"),
        "title": title.strip(),
        "deadline": deadline,
        "priority": priority,
    }


@ToolRegistry.register(
    name="query_todo_list",
    description="查询待办列表。用户问有什么待办、还有多少任务时调用。",
    parameters={
        "type": "object",
        "properties": {
            "status": {
                "type": "string",
                "enum": ["pending", "completed", "all"],
                "description": "筛选状态。pending=未完成，completed=已完成，all=全部",
            },
        },
    },
)
async def query_todo_list(user_id: str, status: str = "pending"):
    if status == "all":
        filter_str = f'user_id="{user_id}"'
    elif status == "completed":
        filter_str = f'user_id="{user_id}" && (status="completed" || status="cancelled")'
    else:
        filter_str = f'user_id="{user_id}" && (status="pending" || status="postponed")'

    items = await pb_get_list(settings.col_todo_items, filter_str, sort="+deadline,+created_at")

    return {
        "count": len(items),
        "items": [
            {
                "id": item.get("id"),
                "title": item.get("title"),
                "deadline": item.get("deadline"),
                "priority": item.get("priority"),
                "status": item.get("status"),
            }
            for item in items
        ],
    }


@ToolRegistry.register(
    name="update_todo_status",
    description="更新待办状态。用户说'完成了XX'、'取消XX待办'时调用。",
    parameters={
        "type": "object",
        "properties": {
            "todo_id": {
                "type": "string",
                "description": "待办ID（如果不知道ID，先调用 query_todo_list 获取）",
            },
            "new_status": {
                "type": "string",
                "enum": ["completed", "cancelled", "postponed"],
                "description": "新状态",
            },
        },
        "required": ["todo_id", "new_status"],
    },
)
async def update_todo_status(user_id: str, todo_id: str, new_status: str):
    update_data = {"status": new_status}
    if new_status == "completed":
        update_data["completed_at"] = datetime.now().isoformat()

    await pb_update(settings.col_todo_items, todo_id, update_data)

    return {"todo_id": todo_id, "new_status": new_status}


@ToolRegistry.register(
    name="delete_todo",
    description="删除一个待办。用户明确说删除某个待办时调用。",
    parameters={
        "type": "object",
        "properties": {
            "todo_id": {
                "type": "string",
                "description": "待办ID",
            },
        },
        "required": ["todo_id"],
    },
)
async def delete_todo(user_id: str, todo_id: str):
    await pb_delete(settings.col_todo_items, todo_id)
    return {"todo_id": todo_id, "deleted": True}
