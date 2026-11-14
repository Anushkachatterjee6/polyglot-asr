from __future__ import annotations

from pathlib import Path
import sys
from types import ModuleType, SimpleNamespace

import pytest

from app.core.gemini_transcribe import (
    GEMINI_TRANSCRIBE_MODEL,
    GeminiConfigurationError,
    GeminiServiceError,
    _safe_error,
    transcribe_audio,
)
from app.config import Settings


def install_fake_google_genai(monkeypatch):
    captured: dict[str, object] = {}

    class UploadFileConfig:
        def __init__(self, *, mime_type: str | None = None):
            self.mime_type = mime_type

    class Files:
        def upload(self, *, file: str, config):
            captured["upload_path"] = file
            captured["upload_exists"] = Path(file).exists()
            captured["upload_mime_type"] = config.mime_type if config else None
            return SimpleNamespace(name="files/test-audio", uri="https://files.example/test-audio", mime_type="audio/webm")

        def delete(self, *, name: str):
            captured["deleted_file"] = name

    class Interactions:
        def create(self, **kwargs):
            captured["interaction"] = kwargs
            return SimpleNamespace(output_text="Actually mujhe kal college jaana hai because I have an exam.")

    class Client:
        def __init__(self, *, api_key: str, http_options: dict[str, str]):
            captured["api_key"] = api_key
            captured["http_options"] = http_options
            self.files = Files()
            self.interactions = Interactions()

        def close(self):
            captured["closed"] = True

    google = ModuleType("google")
    genai = ModuleType("google.genai")
    genai.Client = Client
    genai.types = SimpleNamespace(UploadFileConfig=UploadFileConfig)
    google.genai = genai
    monkeypatch.setitem(sys.modules, "google", google)
    monkeypatch.setitem(sys.modules, "google.genai", genai)
    return captured


def test_uses_files_and_interactions_apis_with_verbatim_auto_detection(monkeypatch):
    captured = install_fake_google_genai(monkeypatch)

    result = transcribe_audio(
        api_key="test-key",
        audio_bytes=b"audio-bytes",
        filename="recording.webm",
        mime_type="audio/webm",
        vocabulary=["Polyglot", "Hinglish"],
    )

    assert result.text == "Actually mujhe kal college jaana hai because I have an exam."
    assert captured["api_key"] == "test-key"
    assert captured["http_options"] == {
        "api_version": "v1beta",
        "timeout": 60000,
        "client_args": {"trust_env": False},
        "retry_options": {"attempts": 1},
    }
    assert captured["upload_exists"] is True
    assert captured["upload_mime_type"] == "audio/webm"
    assert captured["deleted_file"] == "files/test-audio"
    assert captured["closed"] is True
    assert not Path(captured["upload_path"]).exists()
    interaction = captured["interaction"]
    assert interaction["model"] == GEMINI_TRANSCRIBE_MODEL
    assert interaction["input"] == [
        {"type": "audio", "uri": "https://files.example/test-audio", "mime_type": "audio/webm"}
    ]
    assert interaction["generation_config"] == {
        "transcription_config": {
            "language_codes": [],
            "mode": {"type": "verbatim"},
            "custom_vocabulary": ["Polyglot", "Hinglish"],
        }
    }


def test_missing_api_key_is_a_configuration_error():
    with pytest.raises(GeminiConfigurationError, match="GEMINI_API_KEY"):
        transcribe_audio(
            api_key="",
            audio_bytes=b"audio-bytes",
            filename="recording.wav",
            mime_type="audio/wav",
            vocabulary=[],
        )


def test_legacy_provider_environment_does_not_enable_a_fallback(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "")
    monkeypatch.setenv("SEAMLESS_INFERENCE_URL", "https://retired.example")
    monkeypatch.setenv("SEAMLESS_API_TOKEN", "retired-token")
    settings = Settings.from_env()
    assert settings.gemini_api_key == ""
    assert not hasattr(settings, "seamless_inference_provider")


def test_timeout_is_bounded_to_a_reasonable_range(monkeypatch):
    monkeypatch.setenv("GEMINI_TIMEOUT_SECONDS", "999")
    assert Settings.from_env().gemini_timeout_seconds == 90
    monkeypatch.setenv("GEMINI_TIMEOUT_SECONDS", "1")
    assert Settings.from_env().gemini_timeout_seconds == 10


def test_default_data_dir_is_anchored_to_backend_not_process_cwd(monkeypatch):
    monkeypatch.delenv("POLYGLOT_DATA_DIR", raising=False)
    settings = Settings.from_env()
    assert settings.data_dir == Path(__file__).resolve().parents[1] / "data"


def test_proxy_failure_has_a_specific_safe_status_and_message():
    class ProxyError(RuntimeError):
        pass

    error = _safe_error("files_upload", ProxyError("proxy address redacted"))
    assert error.status_code == 503
    assert "proxy" in str(error).casefold()
    assert "redacted" not in str(error)


def test_gemini_error_never_includes_provider_exception_text(monkeypatch):
    captured = install_fake_google_genai(monkeypatch)

    class FailingInteractions:
        def create(self, **_):
            error = RuntimeError("credential value must not escape")
            error.status_code = 429
            raise error

    original_client = sys.modules["google.genai"].Client

    class FailingClient(original_client):
        def __init__(self, **kwargs):
            super().__init__(**kwargs)
            self.interactions = FailingInteractions()

    sys.modules["google.genai"].Client = FailingClient
    with pytest.raises(GeminiServiceError, match="rate limited") as caught:
        transcribe_audio(
            api_key="test-key",
            audio_bytes=b"audio-bytes",
            filename="recording.wav",
            mime_type="audio/wav",
            vocabulary=[],
        )
    assert caught.value.status_code == 429
    assert "credential value" not in str(caught.value)
    assert captured["deleted_file"] == "files/test-audio"
