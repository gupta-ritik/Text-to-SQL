from app.agent.nodes import query_planner, validate_plan


class _Response:
    content = """{
        "intent": "count rows",
        "entity": "records",
        "metric": "rows",
        "aggregation": "count",
        "filters": [{"column": "result", "operator": "=", "value": "pass"}],
        "time_range": null,
        "grouping": [],
        "ordering": null,
        "limit": null,
        "required_tables": ["dataset_results"],
        "required_columns": ["dataset_results.result"],
        "join_requirements": [],
        "answerable": true,
        "explanation": "The requested column exists in the supplied table."
    }"""


class _Planner:
    def __init__(self, messages):
        self.messages = messages

    def invoke(self, messages):
        self.messages.extend(messages)
        return _Response()


def test_query_planner_receives_schema(monkeypatch):
    messages = []
    monkeypatch.setattr(
        "app.agent.nodes.get_llm",
        lambda temperature=0: _Planner(messages),
    )

    result = query_planner({
        "question": "How many rows have result pass?",
        "schema_context": "Table: dataset_results\n- result TEXT",
    })

    assert result["query_plan"]["answerable"] is True
    assert "AVAILABLE DATABASE SCHEMA" in messages[1][1]
    assert "dataset_results" in messages[1][1]


def test_plan_accepts_retrieved_tables_and_columns():
    state = {
        "query_plan": {
            "answerable": True,
            "required_tables": ["customers"],
            "required_columns": ["customers.country"],
        },
        "retrieved_tables": ["customers"],
        "retrieved_columns": ["customers.customer_name", "customers.country"],
    }

    result = validate_plan(state)

    assert result["plan_valid"] is True
    assert result["plan_error"] == ""


def test_plan_rejects_missing_schema_column():
    state = {
        "query_plan": {
            "answerable": True,
            "required_tables": ["employees"],
            "required_columns": ["employees.salary"],
        },
        "retrieved_tables": ["employees"],
        "retrieved_columns": ["employees.employee_name"],
    }

    result = validate_plan(state)

    assert result["plan_valid"] is False
    assert "employees.salary" in result["plan_error"]


def test_plan_rejects_unanswerable_request():
    result = validate_plan({
        "query_plan": {
            "answerable": False,
            "explanation": "No salary column exists.",
        },
        "retrieved_tables": [],
        "retrieved_columns": [],
    })

    assert result == {
        "plan_valid": False,
        "plan_error": "No salary column exists.",
    }
