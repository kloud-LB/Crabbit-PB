"""Tool Registry — 装饰器注册系统，每个工具 = 函数 + LLM function schema"""

from typing import Callable, Any


class _ToolDef:
    """工具定义"""
    def __init__(self, name: str, description: str, parameters: dict, func: Callable):
        self.name = name
        self.description = description
        self.parameters = parameters  # JSON Schema
        self.func = func


class ToolRegistry:
    """
    装饰器注册工具。

    使用:
        @ToolRegistry.register(
            name="record_expense",
            description="记录一笔支出",
            parameters={...JSON Schema...}
        )
        async def record_expense(user_id, amount, category, ...):
            ...
    """

    _tools: dict[str, _ToolDef] = {}

    @classmethod
    def register(cls, name: str, description: str, parameters: dict[str, Any]):
        """装饰器：注册工具"""
        def decorator(func: Callable):
            cls._tools[name] = _ToolDef(
                name=name,
                description=description,
                parameters=parameters,
                func=func,
            )
            return func
        return decorator

    @classmethod
    def get(cls, name: str) -> _ToolDef | None:
        return cls._tools.get(name)

    @classmethod
    def get_all(cls) -> list[_ToolDef]:
        return list(cls._tools.values())

    @classmethod
    def get_llm_tools(cls) -> list[dict]:
        """输出 OpenAI Function Calling 格式的工具列表"""
        tools = []
        for t in cls._tools.values():
            tools.append({
                "type": "function",
                "function": {
                    "name": t.name,
                    "description": t.description,
                    "parameters": t.parameters,
                },
            })
        return tools

    @classmethod
    async def execute(cls, name: str, user_id: str, **kwargs) -> dict:
        """执行工具，返回 {"success": bool, ...}"""
        tool = cls.get(name)
        if not tool:
            return {"success": False, "error": f"Tool '{name}' not found"}

        try:
            result = await tool.func(user_id=user_id, **kwargs)
            return {"success": True, **result}
        except Exception as e:
            return {"success": False, "error": str(e)}
