# Production Text-to-SQL AI Agent

A full-stack Text-to-SQL application built around LangGraph.

## Architecture

```text
Next.js UI
   │
   ▼
FastAPI /api/query
   │
   ▼
LangGraph
 ├─ analyze_question
 ├─ retrieve_schema (RAG / Chroma)
 ├─ generate_sql (Groq or OpenRouter)
 ├─ validate_sql (deterministic)
 ├─ repair_sql ─────┐
 ├─ execute_sql     │
 ├─ process_result  │
 └─ generate_answer │
                    └─ up to 3 repair attempts

LangSmith → tracing/observability
DeepEval  → offline RAG + answer evaluation
SQLAlchemy → SQLite/PostgreSQL
```

## 1. Requirements

- Python 3.11+
- Node.js 20+
- A Groq or OpenRouter API key
- Optional LangSmith API key
- Optional DeepEval/OpenAI-compatible judge configuration for evaluation

## 2. Backend setup

```bash
cd backend
python -m venv .venv

# Windows
.venv\Scripts\activate

# Linux/macOS
# source .venv/bin/activate

pip install -r requirements.txt
copy .env.example .env
```

Edit `.env`:

```env
LLM_PROVIDER=groq
GROQ_API_KEY=your_key
   GROQ_MODEL=llama-3.1-8b-instant
DATABASE_URL=sqlite:///../database/database.db
   MAX_SQL_RETRIES=1
```

If using OpenRouter:

```env
LLM_PROVIDER=openrouter
OPENROUTER_API_KEY=your_key
OPENROUTER_MODEL=meta-llama/llama-3.3-70b-instruct
```

The model names are configurable; use a currently available model from your provider.

For a low-cost deployment, use a free-tier Groq API key with a currently available
small model such as `llama-3.1-8b-instant`, and use a free PostgreSQL provider such
as Neon or Supabase. Set `DATABASE_URL` to the provider's SQLAlchemy URL, for example:

```env
DATABASE_URL=postgresql+psycopg://user:password@host/database?sslmode=require
```

The PostgreSQL driver is included in `backend/requirements.txt`. Set these values in
Render's environment variables; do not commit API keys or database passwords.

## 3. Create the demo database

From `backend/`:

```bash
python -m app.database.seed
```

This creates:

- customers
- products
- orders
- order_items
- employees
- departments

and inserts realistic demo data.

## 4. Build the schema RAG index

```bash
python -m app.rag.ingest
```

The database schema is converted into metadata documents and embedded into a local Chroma collection.

## 5. Run FastAPI

From `backend/`:

```bash
uvicorn app.main:app --reload --port 8000
```

API:
- `POST http://localhost:8000/api/query`
- `GET http://localhost:8000/api/schema`
- `POST http://localhost:8000/api/evaluate`
- `GET http://localhost:8000/health`

## 6. Run frontend

```bash
cd frontend
npm install
copy .env.local.example .env.local
npm run dev
```

Open:

```text
http://localhost:3000
```

Set:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

## 7. Example questions

```text
How many customers are there?
What is the total revenue?
Show the top 5 customers by revenue.
Show revenue by country.
Which products generated the most sales?
Show customer names and their orders.
What was the revenue in January 2025?
Show customers from India who spent more than 50000.
What is the employee salary?
```

The final question is intentionally unsupported if the schema does not contain a salary column; the agent should explain that the requested information is unavailable.


## Upload or select your own CSV dataset

The frontend provides a **Dataset** panel. You can upload a new CSV or select a previously uploaded CSV.

Selecting a dataset automatically:
1. Reads the CSV with Pandas.
2. Loads it into the SQL database as a `dataset_*` table.
3. Rebuilds the Schema RAG index.
4. Makes the dataset available to the LangGraph Text-to-SQL agent.

The included dataset contains 369 rows and these columns:

```text
date, product, category, price, quantity, revenue
```

Example questions:

```text
What is the total revenue?
Show the top 5 products by revenue.
What is the revenue by category?
What is the average product price?
```

## 8. Evaluation

From the project root:

```bash
python evaluation/runner.py
```

The evaluator:
1. Loads the dataset.
2. Runs every question through the LangGraph agent.
3. Records retrieved schema.
4. Records generated SQL.
5. Checks syntax/schema safety.
6. Executes generated and reference SQL.
7. Compares results.
8. Runs DeepEval RAG/answer metrics when configured.
9. Writes `evaluation/reports/latest.json` and `latest.md`.
10. Applies configurable quality thresholds.

## 9. Tests

```bash
cd backend
pytest -q
```

The tests include deterministic SQL-security checks and graph/API-level checks that do not require an LLM key.

## 10. Docker

```bash
docker compose up --build
```

Frontend: `http://localhost:3000`
Backend: `http://localhost:8000`

## 11. Observability

Set:

```env
LANGSMITH_TRACING=true
LANGSMITH_API_KEY=...
LANGSMITH_PROJECT=text-to-sql-agent
```

LangChain/LangGraph runs will then be available in LangSmith. The application also records useful run metadata such as provider, model, retrieved tables, SQL, retries and execution time.

## 12. Security model

The application does not trust the LLM for SQL security. It applies deterministic validation before execution.

Allowed:
- `SELECT`
- `WITH`

Rejected:
- INSERT
- UPDATE
- DELETE
- DROP
- ALTER
- TRUNCATE
- CREATE
- GRANT
- REVOKE
- multiple statements
- SQL comments
- unknown tables/columns
- unrestricted result sets

The demo executor also applies `MAX_RESULT_ROWS`.

For production PostgreSQL, use a dedicated read-only database role in addition to application-level validation.

## 13. Project structure

```text
text-to-sql-agent/
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── agent/
│   │   ├── rag/
│   │   ├── llm/
│   │   ├── database/
│   │   ├── security/
│   │   └── api/
│   ├── tests/
│   └── requirements.txt
├── evaluation/
│   ├── datasets/
│   ├── metrics.py
│   ├── runner.py
│   └── reports/
├── frontend/
├── database/
├── chroma/
├── .env.example
├── docker-compose.yml
└── README.md
```

## 14. Important note

LangSmith is for observability/tracing; DeepEval is for offline/CI evaluation. They are intentionally kept separate in this project.
