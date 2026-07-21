"""回复生成 — 组合人设 + 任务上下文，委托 LLM"""

from src.engine.llm_client import llm_chat
from src.reply.personas import build_reply_system_prompt


async def generate_reply(
    persona_id: str,
    intent: str,
    params: dict,
    result: dict,
    is_clarification: bool = False,
    custom_persona: str = "",
) -> str:
    """生成最终回复"""

    system_prompt = build_reply_system_prompt(persona_id, custom_persona)

    # 构建简洁的 user content
    if is_clarification:
        user_content = f"[需要追问] 用户意图: {intent}, 已知信息: {params}"
    elif not result.get("success"):
        user_content = f"[操作失败] {intent}: {result.get('error', '未知错误')}, 参数: {params}"
    else:
        # 提取关键信息，去掉不必要的细节
        summary = {k: v for k, v in result.items() if k not in ("success", "record_id")}
        user_content = f"[操作成功] {intent}: {summary}"

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_content},
    ]

    llm_result = await llm_chat(
        messages=messages,
        temperature=0.8,  # 回复需要多样性
        max_tokens=150,   # 回复不宜太长
    )

    return llm_result.get("content") or "收到 🦀"
