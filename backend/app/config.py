import os
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


def normalize_origin(origin: str) -> str:
    value = (origin or "").strip()
    if not value:
        return ""
    return value.rstrip("/")


def get_cors_origins() -> list[str]:
    configured = os.getenv("CORS_ORIGINS", "")
    origins = [normalize_origin(item) for item in configured.split(",") if normalize_origin(item)]
    defaults = [
        "http://localhost:3000",
        "https://text-to-sql-rho.vercel.app",
        "https://text-to-sql-rho.onrender.com",
    ]
    for origin in defaults:
        if origin not in origins:
            origins.append(origin)
    return origins


class Settings(BaseSettings):
    llm_provider: str = "groq"
    groq_api_key: str = ""
    groq_model: str = "llama-3.3-70b-versatile"
    openrouter_api_key: str = ""
    openrouter_model: str = "meta-llama/llama-3.3-70b-instruct"

    database_url: str = "sqlite:///../database/database.db"

    langsmith_tracing: bool = True
    langsmith_api_key: str = ""
    langsmith_project: str = "text-to-sql-agent"

    vector_db: str = "chroma"
    schema_top_k: int = 5
    embedding_model: str = "sentence-transformers/all-MiniLM-L6-v2"
    chroma_path: str = "../chroma"
    chroma_collection: str = "schema_metadata"

    max_sql_retries: int = 1
    max_result_rows: int = 100

    min_execution_accuracy: float = 0.85
    min_context_relevancy: float = 0.80
    min_faithfulness: float = 0.85
    deepeval_model: str = "gpt-4.1-mini"

    cors_origins: str = "http://localhost:3000,https://text-to-sql-rho.vercel.app,https://text-to-sql-rho.onrender.com"

    model_config = SettingsConfigDict(env_file="../.env", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()
