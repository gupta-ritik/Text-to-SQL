from app.rag.documents import build_schema_documents
from app.rag.vectorstore import reset_vectorstore


def ingest():
    docs = build_schema_documents()
    store = reset_vectorstore()
    store.add_documents(docs)
    print(f"Ingested {len(docs)} schema documents.")


if __name__ == "__main__":
    ingest()
