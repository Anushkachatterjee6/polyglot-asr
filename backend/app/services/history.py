from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from app.schemas import TranscriptResult


class HistoryRepository:
    def __init__(self, data_dir: Path) -> None:
        data_dir.mkdir(parents=True, exist_ok=True)
        self.path = data_dir / "history.sqlite3"
        with self._connection() as connection:
            connection.execute("CREATE TABLE IF NOT EXISTS records (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, payload TEXT NOT NULL)")

    def _connection(self) -> sqlite3.Connection:
        return sqlite3.connect(self.path)

    def add(self, result: TranscriptResult) -> None:
        payload = result.model_dump(mode="json")
        with self._connection() as connection:
            connection.execute("INSERT OR REPLACE INTO records VALUES (?, ?, ?)", (result.id, result.createdAt.isoformat() if result.createdAt else "", json.dumps(payload, ensure_ascii=False)))

    def list(self) -> list[TranscriptResult]:
        with self._connection() as connection:
            rows = connection.execute("SELECT payload FROM records ORDER BY created_at DESC").fetchall()
        return [TranscriptResult.model_validate_json(row[0]) for row in rows]

    def set_reference(self, record_id: str, reference: str) -> TranscriptResult | None:
        """Attach an operator-supplied ground truth without altering the raw transcript."""
        with self._connection() as connection:
            row = connection.execute("SELECT payload FROM records WHERE id = ?", (record_id,)).fetchone()
            if row is None:
                return None
            result = TranscriptResult.model_validate_json(row[0]).model_copy(
                update={"referenceTranscript": reference}
            )
            connection.execute(
                "UPDATE records SET payload = ? WHERE id = ?",
                (json.dumps(result.model_dump(mode="json"), ensure_ascii=False), record_id),
            )
        return result
