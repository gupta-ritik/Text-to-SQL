from functools import lru_cache

from langchain_community.embeddings import HuggingFaceEmbeddings
from app.config import get_settings


@lru_cache(maxsize=1)
def get_embeddings():
    return HuggingFaceEmbeddings(
        model_name=get_settings().embedding_model,
        model_kwargs={"device": "cpu"},
        encode_kwargs={"normalize_embeddings": True},
    )
