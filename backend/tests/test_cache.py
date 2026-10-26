from app.cache import QueryResponseCache


def test_cache_expires_entries():
    cache = QueryResponseCache(ttl_seconds=0, max_entries=2)
    key = cache.key("user-1", "What is the total?")
    cache.set(key, "user-1", {"answer": "42"})

    assert cache.get(key) is None


def test_cache_invalidation_is_scoped_to_user():
    cache = QueryResponseCache(ttl_seconds=60, max_entries=4)
    first_key = cache.key("user-1", "first")
    second_key = cache.key("user-2", "second")
    cache.set(first_key, "user-1", {"answer": "one"})
    cache.set(second_key, "user-2", {"answer": "two"})

    cache.clear_user("user-1")

    assert cache.get(first_key) is None
    assert cache.get(second_key) == {"answer": "two"}
