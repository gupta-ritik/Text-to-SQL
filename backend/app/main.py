import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router
from app.config import get_cors_origins, get_settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    s = get_settings()
    os.environ.setdefault("LANGSMITH_TRACING", str(s.langsmith_tracing).lower())
    if s.langsmith_api_key:
        os.environ.setdefault("LANGSMITH_API_KEY", s.langsmith_api_key)
    os.environ.setdefault("LANGSMITH_PROJECT", s.langsmith_project)
    yield


app = FastAPI(
    title="Text-to-SQL AI Agent",
    version="1.0.0",
    description="LangGraph Text-to-SQL agent with schema RAG, SQL security, LangSmith and DeepEval.",
    lifespan=lifespan,
)

settings = get_settings()
origins = get_cors_origins()
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins or ["http://localhost:3000"],
    allow_origin_regex=r"https://[a-z0-9-]+\.(vercel\.app|onrender\.com)",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)


@app.get("/health")
def health():
    return {"status": "ok", "service": "text-to-sql-agent"}
