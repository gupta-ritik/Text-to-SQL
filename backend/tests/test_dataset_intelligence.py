from pathlib import Path

import pandas as pd

from app.database.dataset_intelligence import infer_relationships, inspect_dataset, profile_frame


def test_profile_reports_quality_and_column_signals():
    profile = profile_frame(pd.DataFrame({
        "customer_id": [1, 2, 2],
        "revenue": [10.0, None, 20.0],
    }))

    assert profile["rows"] == 3
    assert profile["duplicate_rows"] == 0
    assert profile["missing_cells"] == 1
    assert profile["quality_score"] < 100
    assert profile["columns"][1]["numeric_range"] == {"min": 10.0, "max": 20.0}


def test_relationships_use_column_names_and_value_overlap():
    relationships = infer_relationships([
        {"table_name": "dataset_customers", "frame": pd.DataFrame({"customer_id": [1, 2]})},
        {"table_name": "dataset_orders", "frame": pd.DataFrame({"customer_id": [1, 1, 2]})},
    ])

    assert relationships
    assert relationships[0]["from_column"] == "customer_id"
    assert relationships[0]["to_column"] == "customer_id"


def test_inspect_dataset_supports_csv(tmp_path: Path):
    path = tmp_path / "sales.csv"
    pd.DataFrame({"id": [1], "amount": [12]}).to_csv(path, index=False)

    result = inspect_dataset(path)

    assert result["datasets"][0]["table_name"] == "dataset_sales"
    assert result["datasets"][0]["quality_score"] == 100.0
