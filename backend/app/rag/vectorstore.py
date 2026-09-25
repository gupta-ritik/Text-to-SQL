from functools import lru_cache
from pathlib import Path
from langchain_chroma import Chroma
from app.config import get_settings
from app.rag.embeddings import get_embeddings


@lru_cache(maxsize=1)
def get_vectorstore() -> Chroma:
    s = get_settings()
    Path(s.chroma_path).mkdir(parents=True, exist_ok=True)
    return Chroma(
        collection_name=s.chroma_collection,
        embedding_function=get_embeddings(),
        persist_directory=s.chroma_path,
    )


def reset_vectorstore() -> Chroma:
    store = get_vectorstore()
    try:
        store.delete_collection()
    finally:
        get_vectorstore.cache_clear()
    return get_vectorstore()
