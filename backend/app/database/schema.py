import json
import hashlib
from pathlib import Path

from sqlalchemy import inspect
from app.database.connection import get_engine

PUBLIC_TABLES = {
    "departments",
    "employees",
    "customers",
    "products",
    "orders",
    "order_items",
}


def user_scope(user_id: str) -> str:
    return hashlib.sha256(user_id.encode("utf-8")).hexdigest()[:16]


def is_user_dataset_table(table_name: str, user_id: str) -> bool:
    return table_name.startswith(f"dataset_{user_scope(user_id)}_")


def get_database_schema(user_id: str | None = None) -> dict:
    engine = get_engine()
    inspector = inspect(engine)

    tables = []
    relationships = []

    for table_name in inspector.get_table_names():
        if (
            user_id is not None
            and table_name not in PUBLIC_TABLES
            and not is_user_dataset_table(table_name, user_id)
        ):
            continue
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

    relationship_file = (
        Path(__file__).resolve().parents[3]
        / "datasets"
        / ("users" if user_id is not None else "")
        / (user_scope(user_id) if user_id is not None else "")
        / ".relationships.json"
    )
    if relationship_file.exists():
        try:
            inferred = json.loads(relationship_file.read_text(encoding="utf-8"))
            relationships.extend(inferred)
        except (OSError, json.JSONDecodeError):
            pass

    unique_relationships = {
        (
            relationship.get("from_table"),
            relationship.get("from_column"),
            relationship.get("to_table"),
            relationship.get("to_column"),
        ): relationship
        for relationship in relationships
    }
    return {"tables": tables, "relationships": list(unique_relationships.values())}


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
