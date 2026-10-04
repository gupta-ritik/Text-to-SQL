from typing import Any, TypedDict


class AgentState(TypedDict, total=False):
    question: str
    schema_context: str
    retrieved_tables: list[str]
    retrieved_columns: list[str]
    relationships: list[str]
    sql: str
    sql_valid: bool
    sql_error: str
    execution_result: dict[str, Any]
    final_answer: str
    retry_count: int
    metadata: dict[str, Any]
    analysis: str
    tables_used: list[str]
    query_plan: dict[str, Any]
    plan_valid: bool
    plan_error: str
    verification_valid: bool
    verification_error: str
    verification_feedback: str
    verification_correction: str
