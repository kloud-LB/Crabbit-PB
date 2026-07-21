"""Pydantic 数据模型 — 与 PocketBase collection 字段对齐"""

from datetime import datetime
from typing import Any
from pydantic import BaseModel


# === 业务记录模型（Agent 写入/查询用） ===

class BookkeepingRecord(BaseModel):
    user_id: str
    type: str  # "expense" | "income"
    amount: float
    category: str
    note: str = ""
    date: str  # "YYYY-MM-DD"
    created_at: str | None = None


class TodoItem(BaseModel):
    user_id: str
    category_id: str = ""
    title: str
    description: str = ""
    deadline: str | None = None  # ISO datetime string
    priority: str = "medium"  # high | medium | low
    status: str = "pending"
    created_at: str | None = None
    completed_at: str | None = None


class CheckinEntry(BaseModel):
    user_id: str
    task_id: str
    date: str  # "YYYY-MM-DD"
    count: int = 1
    completed_at: str | None = None


class FoodItem(BaseModel):
    user_id: str
    meal_type: str  # breakfast | lunch | dinner | snack
    name: str
    weight: float = 0
    calories: float = 0
    carbs: float = 0
    protein: float = 0
    fat: float = 0
    date: str
    created_at: str | None = None


class SleepRecord(BaseModel):
    user_id: str
    type: str  # main | nap
    sleep_time: str  # "HH:MM"
    wake_time: str  # "HH:MM"
    duration_min: int
    date: str
    rating: str = ""
    quality: str = ""
    created_at: str | None = None


class BodyMeasurement(BaseModel):
    user_id: str
    type: str  # weight | waist | arm | chest | hip
    value: float
    date: str
    created_at: str | None = None


class DrinkRecord(BaseModel):
    user_id: str
    amount: int  # 杯数
    date: str
    created_at: str | None = None


class BathroomRecord(BaseModel):
    user_id: str
    shape: str = ""
    color: str = ""
    amount: str = ""
    feeling: str = ""
    smell: str = ""
    duration: str = ""
    date: str = ""
    time: str = ""
    created_at: str | None = None


# === Agent 日志模型 ===

class AgentMessageLog(BaseModel):
    user_id: str
    qq_id: str = ""
    direction: str  # inbound | outbound
    raw_text: str
    regex_matched: bool = False
    regex_intent: str = ""
    regex_params: dict[str, Any] = {}
    regex_confidence: float = 0
    regex_concern: str = ""
    llm_intent_called: bool = False
    llm_intent: str = ""
    llm_params: dict[str, Any] = {}
    llm_confidence: float = 0
    final_intent: str = ""
    final_params: dict[str, Any] = {}
    tool_executed: bool = False
    tool_success: bool = False
    tool_result: dict[str, Any] = {}
    tool_error: str = ""
    reply_text: str = ""
    reply_tokens: int = 0
    intent_tokens: int = 0
    total_latency_ms: int = 0
    clarification_of: str = ""
    needs_review: bool = False
    review_reason: str = ""
    review_status: str = "pending"
    review_notes: str = ""
    created_at: str = ""
