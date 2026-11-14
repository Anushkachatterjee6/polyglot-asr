from fastapi.testclient import TestClient
from app.main import app
from app.core.gemini_transcribe import GeminiTranscription


def test_health_and_model_info(tmp_path, monkeypatch):
    monkeypatch.setenv("POLYGLOT_DATA_DIR", str(tmp_path))
    with TestClient(app) as client:
        assert client.get("/health").json()["ready"] is False
        assert client.get("/api/model-info").json()["status"] == "not-configured"


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
        assert "GEMINI_API_KEY" in result.text


def test_consecutive_transcriptions_are_independent_and_saved(tmp_path, monkeypatch):
    """Each upload gets a provider call and reaches history independently."""
    monkeypatch.setenv("POLYGLOT_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    calls: list[str] = []

    def fake_transcribe(**kwargs):
        calls.append(kwargs["filename"])
        return GeminiTranscription(text=f"transcript {len(calls)}")

    monkeypatch.setattr("app.main.transcribe_with_gemini", fake_transcribe)
    with TestClient(app) as client:
        for index in range(3):
            response = client.post(
                "/api/transcribe",
                files={"audio": (f"recording-{index}.webm", b"webm-bytes", "audio/webm")},
            )
            assert response.status_code == 200
            assert response.json()["transcript"] == f"transcript {index + 1}"

        history = client.get("/api/history")
    assert calls == ["recording-0.webm", "recording-1.webm", "recording-2.webm"]
    assert history.status_code == 200
    assert len(history.json()) == 3
