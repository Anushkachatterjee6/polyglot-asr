from __future__ import annotations

from io import BytesIO
import json
import wave

from fastapi.testclient import TestClient

from app import main
from app.core.gemini_transcribe import GeminiServiceError, GeminiTranscription
from app.main import app


def wav_bytes() -> bytes:
    buffer = BytesIO()
    with wave.open(buffer, "wb") as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(16_000)
        audio.writeframes(b"\x00\x00" * 160)
    return buffer.getvalue()


def test_transcription_contract_and_history_persistence(tmp_path, monkeypatch):
    monkeypatch.setenv("POLYGLOT_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    monkeypatch.setattr(main, "transcribe_with_gemini", lambda **_: GeminiTranscription("mera Python"))
    with TestClient(app) as client:
        transcription = client.post(
            "/api/transcribe",
            files={"audio": ("sample.wav", wav_bytes(), "audio/wav")},
            data={"domain": "Programming", "vocabulary": json.dumps(["Python"]), "contextual_rescoring": "true"},
        )
        assert transcription.status_code == 200
        body = transcription.json()
        assert set(body) >= {"id", "filename", "transcript", "durationSeconds", "words", "createdAt", "status"}
        assert body["status"] == "completed"
        assert body["durationSeconds"] == 0.01
        assert all(set(word) == {"text", "language"} for word in body["words"])
        history = client.get("/api/history")
    assert history.status_code == 200
    assert [entry["id"] for entry in history.json()] == [body["id"]]


def test_endpoint_contracts_and_request_errors(tmp_path, monkeypatch):
    monkeypatch.setenv("POLYGLOT_DATA_DIR", str(tmp_path))
    with TestClient(app) as client:
        health = client.get("/health")
        assert health.json() == {"status": "ok", "ready": False}
        info = client.get("/api/model-info")
        assert set(info.json()) == {"project", "dataset", "model", "status", "supportedLanguages"}
        context = client.post(
            "/api/context",
            json={
                "transcript": "machine learnin improves inferense",
                "domain": "Machine Learning",
                "vocabulary": ["machine learning", "inference"],
            },
        )
        assert context.json() == {
            "original": "machine learnin improves inferense",
            "adapted": "machine learning improves inference",
        }
        exported = client.post("/api/export", json={"transcript": "hello", "format": "json"})
        assert exported.json()["filename"] == "polyglot-transcript.json"
        assert json.loads(exported.json()["content"]) == {"transcript": "hello"}
        evaluation = client.get("/api/evaluation")
        assert evaluation.json()["status"] == "empty"
        assert evaluation.json()["totals"]["recordings"] == 0
        assert client.post("/api/export", json={"transcript": "hello", "format": "csv"}).status_code == 422
        assert client.post("/api/context", json={"transcript": "", "domain": "", "vocabulary": []}).status_code == 422
        assert client.post("/api/transcribe", files={"audio": ("not-audio.txt", b"content", "text/plain")}).status_code == 422
        assert client.post("/api/transcribe", files={"audio": ("audio.wav", wav_bytes(), "audio/wav")}, data={"vocabulary": "bad json"}).status_code == 422


def test_live_evaluation_ignores_legacy_benchmark_reports(tmp_path, monkeypatch):
    report = tmp_path / "evaluation.json"
    report.write_text("not-json", encoding="utf-8")
    monkeypatch.setenv("POLYGLOT_DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setenv("POLYGLOT_EVALUATION_PATH", str(report))
    with TestClient(app) as client:
        response = client.get("/api/evaluation")
    assert response.status_code == 200
    assert response.json()["status"] == "empty"


def test_gemini_failure_is_returned_safely(tmp_path, monkeypatch):
    monkeypatch.setenv("POLYGLOT_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    def unavailable(**_):
        raise GeminiServiceError("Gemini transcription is temporarily rate limited. Please try again shortly.", 429)

    monkeypatch.setattr(main, "transcribe_with_gemini", unavailable)
    with TestClient(app) as client:
        response = client.post("/api/transcribe", files={"audio": ("recording.wav", wav_bytes(), "audio/wav")})
    assert response.status_code == 429
    assert "rate limited" in response.text
