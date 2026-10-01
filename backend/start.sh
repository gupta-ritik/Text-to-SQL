#!/bin/sh

set -eu

(
  python -m app.database.seed
  python -m app.rag.ingest
) &

exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"