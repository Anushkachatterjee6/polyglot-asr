from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import os


@dataclass(frozen=True)
class Settings:
    model_path: Path | None
    data_dir: Path
    evaluation_path: Path | None
    cors_origins: list[str]
    max_upload_bytes: int = 50 * 1024 * 1024

    @classmethod
    def from_env(cls) -> "Settings":
        root = Path(os.getenv("POLYGLOT_DATA_DIR", "data"))
        model = os.getenv("POLYGLOT_MODEL_PATH", "").strip()
        evaluation = os.getenv("POLYGLOT_EVALUATION_PATH", "").strip()
        origins = [value.strip() for value in os.getenv(
            "POLYGLOT_CORS_ORIGINS",
            "http://localhost:3000,http://127.0.0.1:3000,"
            "http://localhost:5173,http://127.0.0.1:5173,"
            "http://localhost:8082,http://127.0.0.1:8082",
        ).split(",") if value.strip()]
        return cls(Path(model) if model else None, root, Path(evaluation) if evaluation else None, origins)
