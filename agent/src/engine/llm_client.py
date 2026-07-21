"""LLM 调用封装 — DeepSeek API（兼容 OpenAI SDK）"""

import json
from openai import AsyncOpenAI
from src.config import settings

_client = None


def _get_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        _client = AsyncOpenAI(
            api_key=settings.deepseek_api_key,
            base_url=settings.deepseek_base_url,
        )
    return _client


async def llm_chat(
    messages: list[dict],
    tools: list[dict] | None = None,
    tool_choice: str = "auto",
    temperature: float | None = None,
    max_tokens: int | None = None,
) -> dict:
    """
    通用 LLM 调用。

    Args:
        messages: [{"role": "system"|"user"|"assistant", "content": "..."}]
        tools: OpenAI function calling tools 定义
        tool_choice: "auto" | "none" | "required" | {"type":"function","function":{"name":"xxx"}}
        temperature: 默认 0.7（意图识别时更低）
        max_tokens: 默认 1024

    Returns:
        {
            "content": "回复文本" | None,
            "tool_calls": [{"name": "record_expense", "arguments": {...}}] | None,
            "usage": {"prompt_tokens": 100, "completion_tokens": 50, "total_tokens": 150}
        }
    """
    client = _get_client()

    kwargs = {
        "model": settings.deepseek_model,
        "messages": messages,
        "temperature": temperature if temperature is not None else settings.deepseek_temperature,
        "max_tokens": max_tokens or settings.deepseek_max_tokens,
    }

    if tools:
        kwargs["tools"] = tools
        kwargs["tool_choice"] = tool_choice

    response = await client.chat.completions.create(**kwargs)

    choice = response.choices[0]
    result = {
        "content": choice.message.content,
        "tool_calls": None,
        "usage": {
            "prompt_tokens": response.usage.prompt_tokens if response.usage else 0,
            "completion_tokens": response.usage.completion_tokens if response.usage else 0,
            "total_tokens": response.usage.total_tokens if response.usage else 0,
        },
    }

    if choice.message.tool_calls:
        result["tool_calls"] = []
        for tc in choice.message.tool_calls:
            try:
                args = json.loads(tc.function.arguments)
            except json.JSONDecodeError:
                args = {}
            result["tool_calls"].append({
                "name": tc.function.name,
                "arguments": args,
            })

    return result


async def llm_intent(
    user_message: str,
    regex_hints: dict | None = None,
) -> dict:
    """
    调用 LLM 做意图识别（Function Calling）。

    Args:
        user_message: 用户原始消息
        regex_hints: 正则层提取的 hints（可选）
          {"likely_intent": "record_expense", "extracted": {...}}

    Returns:
        {
            "intent": "record_expense" | "casual_chat" | "clarification",
            "params": {...},
            "confidence": 0.92,
            "usage": {...}
        }
    """
    from src.engine.prompts import INTENT_SYSTEM_PROMPT, build_user_prompt
    from src.tools.registry import ToolRegistry

    messages = [
        {"role": "system", "content": INTENT_SYSTEM_PROMPT},
        {"role": "user", "content": build_user_prompt(user_message, regex_hints)},
    ]

    result = await llm_chat(
        messages=messages,
        tools=ToolRegistry.get_llm_tools(),
        tool_choice="auto",
        temperature=0.3,  # 意图识别用更低温度
    )

    if result["tool_calls"] and len(result["tool_calls"]) > 0:
        tc = result["tool_calls"][0]
        return {
            "intent": tc["name"],
            "params": tc["arguments"],
            "confidence": 0.8,  # LLM function call 有较高置信度
            "usage": result["usage"],
        }
    else:
        # 未调用任何 function → 闲聊
        return {
            "intent": "casual_chat",
            "params": {"reply": result.get("content", "")},
            "confidence": 0.5,
            "usage": result["usage"],
        }


async def llm_reply(
    persona_id: str,
    tool_intent: str,
    tool_params: dict,
    tool_result: dict,
    is_clarification: bool = False,
) -> str:
    """
    生成拟人回复（带人设）。

    Args:
        persona_id: 人设 ID
        tool_intent: 执行的意图
        tool_params: 工具参数
        tool_result: 工具执行结果 {"success": True/False, ...}
        is_clarification: 是否是追问

    Returns:
        回复文本
    """
    from src.reply.personas import build_reply_system_prompt

    system_prompt = build_reply_system_prompt(persona_id)

    if is_clarification:
        user_content = f"你需要追问用户以澄清意图。上下文：{tool_params}"
    elif not tool_result.get("success"):
        user_content = f"工具执行失败。意图：{tool_intent}，参数：{tool_params}，错误：{tool_result.get('error', '未知错误')}。请安抚用户并给出建议。"
    else:
        user_content = f"工具执行成功。意图：{tool_intent}，参数：{tool_params}，结果：{tool_result}。请生成确认回复。"

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_content},
    ]

    result = await llm_chat(messages=messages, temperature=0.8, max_tokens=200)
    return result.get("content") or "收到 🦀"
