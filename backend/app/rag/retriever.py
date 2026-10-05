from pathlib import Path
import logging

from app.config import get_settings
from app.database.schema import get_database_schema, user_scope
from app.rag.vectorstore import get_vectorstore

logger = logging.getLogger(__name__)


def _selected_table_names(user_id: str | None = None) -> set[str]:
    selection_file = Path(__file__).resolve().parents[3] / "datasets"
    if user_id is not None:
        selection_file /= "users" / user_scope(user_id)
    selection_file /= ".selected"
    if not selection_file.exists():
        return set()

    lines = [
        line.strip()
        for line in selection_file.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    table_names = set()
    for line in lines:
        parts = line.strip().split("\t", 1)
        if len(parts) == 2 and parts[1]:
            table_names.add(parts[1])
    if not table_names and len(lines) == 2:
        table_names.add(lines[1])
    return table_names


def _table_context(table: dict) -> str:
    lines = [
        f"Table: {table['table']}",
        "Description: Database table metadata for Text-to-SQL retrieval.",
        "Columns:",
    ]
    for column in table["columns"]:
        key = " PRIMARY KEY" if column["primary_key"] else ""
        nullability = " NULLABLE" if column["nullable"] else " NOT NULL"
        lines.append(f"- {column['name']} {column['type']}{key}{nullability}")
    return "\n".join(lines)


def retrieve_schema(question: str, user_id: str | None = None) -> dict:
    tables = []
    columns = []
    relationships = []
    context_parts = []
    schema = get_database_schema(user_id)
    allowed_tables = {table["table"] for table in schema["tables"]}

    try:
        store = get_vectorstore()
        results = store.similarity_search_with_score(
            question,
            k=int(get_settings().schema_top_k),
        )
    except Exception:
        logger.exception("Schema vector search failed; using database schema fallback.")
        results = []

    for doc, _score in results:
        table = doc.metadata.get("table")
        if not table or table not in allowed_tables:
            continue
        context_parts.append(doc.page_content)
        if table not in tables:
            tables.append(table)

        for raw_line in doc.page_content.splitlines():
            line = raw_line.strip()
            if line.startswith("Relationship:"):
                relationships.append(line)
            elif raw_line.lstrip().startswith("- "):
                item = raw_line.lstrip()[2:].strip()
                pieces = item.split()
                if pieces:
                    columns.append(f"{table}.{pieces[0]}")

    # Add directly related table metadata so a join is not lost because
    # only one side ranked highly.
    if tables and results:
        try:
            related_docs = get_vectorstore().similarity_search(
                " ".join(tables),
                k=min(max(len(tables) + 2, 3), 10),
            )
        except Exception:
            logger.exception("Related schema vector search failed; continuing.")
            related_docs = []
        for doc in related_docs:
            t = doc.metadata.get("table")
            if t in tables and doc.page_content not in context_parts:
                context_parts.append(doc.page_content)
                for raw_line in doc.page_content.splitlines():
                    if raw_line.lstrip().startswith("- "):
                        item = raw_line.lstrip()[2:].strip()
                        pieces = item.split()
                        if pieces and t:
                            columns.append(f"{t}.{pieces[0]}")

    # Always include explicitly selected dataset tables. A generic question
    # such as "best restaurant" can rank seeded tables above the active CSV.
    selected_tables = _selected_table_names(user_id) & allowed_tables
    if selected_tables:
        for table in schema["tables"]:
            table_name = table["table"]
            if table_name not in selected_tables or table_name in tables:
                continue
            context_parts.append(_table_context(table))
            tables.append(table_name)
            columns.extend(
                f"{table_name}.{column['name']}" for column in table["columns"]
            )
        for relationship in schema["relationships"]:
            if (
                relationship["from_table"] in selected_tables
                or relationship["to_table"] in selected_tables
            ):
                relationships.append(
                    f"Relationship: {relationship['from_table']}."
                    f"{relationship['from_column']} references "
                    f"{relationship['to_table']}.{relationship['to_column']}."
                )

    if not context_parts:
        for table in schema["tables"]:
            context_parts.append(_table_context(table))
            tables.append(table["table"])
            columns.extend(
                f"{table['table']}.{column['name']}" for column in table["columns"]
            )

    return {
        "tables": sorted(set(tables)),
        "columns": sorted(set(columns)),
        "relationships": sorted(set(relationships)),
        "context": "\n\n".join(context_parts),
    }
