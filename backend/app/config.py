from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import os


def _load_local_env() -> None:
    """Load backend/.env without overriding values supplied by the host."""
    env_path = Path(__file__).resolve().parents[1] / ".env"
    if not env_path.is_file():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip())


@dataclass(frozen=True)
class Settings:
    data_dir: Path
    evaluation_path: Path | None
    cors_origins: list[str]
    gemini_api_key: str
    gemini_timeout_seconds: float
    evaluation_timeout_seconds: float
    gemini_use_env_proxy: bool
    max_upload_bytes: int = 50 * 1024 * 1024

    @classmethod
    def from_env(cls) -> "Settings":
        _load_local_env()
        backend_root = Path(__file__).resolve().parents[1]
        configured_data = os.getenv("POLYGLOT_DATA_DIR", "").strip()
        # A server may be launched from either the repository root or
        # backend/. Keep uploaded benchmarks and history in one deterministic
        # location unless the operator explicitly provides an absolute path.
        root = Path(configured_data) if configured_data else backend_root / "data"
        evaluation = os.getenv("POLYGLOT_EVALUATION_PATH", "").strip()
        evaluation_path = Path(evaluation) if evaluation else None
        if evaluation_path is not None and not evaluation_path.is_absolute():
            evaluation_path = backend_root / evaluation_path
        origins = [value.strip() for value in os.getenv(
            "POLYGLOT_CORS_ORIGINS",
            "http://127.0.0.1:5175",
        ).split(",") if value.strip()]
        api_key = os.getenv("GEMINI_API_KEY", "").strip()
        try:
            timeout_seconds = float(os.getenv("GEMINI_TIMEOUT_SECONDS", "60"))
        except ValueError:
            timeout_seconds = 60.0
        # Keep a failed provider request bounded. The Gemini client receives this
        # deadline directly, so it can close its own HTTP request and clean up.
        timeout_seconds = min(max(timeout_seconds, 10.0), 90.0)
        try:
            evaluation_timeout_seconds = float(os.getenv("EVALUATION_TIMEOUT_SECONDS", "300"))
        except ValueError:
            evaluation_timeout_seconds = 300.0
        # This bounds an entire benchmark run. Individual Gemini calls retain
        # their own shorter deadline above.
        evaluation_timeout_seconds = min(max(evaluation_timeout_seconds, 30.0), 1800.0)
        use_env_proxy = os.getenv("GEMINI_USE_ENV_PROXY", "false").strip().casefold() in {"1", "true", "yes"}
        return cls(
            root,
            evaluation_path,
            origins,
            api_key,
            timeout_seconds,
            evaluation_timeout_seconds,
            use_env_proxy,
        )
