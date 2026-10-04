from __future__ import annotations

from pathlib import Path
from typing import Any
import json
import re

import pandas as pd


SUPPORTED_DATASET_EXTENSIONS = {
    ".csv", ".tsv", ".xlsx", ".xls", ".json", ".jsonl", ".ndjson",
    ".parquet", ".xml", ".yaml", ".yml",
}


def _read_yaml(path: Path) -> pd.DataFrame:
    import yaml

    with path.open("r", encoding="utf-8") as source:
        value = yaml.safe_load(source)
    if isinstance(value, dict):
        value = value.get("data", value)
    return pd.DataFrame(value if isinstance(value, list) else [value])


def read_dataset_frames(path: Path) -> list[tuple[str, pd.DataFrame]]:
    extension = path.suffix.lower()
    if extension == ".csv":
        return [(path.stem, pd.read_csv(path))]
    if extension == ".tsv":
        return [(path.stem, pd.read_csv(path, sep="\t"))]
    if extension in {".xlsx", ".xls"}:
        sheets = pd.read_excel(path, sheet_name=None)
        return [(f"{path.stem}_{sheet}", frame) for sheet, frame in sheets.items()]
    if extension == ".json":
        return [(path.stem, pd.read_json(path))]
    if extension in {".jsonl", ".ndjson"}:
        return [(path.stem, pd.read_json(path, lines=True))]
    if extension == ".parquet":
        return [(path.stem, pd.read_parquet(path))]
    if extension == ".xml":
        return [(path.stem, pd.read_xml(path))]
    if extension in {".yaml", ".yml"}:
        return [(path.stem, _read_yaml(path))]
    raise ValueError(f"Unsupported dataset format: {extension or '(none)'}")


def _json_value(value: Any) -> Any:
    if pd.isna(value):
        return None
    if hasattr(value, "item"):
        return value.item()
    return value


def profile_frame(frame: pd.DataFrame) -> dict[str, Any]:
    columns = []
    quality_penalty = 0.0
    for name in frame.columns:
        series = frame[name]
        missing = int(series.isna().sum())
        unique = int(series.nunique(dropna=True))
        duplicate_ratio = 0.0 if len(frame) == 0 else max(len(frame) - unique, 0) / len(frame)
        inferred = str(series.dtype)
        is_date = pd.api.types.is_datetime64_any_dtype(series)
        if not is_date and series.dtype == object:
            parsed = pd.to_datetime(series, errors="coerce")
            is_date = len(series) > 0 and parsed.notna().mean() >= 0.8
        numeric_range = None
        if pd.api.types.is_numeric_dtype(series):
            numeric_range = {
                "min": _json_value(series.min()),
                "max": _json_value(series.max()),
            }
        columns.append({
            "name": str(name),
            "dtype": inferred,
            "missing": missing,
            "missing_ratio": round(missing / len(frame), 4) if len(frame) else 0,
            "unique": unique,
            "is_categorical": bool(unique <= min(50, max(len(frame) * 0.2, 1))),
            "is_date": bool(is_date),
            "numeric_range": numeric_range,
        })
        quality_penalty += (missing / len(frame) if len(frame) else 0) * 0.5

    duplicate_rows = int(frame.duplicated().sum())
    if len(frame):
        quality_penalty += (duplicate_rows / len(frame)) * 0.5
    quality_score = max(0.0, round((1 - quality_penalty) * 100, 1))
    return {
        "rows": int(len(frame)),
        "columns": columns,
        "duplicate_rows": duplicate_rows,
        "missing_cells": int(frame.isna().sum().sum()),
        "quality_score": quality_score,
    }


def _normalized_column(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", str(name).lower())


def infer_relationships(tables: list[dict[str, Any]]) -> list[dict[str, Any]]:
    relationships = []
    for left_index, left in enumerate(tables):
        left_frame = left["frame"]
        for right in tables[left_index + 1:]:
            right_frame = right["frame"]
            for left_column in left_frame.columns:
                left_values = set(left_frame[left_column].dropna().astype(str).head(5000))
                if not left_values:
                    continue
                for right_column in right_frame.columns:
                    right_values = set(right_frame[right_column].dropna().astype(str).head(5000))
                    if not right_values:
                        continue
                    name_match = _normalized_column(left_column) == _normalized_column(right_column)
                    overlap = len(left_values & right_values) / max(1, min(len(left_values), len(right_values)))
                    uniqueness = left_frame[left_column].nunique(dropna=True) == len(left_values)
                    if (name_match and overlap >= 0.2) or (overlap >= 0.8 and uniqueness):
                        relationships.append({
                            "from_table": left["table_name"],
                            "from_column": str(left_column),
                            "to_table": right["table_name"],
                            "to_column": str(right_column),
                            "confidence": round(min(0.99, 0.5 + overlap * 0.5 + (0.2 if name_match else 0)), 2),
                            "evidence": "column name and value overlap" if name_match else "high value overlap",
                        })
    return relationships


def inspect_dataset(path: Path) -> dict[str, Any]:
    frames = read_dataset_frames(path)
    tables = []
    summaries = []
    for logical_name, frame in frames:
        table_name = "dataset_" + re.sub(r"[^A-Za-z0-9_]+", "_", logical_name).lower().strip("_")
        table_name = table_name or "dataset_selected"
        summary = profile_frame(frame)
        summaries.append({
            "name": path.name,
            "sheet": logical_name if len(frames) > 1 else None,
            "format": path.suffix.lower().lstrip("."),
            "table_name": table_name,
            **summary,
        })
        tables.append({"table_name": table_name, "frame": frame})
    return {"datasets": summaries, "relationships": infer_relationships(tables)}


def json_safe(value: Any) -> Any:
    return json.loads(json.dumps(value, default=str))
