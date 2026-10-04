from app.agent.nodes import validate_plan


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
