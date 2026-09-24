from app.security.sql_validator import validate_sql


def test_select_is_allowed():
    ok, _ = validate_sql(
        "SELECT customer_name FROM customers LIMIT 10",
        ["customers"],
        ["customers.customer_name"],
    )
    assert ok


def test_write_is_rejected():
    ok, _ = validate_sql(
        "DELETE FROM customers",
        ["customers"],
        ["customers.customer_name"],
    )
    assert not ok


def test_multiple_statements_rejected():
    ok, _ = validate_sql(
        "SELECT * FROM customers; DROP TABLE customers;",
        ["customers"],
        ["customers.customer_name"],
    )
    assert not ok


def test_unknown_table_rejected():
    ok, _ = validate_sql(
        "SELECT * FROM salaries LIMIT 10",
        ["customers"],
        ["customers.customer_name"],
    )
    assert not ok
