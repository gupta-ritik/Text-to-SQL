from sqlalchemy import inspect
from app.database.connection import get_engine


def get_database_schema() -> dict:
    engine = get_engine()
    inspector = inspect(engine)

    tables = []
    relationships = []

    for table_name in inspector.get_table_names():
        columns = []
        for c in inspector.get_columns(table_name):
            columns.append({
                "name": c["name"],
                "type": str(c["type"]),
                "nullable": c.get("nullable", True),
                "primary_key": False,
            })

        pk = inspector.get_pk_constraint(table_name).get("constrained_columns", [])
        for c in columns:
            c["primary_key"] = c["name"] in pk

        fks = inspector.get_foreign_keys(table_name)
        for fk in fks:
            referred_table = fk.get("referred_table")
            for local, remote in zip(
                fk.get("constrained_columns", []),
                fk.get("referred_columns", []),
            ):
                relationships.append({
                    "from_table": table_name,
                    "from_column": local,
                    "to_table": referred_table,
                    "to_column": remote,
                })

        tables.append({
            "table": table_name,
            "columns": columns,
        })

    return {"tables": tables, "relationships": relationships}


def schema_as_text(schema: dict) -> str:
    chunks = []
    for table in schema["tables"]:
        lines = [f"Table: {table['table']}", "Columns:"]
        for c in table["columns"]:
            flags = []
            if c["primary_key"]:
                flags.append("PRIMARY KEY")
            if not c["nullable"]:
                flags.append("NOT NULL")
            suffix = f" {' '.join(flags)}" if flags else ""
            lines.append(f"- {c['name']} {c['type']}{suffix}")
        chunks.append("\n".join(lines))

    if schema["relationships"]:
        rel = ["Relationships:"]
        for r in schema["relationships"]:
            rel.append(
                f"- {r['from_table']}.{r['from_column']} -> "
                f"{r['to_table']}.{r['to_column']}"
            )
        chunks.append("\n".join(rel))

    return "\n\n".join(chunks)
