FROM python:3.11-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY tests ./tests
COPY start.sh ./start.sh

ENV PYTHONUNBUFFERED=1
EXPOSE 8000
ENTRYPOINT ["sh", "./start.sh"]
