#!/bin/sh

set -eu

export EMBEDDING_PROVIDER="${EMBEDDING_PROVIDER:-hash}"

(
  python -m app.database.seed
  python -m app.rag.ingest
) &

exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"