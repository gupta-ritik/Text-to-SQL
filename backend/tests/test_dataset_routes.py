from pathlib import Path

import pandas as pd

from app.api import routes
from app.agent.nodes import validate_plan


def test_internal_dataset_metadata_is_not_listed(tmp_path: Path, monkeypatch):
    dataset_dir = tmp_path / "users" / "scope"
    dataset_dir.mkdir(parents=True)
    (dataset_dir / ".relationships.json").write_text("{}", encoding="utf-8")
    (dataset_dir / "restaurants.csv").write_text("name,rating\nA,4.5\n", encoding="utf-8")

    monkeypatch.setattr(routes, "DATASET_ROOT", tmp_path)
    listed = [
        path.name
        for path in (tmp_path / "users" / "scope").iterdir()
        if routes._is_user_dataset(path)
    ]

    assert listed == ["restaurants.csv"]


def test_excel_preview_includes_all_sheets(tmp_path: Path, monkeypatch):
    workbook = tmp_path / "report.xlsx"
    workbook.write_bytes(b"placeholder")

    monkeypatch.setattr(
        pd,
        "read_excel",
        lambda path, sheet_name=None: {
            "Summary": pd.DataFrame({"Result": ["pass"]}),
            "Details": pd.DataFrame({"Result": ["fail"]}),
        },
    )

    preview = routes._read_dataset_preview(workbook, limit=25)

    assert [sheet["name"] for sheet in preview["sheets"]] == [
        "report_Summary",
        "report_Details",
    ]
    assert preview["sheets"][1]["rows"] == [["fail"]]


def test_plan_accepts_quoted_column_available_in_multiple_tables():
    result = validate_plan({
        "question": "How many rows have column 'Result' equal to 'pass'?",
        "query_plan": {
            "answerable": False,
            "explanation": "Several tables contain Result.",
            "required_tables": [],
            "required_columns": [],
        },
        "retrieved_tables": ["sheet_one", "sheet_two"],
        "retrieved_columns": ["sheet_one.Result", "sheet_two.Result"],
    })

    assert result["plan_valid"] is True
    assert result["query_plan"]["required_tables"] == ["sheet_one", "sheet_two"]
