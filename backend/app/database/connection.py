from functools import lru_cache

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from app.config import get_settings


@lru_cache(maxsize=1)
def get_engine() -> Engine:
    url = get_settings().database_url
    connect_args = {"check_same_thread": False} if url.startswith("sqlite") else {}
    return create_engine(
        url,
        future=True,
        pool_pre_ping=True,
        pool_recycle=1800,
        connect_args=connect_args,
    )
