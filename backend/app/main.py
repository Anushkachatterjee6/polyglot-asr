from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from datetime import datetime, timezone
import json
from pathlib import Path
import uuid
from threading import Lock
from time import perf_counter

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, PlainTextResponse

from app.config import Settings
from app.core.audio_processing import validate_upload, wav_duration_seconds
from app.core.gemini_transcribe import (
    GeminiConfigurationError,
    GeminiServiceError,
    transcribe_audio as transcribe_with_gemini,
)
from app.schemas import (
    ContextRequest,
    ContextResponse,
    AnalyticsResponse,
    EvaluationResponse,
    EvaluationRunRequest,
    ExportRequest,
    ExportResponse,
    HealthResponse,
    LanguageAnalysisResponse,
    LanguageRequest,
    ModelInfoResponse,
    ReferenceTranscriptRequest,
    RecordingResponse,
    TranscriptResult,
)
from app.services.contextual_adaptation import adapt_transcript
from app.services.history import HistoryRepository
from app.services.language_analysis import analyze_transcript
from app.services.live_analytics import build_live_analytics
from app.services.evaluation import EXPERIMENTS, load_dataset, run_experiment, save_dataset


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = Settings.from_env()
    app.state.settings = settings
    app.state.history = HistoryRepository(settings.data_dir)
    app.state.evaluation_runs = {}
    app.state.evaluation_run_lock = Lock()
    yield


app = FastAPI(title="Polyglot ASR", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=Settings.from_env().cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "OPTIONS"],
    allow_headers=["Accept", "Authorization", "Content-Type", "Origin", "X-Requested-With"],
)


@app.exception_handler(ValueError)
async def invalid_value(_: Request, exc: ValueError):
    return JSONResponse(status_code=422, content={"detail": str(exc)})


@app.exception_handler(GeminiConfigurationError)
async def gemini_configuration_error(_: Request, exc: GeminiConfigurationError):
    return PlainTextResponse(str(exc), status_code=503)


@app.exception_handler(GeminiServiceError)
async def gemini_service_error(_: Request, exc: GeminiServiceError):
    return PlainTextResponse(str(exc), status_code=exc.status_code)


@app.get("/health", response_model=HealthResponse)
def health(request: Request):
    return {"status": "ok", "ready": bool(request.app.state.settings.gemini_api_key)}


@app.post("/api/transcribe", response_model=TranscriptResult, response_model_exclude_none=True)
async def transcribe(
    request: Request,
    audio: UploadFile = File(...),
    domain: str = Form(""),
    vocabulary: str = Form("[]"),
    contextual_rescoring: str = Form("true"),
):
    raw = await audio.read()
    settings: Settings = request.app.state.settings
    validate_upload(audio.filename, audio.content_type, len(raw), settings.max_upload_bytes)
    try:
        terms = json.loads(vocabulary)
        if not isinstance(terms, list) or not all(isinstance(item, str) for item in terms):
            raise ValueError
    except (json.JSONDecodeError, ValueError):
        raise HTTPException(422, "vocabulary must be a JSON string array.")

    audio_duration = wav_duration_seconds(raw)
    started = perf_counter()
    # The Gemini client enforces this deadline on its own HTTP calls. Wrapping a
    # thread-pool task in asyncio.wait_for does not cancel a running sync SDK
    # request; it can leave the caller waiting until the worker returns.
    try:
        gemini_result = await run_in_threadpool(
            transcribe_with_gemini,
            api_key=settings.gemini_api_key,
            audio_bytes=raw,
            filename=audio.filename or "audio",
            mime_type=audio.content_type,
            vocabulary=terms,
            use_env_proxy=settings.gemini_use_env_proxy,
            timeout_seconds=settings.gemini_timeout_seconds,
        )
    except (GeminiConfigurationError, GeminiServiceError) as exc:
        request.app.state.history.add(TranscriptResult(
            id=str(uuid.uuid4()), filename=audio.filename or "audio", transcript="",
            durationSeconds=audio_duration, processingSeconds=perf_counter() - started,
            provider="Google Gemini 3.5 Transcribe", createdAt=datetime.now(timezone.utc),
            error=str(exc), status="failed",
        ))
        raise

    # `transcript` is Gemini's raw verbatim output. Context adaptation remains a
    # separate optional field so research evaluation can distinguish both texts.
    transcript = gemini_result.text
    words, _, _, _ = analyze_transcript(transcript)
    adapted = adapt_transcript(transcript, domain, terms) if contextual_rescoring.casefold() == "true" else None
    result = TranscriptResult(
        id=str(uuid.uuid4()),
        filename=audio.filename or "audio",
        transcript=transcript,
        contextualTranscript=adapted if adapted != transcript else None,
        durationSeconds=audio_duration,
        words=words,
        createdAt=datetime.now(timezone.utc),
        processingSeconds=perf_counter() - started,
        provider="Google Gemini 3.5 Transcribe",
        detectedLanguage=("hi-en" if {word.language for word in words} >= {"hi", "en"}
                          else words[0].language if words and len({word.language for word in words}) == 1 else None),
    )
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


@app.patch("/api/history/{record_id}/reference", response_model=TranscriptResult, response_model_exclude_none=True)
def update_reference(record_id: str, body: ReferenceTranscriptRequest, request: Request):
    record = request.app.state.history.set_reference(record_id, body.referenceTranscript.strip())
    if record is None:
        raise HTTPException(404, "Transcription record not found.")
    return record


@app.get("/api/evaluation", response_model=AnalyticsResponse)
def live_evaluation(request: Request):
    """Live analytics only: no batch upload, transcription, or Gemini call."""
    return build_live_analytics(request.app.state.history.list())


@app.get("/api/model-info", response_model=ModelInfoResponse)
def model_info(request: Request):
    configured = bool(request.app.state.settings.gemini_api_key)
    return {
        "project": "Polyglot ASR",
        "dataset": "MUCS 2021 Subtask 2 Hindi-English",
        "model": "Google Gemini 3.5 Transcribe",
        "status": "configured" if configured else "not-configured",
        "supportedLanguages": ["Hindi", "English", "Tamil"],
    }


# Legacy benchmark helpers are intentionally not registered as API routes.
def evaluation(request: Request):
    path: Path | None = request.app.state.settings.evaluation_path
    if path and path.exists():
        try:
            return EvaluationResponse.model_validate_json(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError, ValueError) as exc:
            raise HTTPException(503, "Evaluation results are unavailable because the saved report is invalid.") from exc
    saved_path = request.app.state.settings.data_dir / "evaluation-results.json"
    if saved_path.is_file():
        try:
            return EvaluationResponse.model_validate_json(saved_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError, ValueError) as exc:
            raise HTTPException(503, "Evaluation results are unavailable because the saved report is invalid.") from exc
    loaded = load_dataset(request.app.state.settings.data_dir)
    metrics = [
        {"name": name, "value": None, "unit": unit, "experiment": experiment}
        for experiment in ["E0", "E1", "E2", "E3", "E4", "E5"]
        for name, unit in [("WER", "%"), ("CER", "%"), ("LID", "%"), ("Switch Boundary F1", "%"), ("RTF", "x")]
    ]
    return {
        "status": "ready-to-run" if loaded else "awaiting-dataset",
        "dataset": ({"samples": len(loaded[0]["samples"]), "status": "validated"} if loaded else None),
        "metrics": metrics,
        "experiments": [
            {"name": item, "WER": None, "CER": None, "LID": None, "SwitchF1": None, "RTF": None}
            for item, label in EXPERIMENTS.items()
            for item in [f"{item} · {label}"]
        ],
    }


# No benchmark dataset-upload route: analytics is driven by history only.
async def upload_evaluation_dataset(request: Request, dataset: UploadFile = File(...)):
    if not (dataset.filename or "").casefold().endswith(".zip"):
        raise HTTPException(422, "Upload a ZIP containing manifest.json or manifest.csv and the referenced audio files.")
    payload = await dataset.read()
    if not payload:
        raise HTTPException(422, "Benchmark dataset ZIP is empty.")
    if len(payload) > request.app.state.settings.max_upload_bytes:
        raise HTTPException(422, "Benchmark dataset ZIP exceeds the upload limit.")
    try:
        report = save_dataset(payload, request.app.state.settings.data_dir)
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        raise HTTPException(422, f"Benchmark dataset is invalid: {exc}") from exc
    return {"status": "validated", **report}


def _evaluation_placeholder(*, run_id: str, experiment: str, samples: int) -> dict:
    return {
        "status": "running", "runId": run_id,
        "dataset": {"samples": samples, "completed": 0, "failed": 0, "status": "running"},
        "progress": {"completed": 0, "total": samples, "failed": 0, "currentSampleId": None},
        "metrics": [
            {"name": name, "value": None, "unit": unit, "experiment": experiment}
            for name, unit in [("WER", "%"), ("CER", "%"), ("LID", "%"), ("Switch Boundary F1", "%"), ("RTF", "x")]
        ],
        "experiments": [], "details": [], "normalization": None, "error": None,
    }


# No batch evaluation route: this helper is retained only for research artifacts.
async def run_evaluation(request: Request, body: EvaluationRunRequest):
    settings: Settings = request.app.state.settings
    loaded = load_dataset(settings.data_dir)
    if loaded is None:
        raise HTTPException(422, "Awaiting dataset. Upload a validated benchmark ZIP first.")
    if not settings.gemini_api_key:
        raise HTTPException(503, "Gemini transcription is not configured. Add GEMINI_API_KEY to backend/.env and restart the backend.")
    def matches_experiment(item: dict) -> bool:
        pair = str(item.get("language_pair", item.get("languagePair", ""))).casefold()
        return body.experiment not in {"E3", "E4"} or ("hi" in pair if body.experiment == "E3" else "ta" in pair)

    samples = [item for item in loaded[0]["samples"] if matches_experiment(item)]
    if not samples:
        raise HTTPException(422, f"{body.experiment} has no matching annotated samples in this benchmark.")
    run_id = str(uuid.uuid4())
    initial = _evaluation_placeholder(run_id=run_id, experiment=body.experiment, samples=len(samples))
    lock: Lock = request.app.state.evaluation_run_lock
    with lock:
        if any(run.get("status") == "running" for run in request.app.state.evaluation_runs.values()):
            raise HTTPException(409, "An evaluation is already running. Wait for it to finish before starting another run.")
        request.app.state.evaluation_runs[run_id] = initial

    def update(progress: dict) -> None:
        with lock:
            request.app.state.evaluation_runs[run_id] = progress

    async def execute() -> None:
        try:
            result = await run_in_threadpool(
                run_experiment,
                data_dir=settings.data_dir,
                experiment=body.experiment,
                api_key=settings.gemini_api_key,
                timeout_seconds=settings.gemini_timeout_seconds,
                overall_timeout_seconds=settings.evaluation_timeout_seconds,
                use_env_proxy=settings.gemini_use_env_proxy,
                run_id=run_id,
                progress_callback=update,
            )
        except Exception as exc:
            result = _evaluation_placeholder(run_id=run_id, experiment=body.experiment, samples=len(samples))
            result["status"] = "failed"
            result["error"] = str(exc) if isinstance(exc, ValueError) else "Evaluation failed before any result could be calculated."
        update(result)

    asyncio.create_task(execute())
    return initial


# No batch run-status route.
def evaluation_run_status(request: Request, run_id: str):
    lock: Lock = request.app.state.evaluation_run_lock
    with lock:
        result = request.app.state.evaluation_runs.get(run_id)
        if result is not None:
            return result
    snapshot = request.app.state.settings.data_dir / "evaluation-runs" / f"{run_id}.json"
    try:
        if snapshot.is_file():
            return EvaluationResponse.model_validate_json(snapshot.read_text(encoding="utf-8"))
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        raise HTTPException(503, "The saved evaluation run is unavailable.") from exc
    raise HTTPException(404, "Evaluation run not found.")


@app.post("/api/export", response_model=ExportResponse)
def export(body: ExportRequest):
    if body.format == "txt":
        return {"content": body.transcript, "filename": "polyglot-transcript.txt"}
    return {
        "content": json.dumps({"transcript": body.transcript}, ensure_ascii=False, indent=2),
        "filename": "polyglot-transcript.json",
    }
