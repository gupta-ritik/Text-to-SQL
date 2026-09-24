import json
import time
from app.agent.state import AgentState
from app.config import get_settings
from app.database.executor import execute_sql
from app.llm.factory import get_llm
from app.llm.prompts import SQL_SYSTEM_PROMPT, REPAIR_SYSTEM_PROMPT, ANSWER_SYSTEM_PROMPT
from app.rag.retriever import retrieve_schema
from app.security.sql_validator import validate_sql


def _json_from_response(content: str) -> dict:
    if isinstance(content, list):
        content = "".join(str(x) for x in content)
    content = str(content).strip()
    if content.startswith("```"):
        content = content.replace("```json", "", 1).replace("```", "", 1).strip()
    start, end = content.find("{"), content.rfind("}")
    if start >= 0 and end > start:
        content = content[start:end + 1]
    return json.loads(content)


def analyze_question(state: AgentState) -> AgentState:
    question = state["question"].strip()
    return {
        "analysis": (
            "Question normalized for schema retrieval. "
            f"Length={len(question)} characters."
        ),
        "retry_count": state.get("retry_count", 0),
    }


def retrieve_schema_node(state: AgentState) -> AgentState:
    result = retrieve_schema(state["question"])
    return {
        "schema_context": result["context"],
        "retrieved_tables": result["tables"],
        "retrieved_columns": result["columns"],
        "relationships": result["relationships"],
    }


def generate_sql(state: AgentState) -> AgentState:
    llm = get_llm()
    relationships = "\n".join(state.get("relationships", [])) or "None explicitly retrieved."
    prompt = f"""{SQL_SYSTEM_PROMPT}

DATABASE DIALECT:
SQLAlchemy database dialect: sqlite/postgresql compatible SQL.

USER QUESTION:
{state['question']}

RELEVANT DATABASE SCHEMA:
{state['schema_context']}

TABLE RELATIONSHIPS:
{relationships}
"""
    response = llm.invoke([
        ("system", SQL_SYSTEM_PROMPT),
        ("human", prompt),
    ])
    payload = _json_from_response(response.content)
    return {
        "sql": payload.get("sql", "").strip(),
        "tables_used": payload.get("tables_used", []),
        "metadata": {
            **state.get("metadata", {}),
            "llm_provider": get_settings().llm_provider,
            "model": (
                get_settings().groq_model
                if get_settings().llm_provider == "groq"
                else get_settings().openrouter_model
            ),
            "confidence": payload.get("confidence"),
            "sql_explanation": payload.get("explanation", ""),
        },
    }


def validate_sql_node(state: AgentState) -> AgentState:
    valid, message = validate_sql(
        state.get("sql", ""),
        state.get("retrieved_tables", []),
        state.get("retrieved_columns", []),
    )
    return {"sql_valid": valid, "sql_error": "" if valid else message}


def repair_sql(state: AgentState) -> AgentState:
    retries = state.get("retry_count", 0) + 1
    if retries > get_settings().max_sql_retries:
        return {"retry_count": retries}

    llm = get_llm()
    prompt = f"""{REPAIR_SYSTEM_PROMPT}

Original question:
{state['question']}

Relevant schema:
{state['schema_context']}

Previous SQL:
{state.get('sql', '')}

Error:
{state.get('sql_error', '')}
"""
    response = llm.invoke([
        ("system", REPAIR_SYSTEM_PROMPT),
        ("human", prompt),
    ])
    payload = _json_from_response(response.content)
    return {
        "sql": payload.get("sql", "").strip(),
        "tables_used": payload.get("tables_used", state.get("tables_used", [])),
        "retry_count": retries,
    }


def execute_sql_node(state: AgentState) -> AgentState:
    try:
        result = execute_sql(state["sql"])
        return {
            "execution_result": result,
            "sql_error": "",
            "metadata": {
                **state.get("metadata", {}),
                "execution_time": result["execution_time"],
            },
        }
    except Exception as exc:
        return {
            "sql_error": str(exc),
            "execution_result": {},
        }


def process_result(state: AgentState) -> AgentState:
    result = state.get("execution_result", {})
    return {
        "metadata": {
            **state.get("metadata", {}),
            "row_count": result.get("row_count", 0),
            "truncated": result.get("truncated", False),
        }
    }


def generate_answer(state: AgentState) -> AgentState:
    result = state.get("execution_result", {})
    if not result:
        return {"final_answer": "The SQL query could not be executed after the allowed repair attempts."}

    llm = get_llm(temperature=0)
    result_text = json.dumps(result, default=str)
    prompt = f"""{ANSWER_SYSTEM_PROMPT}

Question:
{state['question']}

SQL:
{state['sql']}

Execution result:
{result_text}
"""
    response = llm.invoke([
        ("system", ANSWER_SYSTEM_PROMPT),
        ("human", prompt),
    ])
    return {"final_answer": str(response.content).strip()}


def execute_error_or_success(state: AgentState) -> str:
    if state.get("sql_error"):
        return "repair"
    return "process_result"


def validation_route(state: AgentState) -> str:
    if state.get("sql_valid"):
        return "execute_sql"
    if state.get("retry_count", 0) >= get_settings().max_sql_retries:
        return "execute_sql"
    return "repair_sql"
