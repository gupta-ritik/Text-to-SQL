from pathlib import Path

from app.rag import retriever


def test_selected_table_names_uses_user_scoped_path(tmp_path: Path, monkeypatch):
    user_id = "google-user"
    user_dir = tmp_path / "datasets" / "users" / retriever.user_scope(user_id)
    user_dir.mkdir(parents=True)
    (user_dir / ".selected").write_text(
        "restaurants.csv\tdataset_restaurants",
        encoding="utf-8",
    )

    monkeypatch.setattr(
        retriever.Path,
        "resolve",
        lambda _: tmp_path / "backend" / "app" / "rag" / "retriever.py",
    )

    assert retriever._selected_table_names(user_id) == {"dataset_restaurants"}
