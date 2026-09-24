from langchain_core.documents import Document
from app.database.schema import get_database_schema


def build_schema_documents() -> list[Document]:
    schema = get_database_schema()
    docs = []

    for table in schema["tables"]:
        lines = [
            f"Table: {table['table']}",
            "Description: Database table metadata for Text-to-SQL retrieval.",
            "Columns:",
        ]
        for c in table["columns"]:
            key = " PRIMARY KEY" if c["primary_key"] else ""
            nullability = " NULLABLE" if c["nullable"] else " NOT NULL"
            lines.append(f"- {c['name']} {c['type']}{key}{nullability}")

        relationships = [
            r for r in schema["relationships"]
            if r["from_table"] == table["table"] or r["to_table"] == table["table"]
        ]
        if relationships:
            lines.append("Relationships:")
            for r in relationships:
                lines.append(
                    f"- {r['from_table']}.{r['from_column']} -> "
                    f"{r['to_table']}.{r['to_column']}"
                )

        docs.append(
            Document(
                page_content="\n".join(lines),
                metadata={"table": table["table"], "type": "table_schema"},
            )
        )

    # Add one relationship document to make joins retrievable even when
    # neither table document is among the first vector hits.
    for r in schema["relationships"]:
        content = (
            f"Relationship: {r['from_table']}.{r['from_column']} "
            f"references {r['to_table']}.{r['to_column']}."
        )
        docs.append(
            Document(
                page_content=content,
                metadata={
                    "table": r["from_table"],
                    "related_table": r["to_table"],
                    "type": "relationship",
                },
            )
        )

    return docs
