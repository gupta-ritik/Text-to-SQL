FROM python:3.11-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY tests ./tests

ENV PYTHONUNBUFFERED=1
EXPOSE 8000
CMD ["sh", "-c", "python -m app.database.seed && python -m app.rag.ingest & uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
