from fastapi.testclient import TestClient

from app.main import app


ORIGINS = ("http://localhost:8082", "http://127.0.0.1:8082")


def test_frontend_origins_are_accepted_for_preflight(tmp_path, monkeypatch):
    monkeypatch.setenv("POLYGLOT_DATA_DIR", str(tmp_path))
    with TestClient(app) as client:
        for origin in ORIGINS:
            response = client.options(
                "/api/analyze-language",
                headers={
                    "Origin": origin,
                    "Access-Control-Request-Method": "POST",
                    "Access-Control-Request-Headers": "content-type",
                },
            )
            assert response.status_code == 200
            assert response.headers["access-control-allow-origin"] == origin


def test_language_analysis_contract(tmp_path, monkeypatch):
    monkeypatch.setenv("POLYGLOT_DATA_DIR", str(tmp_path))
    with TestClient(app) as client:
        response = client.post(
            "/api/analyze-language",
            headers={"Origin": "http://localhost:8082"},
            json={"transcript": "Aaj I am going to college because mera exam hai."},
        )
    assert response.status_code == 200
    body = response.json()
    assert set(body) == {"words", "hindiCount", "englishCount", "switches"}
    assert (body["hindiCount"], body["englishCount"], body["switches"]) == (3, 7, 4)
    assert all(set(word) == {"text", "language"} for word in body["words"])


def test_non_model_endpoint_availability(tmp_path, monkeypatch):
    monkeypatch.setenv("POLYGLOT_DATA_DIR", str(tmp_path))
    with TestClient(app) as client:
        assert client.get("/health").status_code == 200
        assert client.post("/api/context", json={"transcript": "use python", "domain": "programming", "vocabulary": []}).status_code == 200
        assert client.get("/api/history").status_code == 200
        assert client.get("/api/model-info").status_code == 200
        assert client.get("/api/evaluation").status_code == 200
        assert client.post("/api/export", json={"transcript": "hello", "format": "txt"}).status_code == 200
        recording = client.post("/api/record", files={"audio": ("recording.wav", b"RIFF", "audio/wav")})
        assert recording.status_code == 200
        assert isinstance(recording.json()["id"], str)
