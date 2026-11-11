from pathlib import Path
import sys

BACKEND = Path(__file__).resolve().parents[1]
REPOSITORY = BACKEND.parent
for path in (str(BACKEND), str(REPOSITORY)):
    if path not in sys.path:
        sys.path.insert(0, path)
