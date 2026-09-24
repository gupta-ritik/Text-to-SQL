import time
from sqlalchemy import text
from app.config import get_settings
from app.database.connection import get_engine


def execute_sql(sql: str) -> dict:
    started = time.perf_counter()
    engine = get_engine()
    limit = get_settings().max_result_rows

    with engine.connect() as conn:
        result = conn.execute(text(sql))
        columns = list(result.keys())
        rows = result.fetchmany(limit + 1)

    truncated = len(rows) > limit
    rows = rows[:limit]

    return {
        "columns": columns,
        "rows": [list(row) for row in rows],
        "row_count": len(rows),
        "truncated": truncated,
        "execution_time": round(time.perf_counter() - started, 4),
    }
