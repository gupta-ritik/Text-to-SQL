from langchain_core.language_models import BaseChatModel
from langchain_groq import ChatGroq
from langchain_openai import ChatOpenAI
from app.config import get_settings


def get_llm(temperature: float = 0) -> BaseChatModel:
    s = get_settings()
    provider = s.llm_provider.lower().strip()

    if provider == "groq":
        if not s.groq_api_key:
            raise RuntimeError("GROQ_API_KEY is not configured.")
        return ChatGroq(
            api_key=s.groq_api_key,
            model=s.groq_model,
            temperature=temperature,
        )

    if provider == "openrouter":
        if not s.openrouter_api_key:
            raise RuntimeError("OPENROUTER_API_KEY is not configured.")
        return ChatOpenAI(
            api_key=s.openrouter_api_key,
            base_url="https://openrouter.ai/api/v1",
            model=s.openrouter_model,
            temperature=temperature,
            default_headers={
                "HTTP-Referer": "http://localhost:3000",
                "X-Title": "Text-to-SQL Agent",
            },
        )

    raise ValueError("LLM_PROVIDER must be 'groq' or 'openrouter'.")
