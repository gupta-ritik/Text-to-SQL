import json
import re
import sys
from pathlib import Path
from statistics import mean

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
sys.path.insert(0, str(BACKEND))

from app.agent.graph import agent_graph
from app.database.executor import execute_sql
from app.database.seed import seed
from app.rag.ingest import ingest
from app.rag.retriever import retrieve_schema
from app.security.sql_validator import validate_sql
from app.config import get_settings
from evaluation.metrics import run_deepeval


def normalize_sql(sql: str) -> str:
    sql = sql.strip().rstrip(";")
    sql = re.sub(r"\s+", " ", sql).lower()
    return sql


def same_result(a, b) -> bool:
    # Compare JSON-like rows independent of row order when the SQL has no
    # explicit ordering. We compare row multisets through repr sorting.
    return sorted(map(repr, a.get("rows", []))) == sorted(map(repr, b.get("rows", [])))


def run():
    seed()
    ingest()

    dataset = json.loads((ROOT / "evaluation/datasets/text_to_sql.json").read_text())
    cases = []
    exact = syntax = execution = schema = 0
    latencies = []
    retries = []

    for item in dataset:
        question = item["question"]
        reference_sql = item["expected_sql"]
        reference_result = execute_sql(reference_sql)

        result = agent_graph.invoke({
            "question": question,
            "retry_count": 0,
            "metadata": {},
        }, config={"configurable": {"thread_id": f"eval-{abs(hash(question))}"}})

        generated_sql = result.get("sql", "")
        retrieved_tables = result.get("retrieved_tables", [])
        retrieved_columns = result.get("retrieved_columns", [])

        valid, _ = validate_sql(generated_sql, retrieved_tables, retrieved_columns)
        syntax += int(valid)

        if normalize_sql(generated_sql) == normalize_sql(reference_sql):
            exact += 1

        generated_result = result.get("execution_result", {})
        if generated_result and same_result(generated_result, reference_result):
            execution += 1

        # Schema accuracy: all tables referenced by the generated SQL must be
        # within the actual database schema retrieved by the RAG stage.
        schema += int(valid and all(
            t.lower() in {x.lower() for x in retrieved_tables}
            for t in retrieved_tables
        ))

        latency = result.get("metadata", {}).get("execution_time")
        if latency is not None:
            latencies.append(float(latency))
        retries.append(result.get("retry_count", 0))

        cases.append({
            "question": question,
            "answer": result.get("final_answer", ""),
            "generated_sql": generated_sql,
            "expected_sql": reference_sql,
            "retrieved_tables": retrieved_tables,
            "retrieved_context": result.get("schema_context", ""),
            "execution_correct": bool(generated_result and same_result(generated_result, reference_result)),
        })

    n = len(dataset)
    summary = {
        "dataset_size": n,
        "sql_syntax_validity": syntax / n,
        "exact_match": exact / n,
        "execution_accuracy": execution / n,
        "schema_accuracy": schema / n,
        "average_execution_latency_seconds": mean(latencies) if latencies else None,
        "average_retries": mean(retries) if retries else 0,
    }

    deepeval_result = run_deepeval(cases)
    report = {"summary": summary, "deepeval": deepeval_result, "cases": cases}

    reports = ROOT / "evaluation/reports"
    reports.mkdir(parents=True, exist_ok=True)
    (reports / "latest.json").write_text(json.dumps(report, indent=2, default=str))

    md = f"""# Text-to-SQL Evaluation

Dataset size: **{n}**

| Metric | Score |
|---|---:|
| SQL syntax validity | {summary['sql_syntax_validity']:.3f} |
| Exact match | {summary['exact_match']:.3f} |
| Execution accuracy | {summary['execution_accuracy']:.3f} |
| Schema accuracy | {summary['schema_accuracy']:.3f} |
| Avg execution latency | {summary['average_execution_latency_seconds']!s} |
| Avg retries | {summary['average_retries']:.3f} |

DeepEval enabled: **{deepeval_result.get('enabled')}**

DeepEval details:
```text
{deepeval_result}
```
"""
    (reports / "latest.md").write_text(md)

    s = get_settings()
    failed = summary["execution_accuracy"] < s.min_execution_accuracy
    print(md)
    if failed:
        print("Evaluation threshold failed: execution accuracy below configured minimum.")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(run())
