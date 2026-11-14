# Polyglot ASR backend setup

Requires Python 3.10+ and FFmpeg-compatible audio support for non-WAV files.

```powershell
cd backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
$env:POLYGLOT_DATA_DIR = "data"
py -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8002
```

Set `VITE_API_BASE_URL=http://localhost:8000` before starting the existing frontend. Add a valid `GEMINI_API_KEY` to the ignored `backend/.env` file before transcription; otherwise `/api/transcribe` returns a clear HTTP 503 configuration error. The key is never read by browser code. `VITE_TRANSCRIPTION_TIMEOUT_MS` is optional; it accepts 15,000–120,000 milliseconds and defaults to 70,000. See [GEMINI_TRANSCRIBE.md](./GEMINI_TRANSCRIBE.md).

History uses a local SQLite file under `POLYGLOT_DATA_DIR`. It is suitable for one local process only, is not user-authenticated, and should be replaced by deployment-owned storage for multi-user hosting.
