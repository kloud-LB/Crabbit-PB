"""Crabbit! V3 Agent — 配置管理（环境变量 → Pydantic Settings）"""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """所有配置从环境变量读取，有合理默认值"""

    # PocketBase
    pb_url: str = "http://localhost:8090"
    pb_admin_email: str = ""
    pb_admin_password: str = ""

    # DeepSeek
    deepseek_api_key: str = ""
    deepseek_base_url: str = "https://api.deepseek.com"
    deepseek_model: str = "deepseek-chat"
    deepseek_max_tokens: int = 1024
    deepseek_temperature: float = 0.7

    # SearXNG（自部署搜索引擎）
    searxng_url: str = "http://localhost:8088"

    # Redis
    redis_url: str = "redis://localhost:6379"

    # Agent
    agent_log_level: str = "INFO"
    clarification_timeout_sec: int = 30  # 追问上下文超时
    intent_confidence_threshold: float = 0.7  # LLM 意图置信度阈值

    # PocketBase collection names
    col_bookkeeping: str = "bookkeeping_records"
    col_todo_items: str = "todo_items"
    col_todo_categories: str = "todo_categories"
    col_checkin_tasks: str = "checkin_tasks"
    col_checkin_history: str = "checkin_history"
    col_food_items: str = "food_items"
    col_drink_records: str = "drink_records"
    col_bathroom_records: str = "bathroom_records"
    col_sleep_records: str = "sleep_records"
    col_body_measurements: str = "body_measurements"
    col_agent_messages: str = "agent_messages"
    col_agent_message_logs: str = "agent_message_logs"
    col_agent_user_context: str = "agent_user_context"
    col_user_qq_bindings: str = "user_qq_bindings"
    col_user_profiles: str = "user_profiles"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
