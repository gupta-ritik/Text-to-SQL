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
                    └─ configurable SQL repair attempts (1 by default)

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

## 2. How the application works

Each question follows a controlled pipeline:

1. The user signs in with Google. The frontend stores the Google ID token in
   browser local storage and sends it as a Bearer token to protected API
   routes.
2. The question is normalized and the schema retriever searches the Chroma
   collection for relevant tables, columns, and relationships.
3. The configured LLM generates PostgreSQL SQL and metadata.
4. The deterministic validator checks the statement before it reaches
   PostgreSQL. It rejects write operations, comments, multiple statements,
   unknown tables or columns, and unrestricted `SELECT *` queries.
5. If validation or execution fails, the graph can ask the LLM to repair the
   SQL up to `MAX_SQL_RETRIES` times.
6. The executor returns at most `MAX_RESULT_ROWS` rows. The LLM turns the
   result into a natural-language answer, while the frontend renders the SQL,
   result table, export action, and numeric analytics.

The normal query endpoint waits for the complete graph run. The streaming
endpoint sends Server-Sent Events (SSE) for graph progress and then a final
result event, which the frontend uses to display pipeline progress.

## 3. Features

- Natural-language questions translated into read-only SQL
- Schema retrieval with Chroma and LangGraph orchestration
- CSV upload and dataset selection
- Editable SQL preview with copy and execute actions
- Deterministic SQL validation before every execution
- Automatic result tables and numeric bar visualizations
- Local query history with load, remove, clear, and rerun support
- CSV export for query results
- Optional DeepEval/OpenAI-compatible judge configuration for evaluation

## 4. Authentication setup

Google authentication is required for queries, schema access, SQL execution,
and dataset management. The backend verifies the ID token against
`GOOGLE_CLIENT_ID`; it does not create a separate application account or issue
its own session token.

For local development:

1. Create a Google OAuth web client in Google Cloud Console.
2. Add `http://localhost:3000` to the authorized JavaScript origins.
3. Set the client ID in both the root `.env` and `frontend/.env.local`.
4. Optionally create a reCAPTCHA v2 checkbox site key and secret. If the
   backend secret is empty, reCAPTCHA verification is disabled.

The frontend variables are:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your_google_client_id
NEXT_PUBLIC_RECAPTCHA_SITE_KEY=your_recaptcha_site_key
```

The backend requires:

```env
GOOGLE_CLIENT_ID=your_google_client_id
RECAPTCHA_SECRET_KEY=your_recaptcha_secret_key
```

If Google authentication is not configured, `/api/auth/google` returns HTTP
503 and protected routes return HTTP 401 when no valid Bearer token is sent.

## 5. Quick start with Docker

Docker Compose runs PostgreSQL, the FastAPI backend, and the Next.js frontend
together. From the project root, make sure Docker Desktop is running and run:

```powershell
docker compose up --build
```

Create a root `.env` file before starting the stack. At minimum it must contain
an LLM provider and API key:

```env
LLM_PROVIDER=groq
GROQ_API_KEY=your_groq_api_key
GOOGLE_CLIENT_ID=your_google_client_id
```

Open the application at <http://localhost:3000>. The backend is available at
<http://localhost:8000>, and its readiness endpoint is:

```text
http://localhost:8000/health
```

On the first start, Compose waits for PostgreSQL, seeds the demo tables, and
builds the local Chroma schema index before starting Uvicorn. The embedding
model may take a few minutes to download. Wait until the logs show both
`Database ready.` and `Ingested ... schema documents.` before using the
frontend. Then refresh the browser if it was opened earlier.

To stop the services, press `Ctrl+C`. To run them in the background:

```powershell
docker compose up --build -d
docker compose logs -f
```

The remaining sections describe manual development, dataset usage, and other
project commands.

## 6. Configuration reference

The backend reads environment variables from the root `.env` during manual
development and from the container environment in Docker or Render.

| Variable | Default | Purpose |
| --- | --- | --- |
| `LLM_PROVIDER` | `groq` | `groq` or `openrouter` |
| `GROQ_API_KEY` | empty | Groq credential |
| `GROQ_MODEL` | `llama-3.3-70b-versatile` | Groq model name |
| `OPENROUTER_API_KEY` | empty | OpenRouter credential |
| `OPENROUTER_MODEL` | `meta-llama/llama-3.3-70b-instruct` | OpenRouter model name |
| `DATABASE_URL` | local PostgreSQL URL | SQLAlchemy PostgreSQL connection |
| `GOOGLE_CLIENT_ID` | empty | Google OAuth client used by token verification |
| `RECAPTCHA_SECRET_KEY` | empty | Optional server-side reCAPTCHA verification |
| `CORS_ORIGINS` | local and project origins | Comma-separated browser origins |
| `MAX_SQL_RETRIES` | `1` | Number of SQL repair attempts |
| `MAX_RESULT_ROWS` | `100` | Maximum rows returned to the API |
| `EMBEDDING_PROVIDER` | `huggingface` | Use `hash` for lightweight startup |
| `EMBEDDING_MODEL` | `sentence-transformers/all-MiniLM-L6-v2` | Embedding model |
| `CHROMA_PATH` | `../chroma` | Chroma persistence path |
| `LANGSMITH_TRACING` | `true` | Enable LangSmith tracing |
| `LANGSMITH_API_KEY` | empty | LangSmith credential |
| `LANGSMITH_PROJECT` | `text-to-sql-agent` | LangSmith project name |

For local PostgreSQL, the default Docker Compose credentials are `texttosql`
for the database, user, and password. To change them, set `POSTGRES_DB`,
`POSTGRES_USER`, and `POSTGRES_PASSWORD` in the root `.env`, and keep
`DATABASE_URL` synchronized with those values.

## 7. Deploy the backend to Render and the frontend to Vercel

Deploy the backend first so you have its public URL for the frontend.

### 1. Deploy the backend on Render

This repository includes `render.yaml` for a Render Blueprint deployment.

1. Push the repository to GitHub.
2. In Render, choose **New +** and then **Blueprint**.
3. Select the GitHub repository and apply `render.yaml`.
4. Set `GROQ_API_KEY` when Render asks for the secret value.
5. Set `GOOGLE_CLIENT_ID` and `RECAPTCHA_SECRET_KEY` when Render asks for the
   authentication secrets.
6. Set `CORS_ORIGINS` to the Vercel URL you will use, for example:

    ```text
    https://your-project.vercel.app
    ```

6. Wait for the service health check at `/health` to pass.

The Blueprint creates the Render web service. Enter your Neon pooled connection
URL in the `DATABASE_URL` field when Render prompts for it. The application
already uses SQLAlchemy with the `psycopg` driver, so the Neon URL must start
with `postgresql+psycopg://`:

```text
postgresql+psycopg://neondb_owner:password@your-pooled-host.neon.tech/neondb?sslmode=require&channel_binding=require
```

Copy the URL from Neon with the password visible, then change only the URL
scheme from `postgresql://` to `postgresql+psycopg://`. Do not commit the URL
or expose the password in GitHub.

The backend binds to Render's assigned `PORT` immediately, then seeds the
database and builds the Chroma schema index in the background. The first deploy
can take a few minutes while the embedding model downloads. Wait for the logs
to show `Ingested ... schema documents.` before sending Text-to-SQL queries.

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

   Also add `NEXT_PUBLIC_GOOGLE_CLIENT_ID` and
   `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` in Vercel. Create matching Google OAuth and
   reCAPTCHA v2 checkbox credentials for the deployed frontend domain.

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

## 8. Manual development

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
GOOGLE_CLIENT_ID=your_google_client_id
RECAPTCHA_SECRET_KEY=your_recaptcha_secret_key
CORS_ORIGINS=http://localhost:3000
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

## 9. Example questions

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


## 10. Upload or select your own CSV dataset

The frontend provides a **Dataset** panel. You can upload a new CSV or select
a previously uploaded CSV. The authenticated API stores uploaded files in the
repository-level `datasets/` directory and derives a safe filename from the
original upload name.

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
3. Records the selected file and generated `dataset_*` table.
4. Rebuilds the Schema RAG index in a background task.
5. Makes the dataset available after `/api/datasets/index-status` reports
   `{"status":"ready"}`.

The upload endpoint only accepts files whose names end in `.csv`. The CSV must
be readable by Pandas and should have a header row. Column names become SQL
columns, so use simple, unique names when possible. Selecting a new dataset
replaces the generated table for that file name; it does not delete the demo
tables.

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

## 11. API reference

Except for `/health`, `/api/auth/google`, and `/api/evaluate`, API routes
require:

```http
Authorization: Bearer <Google ID token>
```

### Authentication

`POST /api/auth/google` accepts a Google credential and returns the verified
user profile. `captcha_token` is optional unless `RECAPTCHA_SECRET_KEY` is set.

```json
{
   "credential": "<google-id-token>",
   "captcha_token": "<recaptcha-token>"
}
```

### Query request and response

`POST /api/query` accepts a question between 2 and 2,000 characters:

```json
{"question":"Show the top 5 customers by revenue."}
```

The response contains `sql`, `retrieved_tables`, `data`, `answer`,
`execution_time`, `retry_count`, `error`, and `metadata`. `data` has this
shape:

```json
{
   "columns": ["customer_name", "revenue"],
   "rows": [["Rahul", 2900]],
   "row_count": 1,
   "truncated": false,
   "execution_time": 0.0123
}
```

`POST /api/query/stream` accepts the same request and returns
`text/event-stream`. Each event is either a `progress` event with `step` and
`message`, a `result` event containing the complete query response, or an
`error` event containing `message`.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Check backend readiness |
| `POST` | `/api/query` | Run a natural-language question |
| `POST` | `/api/sql/execute` | Validate and execute edited read-only SQL |
| `GET` | `/api/schema` | Read the current database schema |
| `GET` | `/api/datasets` | List available CSV datasets |
| `POST` | `/api/datasets/upload` | Upload a CSV dataset |
| `POST` | `/api/datasets/select` | Activate a dataset |
| `GET` | `/api/datasets/index-status` | Check schema indexing status |
| `GET` | `/api/datasets/selected` | Read the active dataset and generated table |
| `POST` | `/api/auth/google` | Verify a Google credential |
| `POST` | `/api/query/stream` | Run a query with SSE progress events |
| `POST` | `/api/evaluate` | Return instructions for the offline evaluator |

Interactive API documentation is available at <http://localhost:8000/docs>
when the backend is running.

To execute edited SQL, send a JSON body such as:

```json
{"sql":"SELECT product, SUM(revenue) AS total_revenue FROM dataset_sales_data GROUP BY product ORDER BY total_revenue DESC LIMIT 5"}
```

The response includes the original SQL, the result object, and the validator
message. Invalid SQL returns HTTP 400.

## 12. Evaluation

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

## 13. Tests and observability

Set:

```env
LANGSMITH_TRACING=true
LANGSMITH_API_KEY=...
LANGSMITH_PROJECT=text-to-sql-agent
```

LangChain/LangGraph runs will then be available in LangSmith. The application also records useful run metadata such as provider, model, retrieved tables, SQL, retries and execution time.

Run the backend tests with:

```powershell
cd backend
pytest -q
```

The tests cover CORS configuration and deterministic SQL validation. The full
evaluation runner additionally exercises generated SQL against the evaluation
dataset and may require a working LLM provider.

## 14. Security model and limits

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

The validator is a defense-in-depth control, not a replacement for database
permissions. Use a separate read-only PostgreSQL role, restrict network access
to the database, keep provider credentials outside Git, and configure exact
production CORS origins. Query results are capped by `MAX_RESULT_ROWS`, but
large intermediate database operations can still consume database resources.

## 15. Troubleshooting

### `Failed to fetch` in the frontend

Check that the backend is running, open `/health`, and confirm that
`NEXT_PUBLIC_API_URL` points to the backend. For deployed environments, also
confirm that the exact frontend origin is in `CORS_ORIGINS` and that the
backend has been restarted after changing it.

### Google sign-in fails

Confirm that the same client ID is configured in the frontend and backend, the
frontend origin is registered in Google Cloud, and the browser is loading the
Google Identity Services script. HTTP 503 means `GOOGLE_CLIENT_ID` is missing;
HTTP 401 means the credential could not be verified.

### Queries fail immediately after startup

Wait for `Ingested ... schema documents.` and check
`/api/datasets/index-status` after dataset selection. Also verify the LLM API
key, `DATABASE_URL`, and PostgreSQL health. A running Uvicorn process does not
guarantee that the initial schema index is complete.

### The embedding model is slow or fails in a small container

Set `EMBEDDING_PROVIDER=hash` for a lightweight deterministic embedding
provider, or allocate enough memory for the default Hugging Face model. Re-run
`python -m app.rag.ingest` after changing the provider so the Chroma collection
is rebuilt.

### Dataset uploads disappear after deployment

Uploaded CSVs and the local Chroma directory use the service filesystem. Render
free instances may lose local files during redeploys or restarts. Use a
persistent disk or external object storage for production datasets, and use a
persistent database for the SQL data.

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
