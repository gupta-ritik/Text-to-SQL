import json
import time
from app.agent.state import AgentState
from app.config import get_settings
from app.database.executor import execute_sql
from app.llm.factory import get_llm
from app.llm.prompts import (
    ANSWER_SYSTEM_PROMPT,
    PLANNER_SYSTEM_PROMPT,
    REPAIR_SYSTEM_PROMPT,
    SQL_SYSTEM_PROMPT,
    VERIFIER_SYSTEM_PROMPT,
)
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


def query_planner(state: AgentState) -> AgentState:
    response = get_llm(temperature=0).invoke([
        ("system", PLANNER_SYSTEM_PROMPT),
        ("human", f"USER QUESTION:\n{state['question']}"),
    ])
    plan = _json_from_response(response.content)
    return {
        "query_plan": plan,
        "metadata": {**state.get("metadata", {}), "query_plan": plan},
    }


def retrieve_schema_node(state: AgentState) -> AgentState:
    plan_text = json.dumps(state.get("query_plan", {}), default=str)
    result = retrieve_schema(f"{state['question']}\nQuery plan:\n{plan_text}")
    return {
        "schema_context": result["context"],
        "retrieved_tables": result["tables"],
        "retrieved_columns": result["columns"],
        "relationships": result["relationships"],
    }


def validate_plan(state: AgentState) -> AgentState:
    plan = state.get("query_plan", {})
    if plan.get("answerable") is False:
        return {
            "plan_valid": False,
            "plan_error": plan.get("explanation") or "The request is not answerable from the available schema.",
        }

    retrieved_tables = {table.lower() for table in state.get("retrieved_tables", [])}
    retrieved_columns = {column.lower() for column in state.get("retrieved_columns", [])}
    retrieved_column_names = {column.rsplit(".", 1)[-1] for column in retrieved_columns}
    missing_tables = [
        table for table in plan.get("required_tables", [])
        if str(table).lower() not in retrieved_tables
    ]
    missing_columns = [
        column for column in plan.get("required_columns", [])
        if str(column).lower() not in retrieved_columns
        and str(column).lower().rsplit(".", 1)[-1] not in retrieved_column_names
    ]
    if missing_tables or missing_columns:
        parts = []
        if missing_tables:
            parts.append(f"missing tables: {', '.join(map(str, missing_tables))}")
        if missing_columns:
            parts.append(f"missing columns: {', '.join(map(str, missing_columns))}")
        return {"plan_valid": False, "plan_error": "Schema mismatch: " + "; ".join(parts)}
    return {"plan_valid": True, "plan_error": ""}


def generate_sql(state: AgentState) -> AgentState:
    llm = get_llm()
    relationships = "\n".join(state.get("relationships", [])) or "None explicitly retrieved."
    prompt = f"""{SQL_SYSTEM_PROMPT}

DATABASE DIALECT:
PostgreSQL SQL (SQLAlchemy dialect: postgresql).

USER QUESTION:
{state['question']}

STRUCTURED QUERY PLAN:
{json.dumps(state.get('query_plan', {}), indent=2, default=str)}

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
        "sql": (payload.get("sql") or "").strip(),
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
{state.get('sql_error', '') or state.get('verification_feedback', '')}

Structured query plan:
{json.dumps(state.get('query_plan', {}), indent=2, default=str)}
"""
    response = llm.invoke([
        ("system", REPAIR_SYSTEM_PROMPT),
        ("human", prompt),
    ])
    payload = _json_from_response(response.content)
    return {
        "sql": (payload.get("sql") or "").strip(),
        "tables_used": payload.get("tables_used", state.get("tables_used", [])),
        "retry_count": retries,
    }


def repair_plan(state: AgentState) -> AgentState:
    retries = state.get("retry_count", 0) + 1
    response = get_llm(temperature=0).invoke([
        ("system", PLANNER_SYSTEM_PROMPT),
        ("human", f"""USER QUESTION:
{state['question']}

PREVIOUS PLAN:
{json.dumps(state.get('query_plan', {}), indent=2, default=str)}

RETRIEVED SCHEMA:
{state.get('schema_context', '')}

PLAN ERROR:
{state.get('plan_error') or state.get('verification_feedback', '')}

Create a corrected plan. Do not invent missing schema fields.
"""),
    ])
    plan = _json_from_response(response.content)
    return {
        "query_plan": plan,
        "retry_count": retries,
        "plan_error": "",
        "metadata": {**state.get("metadata", {}), "query_plan": plan},
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


def verify_result(state: AgentState) -> AgentState:
    result = state.get("execution_result", {})
    response = get_llm(temperature=0).invoke([
        ("system", VERIFIER_SYSTEM_PROMPT),
        ("human", f"""ORIGINAL QUESTION:
{state['question']}

STRUCTURED QUERY PLAN:
{json.dumps(state.get('query_plan', {}), indent=2, default=str)}

GENERATED SQL:
{state.get('sql', '')}

EXECUTION RESULT:
{json.dumps(result, default=str)}
"""),
    ])
    payload = _json_from_response(response.content)
    valid = bool(payload.get("valid"))
    feedback = "; ".join(str(issue) for issue in payload.get("issues", []))
    if not valid and not feedback:
        feedback = str(payload.get("diagnosis") or "The result did not satisfy the query plan.")
    return {
        "verification_valid": valid,
        "verification_error": "" if valid else feedback,
        "verification_feedback": "" if valid else feedback,
        "verification_correction": payload.get("correction", "sql"),
        "metadata": {**state.get("metadata", {}), "verification": payload},
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
    if state.get("plan_error"):
        return {"final_answer": f"I could not map that request to the available schema: {state['plan_error']}"}
    if state.get("verification_error"):
        return {
            "final_answer": (
                "I could not verify that the generated query answers the request "
                f"after the allowed correction attempts: {state['verification_error']}"
            )
        }
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
        if state.get("retry_count", 0) >= get_settings().max_sql_retries:
            return "process_result"
        return "repair"
    return "process_result"


def validation_route(state: AgentState) -> str:
    if state.get("sql_valid"):
        return "execute_sql"
    if state.get("retry_count", 0) >= get_settings().max_sql_retries:
        return "process_result"
    return "repair_sql"


def plan_route(state: AgentState) -> str:
    if state.get("plan_valid"):
        return "generate_sql"
    if state.get("retry_count", 0) >= get_settings().max_correction_attempts:
        return "process_result"
    return "repair_plan"


def verification_route(state: AgentState) -> str:
    if state.get("verification_valid"):
        return "process_result"
    if state.get("retry_count", 0) >= get_settings().max_correction_attempts:
        return "process_result"
    if state.get("verification_correction") == "plan":
        return "repair_plan"
    return "repair_sql"
