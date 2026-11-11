from __future__ import annotations

from io import BytesIO
import json
import wave

from fastapi.testclient import TestClient

from app.main import app


def valid_wav() -> bytes:
    buffer = BytesIO()
    with wave.open(buffer, "wb") as source:
        source.setnchannels(1)
        source.setsampwidth(2)
        source.setframerate(16_000)
        source.writeframes(b"\x00\x00" * 16)
    return buffer.getvalue()


def test_record_contract_and_validation(tmp_path, monkeypatch):
    monkeypatch.setenv("POLYGLOT_DATA_DIR", str(tmp_path))
    with TestClient(app) as client:
        accepted = client.post("/api/record", files={"audio": ("recording.wav", valid_wav(), "audio/wav")})
        rejected = client.post("/api/record", files={"audio": ("recording.txt", b"text", "text/plain")})
    assert accepted.status_code == 200
    assert set(accepted.json()) == {"id"}
    assert rejected.status_code == 422
    assert "Unsupported audio type" in rejected.json()["detail"]


def test_analyze_language_contract_and_validation(tmp_path, monkeypatch):
    monkeypatch.setenv("POLYGLOT_DATA_DIR", str(tmp_path))
    with TestClient(app) as client:
        valid = client.post("/api/analyze-language", json={"transcript": "आज I'm going to college because मेरा exam है"})
        invalid = client.post("/api/analyze-language", json={"transcript": ""})
    assert valid.status_code == 200
    assert valid.json()["hindiCount"] == 3
    assert valid.json()["englishCount"] == 6
    assert valid.json()["switches"] == 4
    assert invalid.status_code == 422


def test_context_export_and_evaluation_contract_errors(tmp_path, monkeypatch):
    monkeypatch.setenv("POLYGLOT_DATA_DIR", str(tmp_path))
    with TestClient(app) as client:
        context = client.post("/api/context", json={"transcript": "i use python", "domain": "Programming", "vocabulary": []})
        malformed_context = client.post("/api/context", json={"domain": "Programming"})
        text_export = client.post("/api/export", json={"transcript": "hello", "format": "txt"})
        json_export = client.post("/api/export", json={"transcript": "hello", "format": "json"})
        bad_export = client.post("/api/export", json={"transcript": "hello", "format": "srt"})
        evaluation = client.get("/api/evaluation")
    assert context.json() == {"original": "i use python", "adapted": "i use Python"}
    assert malformed_context.status_code == 422
    assert text_export.json() == {"content": "hello", "filename": "polyglot-transcript.txt"}
    assert json.loads(json_export.json()["content"]) == {"transcript": "hello"}
    assert bad_export.status_code == 422
    assert all(metric["value"] is None for metric in evaluation.json()["metrics"])


def test_transcription_validation_and_honest_unavailable_response(tmp_path, monkeypatch):
    monkeypatch.setenv("POLYGLOT_DATA_DIR", str(tmp_path))
    with TestClient(app) as client:
        unavailable = client.post("/api/transcribe", files={"audio": ("sample.wav", valid_wav(), "audio/wav")})
        missing = client.post("/api/transcribe")
        invalid_vocabulary = client.post(
            "/api/transcribe",
            files={"audio": ("sample.wav", valid_wav(), "audio/wav")},
            data={"vocabulary": "{}"},
        )
    assert unavailable.status_code == 503
    assert "not ready" in unavailable.json()["detail"]
    assert missing.status_code == 422
    assert invalid_vocabulary.status_code == 422
