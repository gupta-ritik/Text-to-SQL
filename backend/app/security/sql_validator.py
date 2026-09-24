import re
import sqlglot
from sqlglot import exp


FORBIDDEN = {
    "INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "TRUNCATE",
    "CREATE", "GRANT", "REVOKE", "MERGE", "CALL", "EXEC",
}


def normalize_sql(sql: str) -> str:
    return sql.strip().strip("`").strip()


def validate_sql(sql: str, allowed_tables: list[str], allowed_columns: list[str]) -> tuple[bool, str]:
    sql = normalize_sql(sql)
    if not sql:
        return False, "SQL is empty."

    if "--" in sql or "/*" in sql or "*/" in sql:
        return False, "SQL comments are not allowed."

    if sql.count(";") > 1:
        return False, "Multiple SQL statements are not allowed."

    # A single trailing semicolon is harmless.
    statement = sql[:-1].strip() if sql.endswith(";") else sql

    first = statement.split(None, 1)[0].upper() if statement else ""
    if first not in {"SELECT", "WITH"}:
        return False, f"Only SELECT/WITH statements are allowed; got {first}."

    upper = statement.upper()
    for keyword in FORBIDDEN:
        if re.search(rf"\b{re.escape(keyword)}\b", upper):
            return False, f"Forbidden SQL operation: {keyword}."

    try:
        tree = sqlglot.parse_one(statement)
    except Exception as exc:
        return False, f"SQL syntax error: {exc}"

    # CTE aliases are not base tables and should not be compared to schema tables.
    cte_names = {cte.alias_or_name.lower() for cte in tree.find_all(exp.CTE)}
    referenced_tables = {
        t.name.lower()
        for t in tree.find_all(exp.Table)
        if t.name and t.name.lower() not in cte_names
    }
    allowed_table_set = {t.lower() for t in allowed_tables}
    unknown_tables = referenced_tables - allowed_table_set
    if unknown_tables:
        return False, f"Unauthorized/unknown tables: {sorted(unknown_tables)}"

    # Column validation is conservative: unqualified columns are checked against
    # retrieved schema, while SELECT * is allowed.
    allowed_col_set = {c.split(".")[-1].lower() for c in allowed_columns}
    table_col_pairs = {c.lower() for c in allowed_columns}

    for col in tree.find_all(exp.Column):
        name = col.name.lower()
        if name == "*":
            continue
        table = (col.table or "").lower()
        if table:
            if f"{table}.{name}" not in table_col_pairs and name not in allowed_col_set:
                return False, f"Unauthorized/unknown column: {table}.{name}"
        elif name not in allowed_col_set:
            return False, f"Unauthorized/unknown column: {name}"

    if re.search(r"\bSELECT\s+\*\s+FROM\b", upper) and "LIMIT" not in upper:
        return False, "Unrestricted SELECT * queries must include LIMIT."

    return True, "SQL is valid and read-only."
