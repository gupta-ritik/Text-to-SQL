from app.config import get_settings
from app.rag.vectorstore import get_vectorstore


def retrieve_schema(question: str) -> dict:
    store = get_vectorstore()
    results = store.similarity_search_with_score(
        question,
        k=get_settings().schema_top_k,
    )

    tables = []
    columns = []
    relationships = []
    context_parts = []

    for doc, score in results:
        context_parts.append(doc.page_content)
        table = doc.metadata.get("table")
        if table and table not in tables:
            tables.append(table)

        for raw_line in doc.page_content.splitlines():
            line = raw_line.strip()
            if line.startswith("Relationship:"):
                relationships.append(line)
            elif raw_line.lstrip().startswith("- "):
                item = raw_line.lstrip()[2:].strip()
                pieces = item.split()
                if pieces and table:
                    columns.append(f"{table}.{pieces[0]}")

    # Add directly related table metadata so a join is not lost because
    # only one side ranked highly.
    if tables:
        related_docs = store.similarity_search(
            " ".join(tables),
            k=min(max(len(tables) + 2, 3), 10),
        )
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

    return {
        "tables": sorted(set(tables)),
        "columns": sorted(set(columns)),
        "relationships": sorted(set(relationships)),
        "context": "\n\n".join(context_parts),
    }
