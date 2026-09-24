from langchain_community.embeddings import HuggingFaceEmbeddings
from app.config import get_settings


def get_embeddings():
    return HuggingFaceEmbeddings(
        model_name=get_settings().embedding_model,
        model_kwargs={"device": "cpu"},
        encode_kwargs={"normalize_embeddings": True},
    )
