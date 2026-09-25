from app.config import get_cors_origins


def test_cors_includes_local_and_vercel_origins():
    origins = get_cors_origins()

    assert "http://localhost:3000" in origins
    assert "https://text-to-sql-rho.vercel.app" in origins
