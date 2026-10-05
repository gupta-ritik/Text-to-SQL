import time
import uuid
import json
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from pathlib import Path
import re
import shutil
import json

from app.agent.graph import agent_graph
from app.database.schema import get_database_schema, schema_as_text, user_scope
from app.database.executor import execute_sql
from app.database.dataset_intelligence import (
    SUPPORTED_DATASET_EXTENSIONS,
    infer_relationships,
    inspect_dataset,
    read_dataset_frames,
)
from app.security.sql_validator import validate_sql
from app.config import get_settings
from app.security.google_auth import require_google_user, verify_google_credential, verify_recaptcha

router = APIRouter(prefix="/api", tags=["text-to-sql"])


class QueryRequest(BaseModel):
    question: str = Field(min_length=2, max_length=2000)


class SQLRequest(BaseModel):
    sql: str = Field(min_length=1, max_length=20000)


class GoogleAuthRequest(BaseModel):
    credential: str = Field(min_length=20, max_length=10000)
    captcha_token: str = Field(default="", max_length=4000)


@router.post("/auth/google")
def google_auth(req: GoogleAuthRequest):
    verify_recaptcha(req.captcha_token)
    claims = verify_google_credential(req.credential)
    user_id = claims.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Google credential has no stable user ID.")

    return {
        "user": {
            "id": user_id,
            "name": claims.get("name", "Google user"),
            "email": claims.get("email"),
            "picture": claims.get("picture"),
        }
    }


class QueryResponse(BaseModel):
    question: str
    sql: str = ""
    retrieved_tables: list[str] = []
    data: dict = {}
    answer: str
    execution_time: float | None = None
    retry_count: int = 0
    error: str | None = None
    metadata: dict = {}


def _query_input(question: str, thread_id: str, user_id: str) -> tuple[dict, dict]:
    return (
        {"question": question, "user_id": user_id, "retry_count": 0, "metadata": {}},
        {
            "configurable": {"thread_id": thread_id},
            "tags": ["text-to-sql", get_settings().llm_provider],
            "metadata": {"question": question},
        },
    )


def _query_response(question: str, result: dict, started: float) -> QueryResponse:
    return QueryResponse(
        question=question,
        sql=result.get("sql", ""),
        retrieved_tables=result.get("retrieved_tables", []),
        data=result.get("execution_result", {}),
        answer=result.get("final_answer", ""),
        execution_time=result.get("metadata", {}).get(
            "execution_time",
            round(time.perf_counter() - started, 4),
        ),
        retry_count=result.get("retry_count", 0),
        error=(
            result.get("sql_error")
            or result.get("verification_error")
            or result.get("plan_error")
            or None
        ),
        metadata=result.get("metadata", {}),
    )


@router.post("/query", response_model=QueryResponse)
def query(req: QueryRequest, user: dict = Depends(require_google_user)):
    started = time.perf_counter()
    thread_id = str(uuid.uuid4())

    try:
        inputs, config = _query_input(req.question, thread_id, user["id"])
        return _query_response(req.question, agent_graph.invoke(inputs, config=config), started)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/query/stream")
def query_stream(req: QueryRequest, user: dict = Depends(require_google_user)):
    started = time.perf_counter()
    thread_id = str(uuid.uuid4())

    def events():
        state: dict = {}
        node_steps = {
            "analyze_question": (0, "Capturing your question..."),
            "query_planner": (1, "Planning the query..."),
            "retrieve_schema": (2, "Retrieving relevant schema..."),
            "validate_plan": (2, "Checking the plan against the schema..."),
            "repair_plan": (1, "Correcting the query plan..."),
            "generate_sql": (3, "Generating safe SQL..."),
            "validate_sql": (4, "Validating the query..."),
            "repair_sql": (3, "Correcting the SQL query..."),
            "execute_sql": (5, "Executing against your dataset..."),
            "verify_result": (6, "Verifying the result..."),
            "process_result": (6, "Processing query results..."),
            "generate_answer": (7, "Preparing your answer..."),
        }
        try:
            inputs, config = _query_input(req.question, thread_id, user["id"])
            for update in agent_graph.stream(inputs, config=config, stream_mode="updates"):
                for node, node_state in update.items():
                    state.update(node_state or {})
                    step, message = node_steps.get(node, (0, "Working on your request..."))
                    yield f"data: {json.dumps({'type': 'progress', 'step': step, 'message': message})}\n\n"
            response = _query_response(req.question, state, started)
            yield f"data: {json.dumps({'type': 'result', 'result': response.model_dump()}, default=str)}\n\n"
        except Exception as exc:
            yield f"data: {json.dumps({'type': 'error', 'message': str(exc)})}\n\n"

    return StreamingResponse(events(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@router.get("/schema")
def schema(user: dict = Depends(require_google_user)):
    s = get_database_schema(user["id"])
    return {
        "tables": s["tables"],
        "relationships": s["relationships"],
        "text": schema_as_text(s),
    }


@router.post("/sql/execute")
def execute_edited_sql(req: SQLRequest, user: dict = Depends(require_google_user)):
    current_schema = get_database_schema(user["id"])
    allowed_tables = [table["table"] for table in current_schema["tables"]]
    allowed_columns = [
        f"{table['table']}.{column['name']}"
        for table in current_schema["tables"]
        for column in table["columns"]
    ]
    valid, message = validate_sql(req.sql, allowed_tables, allowed_columns)
    if not valid:
        raise HTTPException(status_code=400, detail=message)

    try:
        return {"sql": req.sql, "data": execute_sql(req.sql), "message": message}
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"SQL execution failed: {exc}")



DATASET_ROOT = Path(__file__).resolve().parents[3] / "datasets"
DATASET_ROOT.mkdir(parents=True, exist_ok=True)
DATASET_INDEX_STATUS: dict[str, dict[str, str | None]] = {}


def _user_dataset_dir(user_id: str) -> Path:
    path = DATASET_ROOT / "users" / user_scope(user_id)
    path.mkdir(parents=True, exist_ok=True)
    return path


def _user_index_status(user_id: str) -> dict[str, str | None]:
    return DATASET_INDEX_STATUS.setdefault(
        user_scope(user_id), {"status": "ready", "error": None}
    )
def _safe_dataset_name(name: str) -> str:
    name = Path(name).name
    name = re.sub(r"[^A-Za-z0-9_.-]+", "_", name)
    if not name.lower().endswith(".csv"):
        name += ".csv"
    return name


def _dataset_table_name(name: str, user_id: str | None = None) -> str:
    prefix = f"dataset_{user_scope(user_id)}_" if user_id else "dataset_"
    table_name = prefix + re.sub(
        r"[^A-Za-z0-9_]+", "_", Path(name).stem
    ).lower().strip("_")
    return table_name or "dataset_selected"


def _dataset_summary(path: Path) -> dict:
    intelligence = inspect_dataset(path)
    return {"name": path.name, **intelligence}


def _dataset_descriptor(path: Path, user_id: str | None = None) -> dict:
    """Return file metadata without reading the dataset into memory."""
    return {
        "name": path.name,
        "format": path.suffix.lower().lstrip("."),
        "table_name": _dataset_table_name(path.name, user_id),
        "size_bytes": path.stat().st_size,
    }


@router.get("/datasets")
def list_datasets(user: dict = Depends(require_google_user)):
    dataset_dir = _user_dataset_dir(user["id"])
    datasets = []
    for path in sorted(dataset_dir.iterdir()):
        if path.suffix.lower() not in SUPPORTED_DATASET_EXTENSIONS:
            continue
        try:
            datasets.append(_dataset_descriptor(path, user["id"]))
        except OSError as exc:
            datasets.append({"name": path.name, "error": str(exc)})
    return {"datasets": datasets}


@router.post("/datasets/upload")
async def upload_dataset(
    files: list[UploadFile] | None = File(default=None),
    file: UploadFile | None = File(default=None),
    user: dict = Depends(require_google_user),
):
    uploads = list(files or [])
    if file is not None:
        uploads.append(file)
    if not uploads:
        raise HTTPException(status_code=400, detail="Upload at least one dataset file.")

    uploaded = []
    created_paths = []
    try:
        for upload in uploads:
            original_name = upload.filename or ""
            extension = Path(original_name).suffix.lower()
            if extension not in SUPPORTED_DATASET_EXTENSIONS:
                supported = ", ".join(sorted(SUPPORTED_DATASET_EXTENSIONS))
                raise ValueError(f"Unsupported format {extension or '(none)'}. Supported: {supported}")
            safe_name = _safe_dataset_name(original_name)
            target = _user_dataset_dir(user["id"]) / safe_name
            with target.open("wb") as output:
                shutil.copyfileobj(upload.file, output)
            created_paths.append(target)
            uploaded.append(_dataset_descriptor(target, user["id"]))
    except Exception as exc:
        for path in created_paths:
            path.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail=f"Invalid dataset: {exc}")

    return {
        "message": f"Uploaded {len(uploaded)} dataset(s) successfully.",
        "datasets": uploaded,
        "dataset": uploaded[0],
    }


def _rebuild_dataset_index(user_id: str):
    try:
        from app.rag.ingest import ingest
        ingest()
        _user_index_status(user_id).update({"status": "ready", "error": None})
    except Exception as exc:
        _user_index_status(user_id).update({"status": "error", "error": str(exc)})


def _activate_datasets(user_id: str, safe_names: list[str], targets: list[Path]) -> None:
    try:
        import pandas as pd
        from sqlalchemy import create_engine

        engine = create_engine(get_settings().database_url, future=True)
        selected = []
        relationship_tables = []
        for safe_name, target in zip(safe_names, targets):
            for logical_name, df in read_dataset_frames(target):
                if df.empty:
                    raise ValueError(f"The selected dataset is empty: {safe_name}")
                table_name = _dataset_table_name(logical_name, user_id)
                df.to_sql(table_name, engine, if_exists="replace", index=False)
                relationship_tables.append({"table_name": table_name, "frame": df})
                selected.append({
                    "name": safe_name,
                    "sheet": logical_name if logical_name != target.stem else None,
                    "table_name": table_name,
                    "rows": len(df),
                    "columns": df.columns.tolist(),
                })

        dataset_dir = _user_dataset_dir(user_id)
        (dataset_dir / ".selected").write_text(
            "\n".join(f"{item['name']}\t{item['table_name']}" for item in selected),
            encoding="utf-8",
        )
        (dataset_dir / ".relationships.json").write_text(
            json.dumps(infer_relationships(relationship_tables), default=str),
            encoding="utf-8",
        )
        _rebuild_dataset_index(user_id)
    except Exception as exc:
        _user_index_status(user_id).update({"status": "error", "error": str(exc)})


@router.post("/datasets/select")
def select_dataset(payload: dict, background_tasks: BackgroundTasks, user: dict = Depends(require_google_user)):
    dataset_dir = _user_dataset_dir(user["id"])
    names = payload.get("names") or ([payload.get("name")] if payload.get("name") else [])
    safe_names = [_safe_dataset_name(name) for name in names if name]
    targets = [dataset_dir / name for name in safe_names]
    if not targets or any(not target.exists() for target in targets):
        raise HTTPException(status_code=404, detail="One or more datasets were not found.")

    _user_index_status(user["id"]).update({"status": "indexing", "error": None})
    background_tasks.add_task(_activate_datasets, user["id"], safe_names, targets)
    selected = [_dataset_descriptor(target, user["id"]) for target in targets]
    return {
        "selected_dataset": selected[0]["name"],
        "table_name": selected[0]["table_name"],
        "selected_datasets": selected,
        "index_status": "indexing",
    }


@router.get("/datasets/index-status")
def dataset_index_status(user: dict = Depends(require_google_user)):
    return _user_index_status(user["id"])


@router.get("/datasets/selected")
def selected_dataset(user: dict = Depends(require_google_user)):
    selection_file = _user_dataset_dir(user["id"]) / ".selected"
    if not selection_file.exists():
        return {"selected_dataset": None, "table_name": None}

    lines = [
        x.strip().split("\t", 1)
        for x in selection_file.read_text(encoding="utf-8").splitlines()
        if x.strip()
    ]
    if len(lines) == 2 and len(lines[0]) == 1 and len(lines[1]) == 1:
        lines = [[lines[0][0], lines[1][0]]]
    return {
        "selected_dataset": lines[0][0] if lines else None,
        "table_name": lines[0][1] if lines and len(lines[0]) > 1 else None,
        "selected_datasets": [
            {"name": line[0], "table_name": line[1] if len(line) > 1 else None}
            for line in lines
        ],
    }


@router.post("/evaluate")
def evaluate():
    # Kept intentionally lightweight: the full DeepEval runner lives in evaluation/.
    return {
        "message": "Run `python evaluation/runner.py` from the project root for the offline DeepEval evaluation.",
        "dataset": "evaluation/datasets/text_to_sql.json",
    }
