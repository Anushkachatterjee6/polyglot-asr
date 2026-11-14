"""Polyglot ASR service package."""
from __future__ import annotations

from pathlib import Path
import sys


# The reusable ML/data tools live in the repository-level ``ml`` package. When
# Uvicorn is launched from ``backend`` (the documented backend working
# directory), only this directory is on sys.path. Expose the repository source
# root before importing application services; do not duplicate metric code.
for _source_root in (Path(__file__).resolve().parents[2], Path(__file__).resolve().parents[1]):
    if (_source_root / "ml").is_dir() and str(_source_root) not in sys.path:
        sys.path.insert(0, str(_source_root))
        break
