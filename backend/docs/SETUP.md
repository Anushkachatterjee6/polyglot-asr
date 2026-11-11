# Polyglot ASR backend setup

Requires Python 3.10+ and FFmpeg-compatible audio support for non-WAV files.

```powershell
cd backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
$env:POLYGLOT_DATA_DIR = "data"
uvicorn app.main:app --reload --port 8000
```

Set `VITE_API_BASE_URL=http://localhost:8000` before starting the existing frontend. `/api/transcribe` returns HTTP 503 until `POLYGLOT_MODEL_PATH` points to a trained local XLS-R checkpoint; this avoids a fabricated transcript.

History uses a local SQLite file under `POLYGLOT_DATA_DIR`. It is suitable for one local process only, is not user-authenticated, and should be replaced by deployment-owned storage for multi-user hosting.
