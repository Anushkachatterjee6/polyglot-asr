from __future__ import annotations

from io import BytesIO
import json
import wave

from fastapi.testclient import TestClient

from app.core.model_loader import XlsrModel
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
    monkeypatch.setattr(XlsrModel, "transcribe", lambda _self, _audio: "mera Python")
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
        context = client.post("/api/context", json={"transcript": "use python", "domain": "programming", "vocabulary": []})
        assert context.json() == {"original": "use python", "adapted": "use Python"}
        exported = client.post("/api/export", json={"transcript": "hello", "format": "json"})
        assert exported.json()["filename"] == "polyglot-transcript.json"
        assert json.loads(exported.json()["content"]) == {"transcript": "hello"}
        evaluation = client.get("/api/evaluation")
        assert len(evaluation.json()["metrics"]) == 30
        assert all(metric["value"] is None for metric in evaluation.json()["metrics"])
        assert client.post("/api/export", json={"transcript": "hello", "format": "csv"}).status_code == 422
        assert client.post("/api/context", json={"transcript": "", "domain": "", "vocabulary": []}).status_code == 422
        assert client.post("/api/transcribe", files={"audio": ("not-audio.txt", b"content", "text/plain")}).status_code == 422
        assert client.post("/api/transcribe", files={"audio": ("audio.wav", wav_bytes(), "audio/wav")}, data={"vocabulary": "bad json"}).status_code == 422


def test_invalid_evaluation_report_is_not_served_as_results(tmp_path, monkeypatch):
    report = tmp_path / "evaluation.json"
    report.write_text("not-json", encoding="utf-8")
    monkeypatch.setenv("POLYGLOT_DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setenv("POLYGLOT_EVALUATION_PATH", str(report))
    with TestClient(app) as client:
        response = client.get("/api/evaluation")
    assert response.status_code == 503
    assert "invalid" in response.json()["detail"]
