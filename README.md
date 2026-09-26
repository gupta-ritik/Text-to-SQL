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
SQLAlchemy → PostgreSQL
```

## 1. Requirements

- Docker Desktop (recommended for local setup)
- Python 3.11+ for manual backend development
- Node.js 20+ for manual frontend development
- A Groq or OpenRouter API key
- Optional LangSmith API key
- Optional DeepEval/OpenAI-compatible judge configuration for evaluation

## Quick start with Docker

Docker Compose runs PostgreSQL, the FastAPI backend, and the Next.js frontend
together. From the project root, make sure Docker Desktop is running and run:

```powershell
docker compose up --build
```

The root `.env` file must contain an LLM provider and API key, for example:

```env
LLM_PROVIDER=groq
GROQ_API_KEY=your_groq_api_key
```

Open the application at <http://localhost:3000>. The backend is available at
<http://localhost:8000>, and its readiness endpoint is:

```text
http://localhost:8000/health
```

On the first start, the backend seeds PostgreSQL and builds the local Chroma
schema index. This can take a few minutes while the embedding model loads.
Wait until the Docker logs show `Uvicorn running on http://0.0.0.0:8000` before
using the frontend. Then refresh the browser if it was opened earlier.

To stop the services, press `Ctrl+C`. To run them in the background:

```powershell
docker compose up --build -d
docker compose logs -f
```

The remaining sections describe manual development, dataset usage, and other
project commands.

## Deploy the backend to Render and the frontend to Vercel

Deploy the backend first so you have its public URL for the frontend.

### 1. Deploy the backend on Render

This repository includes `render.yaml` for a Render Blueprint deployment.

1. Push the repository to GitHub.
2. In Render, choose **New +** and then **Blueprint**.
3. Select the GitHub repository and apply `render.yaml`.
4. Set `GROQ_API_KEY` when Render asks for the secret value.
5. Set `CORS_ORIGINS` to the Vercel URL you will use, for example:

    ```text
    https://your-project.vercel.app
    ```

6. Wait for the service health check at `/health` to pass.

The Blueprint creates the Render web service. Enter a PostgreSQL connection URL
in the `DATABASE_URL` field when Render prompts for it. Render database pricing
and free-tier availability can change, so a free external PostgreSQL provider
such as Neon or Supabase can be used:

```text
postgresql+psycopg://user:password@host/database?sslmode=require
```

The backend image seeds the database and builds the Chroma schema index before
starting FastAPI. The first deploy can take a few minutes while the embedding
model downloads.

Copy the deployed backend URL, for example:

```text
https://text-to-sql-backend.onrender.com
```

Verify it in a browser:

```text
https://text-to-sql-backend.onrender.com/health
```

### 2. Deploy the frontend on Vercel

1. In Vercel, choose **Add New Project** and import the same GitHub repository.
2. Set **Root Directory** to `frontend`.
3. Leave the framework as **Next.js**.
4. Add this production environment variable:

    ```text
    NEXT_PUBLIC_API_URL=https://text-to-sql-backend.onrender.com
    ```

5. Deploy the project.

After Vercel gives you the production URL, update the Render
`CORS_ORIGINS` value to that exact URL and redeploy or restart the Render
service. Do not add a trailing slash.

### Deployment notes

- Keep `GROQ_API_KEY`, `OPENROUTER_API_KEY`, and database credentials in the
   Render or Vercel environment settings, never in Git.
- The Render backend can use the free web-service tier. A free PostgreSQL
   provider may be separate from Render; confirm its current limits and sleep or
   expiration policy before using it for production data.
- Render's free service may sleep when idle, so the first request can be slow.
- Render's local filesystem is not permanent on redeploys. Uploaded CSV files
   should be treated as temporary unless a persistent Render disk or external
   storage is configured.
- If the frontend shows `Failed to fetch`, verify the Vercel
   `NEXT_PUBLIC_API_URL`, the Render `/health` endpoint, and the Render
   `CORS_ORIGINS` value.

## Manual development

Use this mode when you want to run PostgreSQL in Docker but run the backend and
frontend directly on your computer. You need Python 3.11+, Node.js 20+, and
PowerShell or a similar terminal.

### 1. Configure the environment

Create or edit `.env` in the project root:

```env
LLM_PROVIDER=groq
GROQ_API_KEY=your_groq_api_key
GROQ_MODEL=llama-3.1-8b-instant
DATABASE_URL=postgresql+psycopg://texttosql:texttosql@localhost:5432/texttosql
MAX_SQL_RETRIES=1
```

For OpenRouter, use these settings instead:

```env
LLM_PROVIDER=openrouter
OPENROUTER_API_KEY=your_openrouter_api_key
OPENROUTER_MODEL=meta-llama/llama-3.3-70b-instruct
```

### 2. Start PostgreSQL

From the project root, start only the database container:

```powershell
docker compose up -d postgres
```

Confirm that PostgreSQL is healthy before continuing:

```powershell
docker compose ps
```

### 3. Install and prepare the backend

Open a new terminal:

```powershell
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

Seed the demo tables and create the local Chroma schema index:

```powershell
python -m app.database.seed
python -m app.rag.ingest
```

The indexing command may take a few minutes the first time while the embedding
model downloads.

### 4. Start the backend

Keep the backend terminal open and run:

```powershell
uvicorn app.main:app --reload --port 8000
```

Check that it is ready at <http://localhost:8000/health> before starting the
frontend.

### 5. Install and start the frontend

Open a second terminal:

```powershell
cd frontend
npm install
copy .env.local.example .env.local
npm run dev
```

The frontend uses `http://localhost:8000` by default. To set it explicitly,
put this in `frontend/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

Open <http://localhost:3000> when the frontend reports that it is ready.

### Manual mode summary

You should have three running processes:

1. PostgreSQL in Docker on port `5432`.
2. FastAPI on port `8000`.
3. Next.js on port `3000`.

Stop the backend and frontend with `Ctrl+C`. Stop PostgreSQL from the project
root with:

```powershell
docker compose stop postgres
```

## Example questions

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

To upload a dataset locally:

1. Open <http://localhost:3000> after the backend is ready.
2. Click **Upload CSV** and choose a `.csv` file.
3. Wait for the upload and **Indexing...** status to finish.
4. Ask questions about the active dataset.

Only CSV files are accepted. If the page shows `Failed to fetch`, check that
the backend is running at <http://localhost:8000/health>, wait for startup
indexing to finish, and refresh the frontend.

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

## Evaluation

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

## Tests

```bash
cd backend
pytest -q
```

The tests include deterministic SQL-security checks and graph/API-level checks that do not require an LLM key.

## Observability

Set:

```env
LANGSMITH_TRACING=true
LANGSMITH_API_KEY=...
LANGSMITH_PROJECT=text-to-sql-agent
```

LangChain/LangGraph runs will then be available in LangSmith. The application also records useful run metadata such as provider, model, retrieved tables, SQL, retries and execution time.

## Security model

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

## Project structure

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
├── docker-compose.yml
├── render.yaml
└── README.md
```

LangSmith is for observability/tracing; DeepEval is for offline/CI evaluation. They are intentionally kept separate in this project.
