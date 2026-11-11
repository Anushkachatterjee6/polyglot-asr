from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import datetime, timezone
import json
from pathlib import Path
import uuid

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import Settings
from app.core.audio_processing import validate_upload, wav_duration_seconds
from app.core.model_loader import ModelUnavailable, XlsrModel
from app.schemas import (
    ContextRequest,
    ContextResponse,
    EvaluationResponse,
    ExportRequest,
    ExportResponse,
    HealthResponse,
    LanguageAnalysisResponse,
    LanguageRequest,
    ModelInfoResponse,
    RecordingResponse,
    TranscriptResult,
)
from app.services.contextual_adaptation import adapt_transcript
from app.services.history import HistoryRepository
from app.services.language_analysis import analyze_transcript


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = Settings.from_env()
    app.state.settings = settings
    app.state.history = HistoryRepository(settings.data_dir)
    app.state.model = XlsrModel(settings.model_path)
    app.state.model.load()
    yield


app = FastAPI(title="Polyglot ASR", version="0.1.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=Settings.from_env().cors_origins, allow_credentials=False, allow_methods=["*"], allow_headers=["*"])


@app.exception_handler(ValueError)
async def invalid_value(_: Request, exc: ValueError):
    return JSONResponse(status_code=422, content={"detail": str(exc)})


@app.get("/health", response_model=HealthResponse)
def health(request: Request):
    model: XlsrModel = request.app.state.model
    return {"status": "ok", "ready": model.ready}


@app.post("/api/transcribe", response_model=TranscriptResult, response_model_exclude_none=True)
async def transcribe(request: Request, audio: UploadFile = File(...), domain: str = Form(""), vocabulary: str = Form("[]"), contextual_rescoring: str = Form("true")):
    raw = await audio.read()
    settings: Settings = request.app.state.settings
    validate_upload(audio.filename, audio.content_type, len(raw), settings.max_upload_bytes)
    try:
        terms = json.loads(vocabulary)
        if not isinstance(terms, list) or not all(isinstance(item, str) for item in terms):
            raise ValueError
    except (json.JSONDecodeError, ValueError):
        raise HTTPException(422, "vocabulary must be a JSON string array.")
    model: XlsrModel = request.app.state.model
    try:
        transcript = model.transcribe(raw)
    except ModelUnavailable as exc:
        raise HTTPException(503, str(exc)) from exc
    words, _, _, _ = analyze_transcript(transcript)
    adapted = adapt_transcript(transcript, domain, terms) if contextual_rescoring.casefold() == "true" else None
    result = TranscriptResult(id=str(uuid.uuid4()), filename=audio.filename or "audio", transcript=transcript, contextualTranscript=adapted if adapted != transcript else None, durationSeconds=wav_duration_seconds(raw), words=words, createdAt=datetime.now(timezone.utc))
    request.app.state.history.add(result)
    return result


@app.post("/api/record", response_model=RecordingResponse)
async def record(request: Request, audio: UploadFile = File(...)):
    raw = await audio.read()
    validate_upload(audio.filename, audio.content_type, len(raw), request.app.state.settings.max_upload_bytes)
    return {"id": str(uuid.uuid4())}


@app.post("/api/context", response_model=ContextResponse)
def context(body: ContextRequest):
    return {"original": body.transcript, "adapted": adapt_transcript(body.transcript, body.domain, body.vocabulary)}


@app.post("/api/analyze-language", response_model=LanguageAnalysisResponse, response_model_exclude_none=True)
def analyze_language(body: LanguageRequest):
    words, hindi, english, switches = analyze_transcript(body.transcript)
    return {"words": words, "hindiCount": hindi, "englishCount": english, "switches": switches}


@app.get("/api/history", response_model=list[TranscriptResult], response_model_exclude_none=True)
def history(request: Request):
    return request.app.state.history.list()


@app.get("/api/model-info", response_model=ModelInfoResponse)
def model_info(request: Request):
    model: XlsrModel = request.app.state.model
    return {"project": "Polyglot ASR", "dataset": "MUCS 2021 Subtask 2 Hindi-English", "model": "XLS-R 300M + CTC", "status": "ready" if model.ready else "not-ready", "supportedLanguages": ["Hindi", "English"]}


@app.get("/api/evaluation", response_model=EvaluationResponse)
def evaluation(request: Request):
    path: Path | None = request.app.state.settings.evaluation_path
    if path and path.exists():
        try:
            return EvaluationResponse.model_validate_json(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError, ValueError) as exc:
            raise HTTPException(503, "Evaluation results are unavailable because the saved report is invalid.") from exc
    metrics = [{"name": name, "value": None, "unit": unit, "experiment": experiment} for experiment in ["E0", "E1", "E2", "E3", "E4", "E5"] for name, unit in [("WER", "%"), ("CER", "%"), ("LID", "%"), ("Switch Boundary F1", "%"), ("RTF", "x")]]
    return {"metrics": metrics, "experiments": [{"name": item, "WER": None, "CER": None, "LID": None, "SwitchF1": None, "RTF": None} for item in ["E0", "E1", "E2", "E3", "E4", "E5"]]}


@app.post("/api/export", response_model=ExportResponse)
def export(body: ExportRequest):
    if body.format == "txt":
        return {"content": body.transcript, "filename": "polyglot-transcript.txt"}
    return {"content": json.dumps({"transcript": body.transcript}, ensure_ascii=False, indent=2), "filename": "polyglot-transcript.json"}
