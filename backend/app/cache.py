from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass
import hashlib
import threading
import time
from typing import Any


@dataclass
class _CacheEntry:
    user_id: str
    value: dict[str, Any]
    expires_at: float


class QueryResponseCache:
    def __init__(self, ttl_seconds: int = 300, max_entries: int = 256):
        self.ttl_seconds = ttl_seconds
        self.max_entries = max_entries
        self._entries: dict[str, _CacheEntry] = {}
        self._lock = threading.Lock()

    @staticmethod
    def key(user_id: str, question: str) -> str:
        normalized = " ".join(question.lower().split())
        return hashlib.sha256(f"{user_id}:{normalized}".encode()).hexdigest()

    def get(self, key: str) -> dict[str, Any] | None:
        now = time.monotonic()
        with self._lock:
            entry = self._entries.get(key)
            if entry is None:
                return None
            if entry.expires_at <= now:
                del self._entries[key]
                return None
            return deepcopy(entry.value)

    def set(self, key: str, user_id: str, value: dict[str, Any]) -> None:
        with self._lock:
            if len(self._entries) >= self.max_entries:
                oldest_key = min(
                    self._entries,
                    key=lambda item: self._entries[item].expires_at,
                )
                del self._entries[oldest_key]
            self._entries[key] = _CacheEntry(
                user_id=user_id,
                value=deepcopy(value),
                expires_at=time.monotonic() + self.ttl_seconds,
            )

    def clear_user(self, user_id: str) -> None:
        with self._lock:
            self._entries = {
                key: entry
                for key, entry in self._entries.items()
                if entry.user_id != user_id
            }


query_response_cache = QueryResponseCache()
