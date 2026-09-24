import time
import uuid
from fastapi import APIRouter, BackgroundTasks, HTTPException, UploadFile, File
from pydantic import BaseModel, Field
from pathlib import Path
import re
import shutil

from app.agent.graph import agent_graph
from app.database.schema import get_database_schema, schema_as_text
from app.config import get_settings

router = APIRouter(prefix="/api", tags=["text-to-sql"])


class QueryRequest(BaseModel):
    question: str = Field(min_length=2, max_length=2000)


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


@router.post("/query", response_model=QueryResponse)
def query(req: QueryRequest):
    started = time.perf_counter()
    thread_id = str(uuid.uuid4())

    try:
        result = agent_graph.invoke(
            {
                "question": req.question,
                "retry_count": 0,
                "metadata": {},
            },
            config={
                "configurable": {"thread_id": thread_id},
                "tags": ["text-to-sql", get_settings().llm_provider],
                "metadata": {"question": req.question},
            },
        )

        return QueryResponse(
            question=req.question,
            sql=result.get("sql", ""),
            retrieved_tables=result.get("retrieved_tables", []),
            data=result.get("execution_result", {}),
            answer=result.get("final_answer", ""),
            execution_time=result.get("metadata", {}).get(
                "execution_time",
                round(time.perf_counter() - started, 4),
            ),
            retry_count=result.get("retry_count", 0),
            error=result.get("sql_error") or None,
            metadata=result.get("metadata", {}),
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/schema")
def schema():
    s = get_database_schema()
    return {
        "tables": s["tables"],
        "relationships": s["relationships"],
        "text": schema_as_text(s),
    }



DATASET_DIR = Path(__file__).resolve().parents[3] / "datasets"
DATASET_DIR.mkdir(parents=True, exist_ok=True)
DATASET_INDEX_STATUS = {"status": "ready", "error": None}


def _safe_dataset_name(name: str) -> str:
    name = Path(name).name
    name = re.sub(r"[^A-Za-z0-9_.-]+", "_", name)
    if not name.lower().endswith(".csv"):
        name += ".csv"
    return name


@router.get("/datasets")
def list_datasets():
    datasets = []
    for path in sorted(DATASET_DIR.glob("*.csv")):
        try:
            import pandas as pd
            sample = pd.read_csv(path, nrows=5)
            with path.open("r", encoding="utf-8", errors="ignore") as f:
                rows = max(sum(1 for _ in f) - 1, 0)
            datasets.append({
                "name": path.name,
                "rows": rows,
                "columns": sample.columns.tolist(),
            })
        except Exception as exc:
            datasets.append({"name": path.name, "error": str(exc)})
    return {"datasets": datasets}


@router.post("/datasets/upload")
async def upload_dataset(file: UploadFile = File(...)):
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV datasets are supported.")

    safe_name = _safe_dataset_name(file.filename)
    target = DATASET_DIR / safe_name
    with target.open("wb") as output:
        shutil.copyfileobj(file.file, output)

    try:
        import pandas as pd
        sample = pd.read_csv(target, nrows=5)
    except Exception as exc:
        target.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail=f"Invalid CSV: {exc}")

    return {
        "message": "Dataset uploaded successfully.",
        "dataset": {
            "name": safe_name,
            "rows": None,
            "columns": sample.columns.tolist(),
        },
    }


def _rebuild_dataset_index():
    try:
        from app.rag.ingest import ingest
        ingest()
        DATASET_INDEX_STATUS.update({"status": "ready", "error": None})
    except Exception as exc:
        DATASET_INDEX_STATUS.update({"status": "error", "error": str(exc)})


@router.post("/datasets/select")
def select_dataset(payload: dict, background_tasks: BackgroundTasks):
    name = payload.get("name", "")
    safe_name = _safe_dataset_name(name)
    target = DATASET_DIR / safe_name
    if not target.exists():
        raise HTTPException(status_code=404, detail="Dataset not found.")

    try:
        import pandas as pd
        from sqlalchemy import create_engine

        df = pd.read_csv(target)
        if df.empty:
            raise ValueError("The selected CSV is empty.")

        table_name = "dataset_" + re.sub(
            r"[^A-Za-z0-9_]+", "_", Path(safe_name).stem
        ).lower().strip("_")
        table_name = table_name or "dataset_selected"

        engine = create_engine(get_settings().database_url, future=True)
        df.to_sql(table_name, engine, if_exists="replace", index=False)

        (DATASET_DIR / ".selected").write_text(
            f"{safe_name}\n{table_name}", encoding="utf-8"
        )

        DATASET_INDEX_STATUS.update({"status": "indexing", "error": None})
        background_tasks.add_task(_rebuild_dataset_index)

        return {
            "selected_dataset": safe_name,
            "table_name": table_name,
            "rows": len(df),
            "columns": df.columns.tolist(),
            "index_status": "indexing",
        }
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Could not activate dataset: {exc}")


@router.get("/datasets/index-status")
def dataset_index_status():
    return DATASET_INDEX_STATUS


@router.get("/datasets/selected")
def selected_dataset():
    selection_file = DATASET_DIR / ".selected"
    if not selection_file.exists():
        return {"selected_dataset": None, "table_name": None}

    lines = [
        x.strip()
        for x in selection_file.read_text(encoding="utf-8").splitlines()
        if x.strip()
    ]
    return {
        "selected_dataset": lines[0] if lines else None,
        "table_name": lines[1] if len(lines) > 1 else None,
    }


@router.post("/evaluate")
def evaluate():
    # Kept intentionally lightweight: the full DeepEval runner lives in evaluation/.
    return {
        "message": "Run `python evaluation/runner.py` from the project root for the offline DeepEval evaluation.",
        "dataset": "evaluation/datasets/text_to_sql.json",
    }
