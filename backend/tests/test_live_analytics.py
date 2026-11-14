from __future__ import annotations

from datetime import datetime, timezone

from fastapi.testclient import TestClient

from app.core.gemini_transcribe import GeminiServiceError, GeminiTranscription
from app.main import app
from app.schemas import TranscriptResult, TranscriptWord
from app.services.live_analytics import build_live_analytics


def record(**changes):
    base = TranscriptResult(
        id="one", filename="one.wav", transcript="Aaj I study", durationSeconds=2,
        processingSeconds=1, provider="Google Gemini 3.5 Transcribe",
        createdAt=datetime(2026, 11, 14, tzinfo=timezone.utc),
        words=[TranscriptWord(text="Aaj", language="hi"), TranscriptWord(text="I", language="en"), TranscriptWord(text="study", language="en")],
    )
    return base.model_copy(update=changes)


def test_empty_history_has_no_invented_metrics():
    result = build_live_analytics([])
    assert result["status"] == "empty"
    assert result["totals"]["wer"] is None
    assert result["totals"]["recordings"] == 0


def test_multiple_records_include_failures_and_reference_accuracy():
    completed = record(referenceTranscript="Aaj I study")
    failed = record(id="two", transcript="", status="failed", error="rate limited", processingSeconds=3, durationSeconds=None)
    result = build_live_analytics([completed, failed])
    assert result["totals"]["recordings"] == 2
    assert result["totals"]["successful"] == 1
    assert result["totals"]["failed"] == 1
    assert result["totals"]["wer"] == 0
    assert result["totals"]["cer"] == 0
    assert result["totals"]["referencedRecordings"] == 1
    assert result["codeSwitching"]["hindiEnglish"] == 1
    assert result["totals"]["wordAccuracy"] == 1


def test_missing_metadata_is_graceful():
    result = build_live_analytics([record(durationSeconds=None, processingSeconds=None, words=None)])
    assert result["totals"]["averageAudioSeconds"] is None
    assert result["totals"]["realTimeFactor"] is None
    assert result["totals"]["wer"] is None


def test_language_distribution_reclassifies_historical_words_and_keeps_unknown():
    historical = record(
        transcript="Actually mujhe kal college jaana hai because I have an exam qzxv",
        words=[TranscriptWord(text="Actually", language="hi")],
    )
    result = build_live_analytics([historical])
    counts = {item["language"]: item["count"] for item in result["languageDistribution"]}
    assert counts == {"hi": 4, "en": 7, "other": 0, "unknown": 1}


def test_proxy_metrics_require_multiple_context_adjustments():
    records = [record(id=str(index), transcript="machine learnin", contextualTranscript="machine learning") for index in range(3)]
    result = build_live_analytics(records)
    assert result["totals"]["estimatedWer"] is not None
    assert result["totals"]["estimatedCer"] is not None
    assert result["totals"]["estimatedWordAccuracy"] is not None


def test_history_reference_endpoint_and_live_analytics(tmp_path, monkeypatch):
    monkeypatch.setenv("POLYGLOT_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    monkeypatch.setattr("app.main.transcribe_with_gemini", lambda **_: GeminiTranscription(text="hello world"))
    with TestClient(app) as client:
        made = client.post("/api/transcribe", files={"audio": ("sample.wav", b"RIFF", "audio/wav")})
        assert made.status_code == 200
        updated = client.patch(f"/api/history/{made.json()['id']}/reference", json={"referenceTranscript": "hello world"})
        analytics = client.get("/api/evaluation")
    assert updated.status_code == 200
    assert analytics.json()["totals"]["wer"] == 0
    assert analytics.json()["totals"]["cer"] == 0


def test_failed_transcription_is_persisted(tmp_path, monkeypatch):
    monkeypatch.setenv("POLYGLOT_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    monkeypatch.setattr("app.main.transcribe_with_gemini", lambda **_: (_ for _ in ()).throw(GeminiServiceError("rate limited", 429)))
    with TestClient(app) as client:
        assert client.post("/api/transcribe", files={"audio": ("sample.wav", b"RIFF", "audio/wav")}).status_code == 429
        analytics = client.get("/api/evaluation")
    assert analytics.json()["totals"]["failed"] == 1
