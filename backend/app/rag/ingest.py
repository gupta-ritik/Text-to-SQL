from app.rag.documents import build_schema_documents
from app.rag.vectorstore import get_vectorstore


def ingest():
    docs = build_schema_documents()
    store = get_vectorstore()
    try:
        store.delete_collection()
        store = get_vectorstore()
    except Exception:
        pass
    store.add_documents(docs)
    print(f"Ingested {len(docs)} schema documents.")


if __name__ == "__main__":
    ingest()
