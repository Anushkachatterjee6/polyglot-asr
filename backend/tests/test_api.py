from fastapi.testclient import TestClient
from app.main import app


def test_health_and_model_info(tmp_path, monkeypatch):
    monkeypatch.setenv("POLYGLOT_DATA_DIR", str(tmp_path))
    with TestClient(app) as client:
        assert client.get("/health").json()["ready"] is False
        assert client.get("/api/model-info").json()["status"] == "not-ready"


def test_language_and_export(tmp_path, monkeypatch):
    monkeypatch.setenv("POLYGLOT_DATA_DIR", str(tmp_path))
    with TestClient(app) as client:
        result = client.post("/api/analyze-language", json={"transcript": "मुझे Python चाहिए"})
        assert result.status_code == 200
        assert result.json()["englishCount"] == 1
        exported = client.post("/api/export", json={"transcript": "मुझे Python", "format": "json"})
        assert "मुझे Python" in exported.json()["content"]


def test_transcription_is_honest_when_model_missing(tmp_path, monkeypatch):
    monkeypatch.setenv("POLYGLOT_DATA_DIR", str(tmp_path))
    with TestClient(app) as client:
        result = client.post("/api/transcribe", files={"audio": ("sample.wav", b"RIFF", "audio/wav")})
        assert result.status_code == 503
