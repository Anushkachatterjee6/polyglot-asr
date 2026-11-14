"""Gemini 3.5 Transcribe provider using the official Files and Interactions APIs."""
from __future__ import annotations

from dataclasses import dataclass
import logging
import os
from pathlib import Path
import tempfile
from typing import Any


GEMINI_TRANSCRIBE_MODEL = "gemini-3.5-transcribe"
logger = logging.getLogger(__name__)


class GeminiConfigurationError(RuntimeError):
    """Raised before a request when Gemini has not been configured."""


class GeminiServiceError(RuntimeError):
    """Safe error for a Gemini API failure; never include credentials or audio."""

    def __init__(self, detail: str, status_code: int = 502) -> None:
        super().__init__(detail)
        self.status_code = status_code


@dataclass(frozen=True)
class GeminiTranscription:
    """Raw verbatim Gemini output retained before local optional adaptation."""

    text: str


def _suffix_for(filename: str) -> str:
    suffix = Path(filename).suffix.lower()
    return suffix if suffix else ".audio"


def _status_code(exc: Exception) -> int | None:
    value = getattr(exc, "status_code", None) or getattr(exc, "code", None)
    try:
        status = int(value)
    except (TypeError, ValueError):
        return None
    return status


def _safe_error(stage: str, exc: Exception) -> GeminiServiceError:
    """Classify failures without logging provider bodies, keys, or audio data."""
    status = _status_code(exc)
    error_type = type(exc).__name__
    lowered_type = error_type.casefold()
    lowered_detail = str(exc).casefold()
    diagnostic = f"stage={stage} type={error_type} upstream_status={status if status is not None else 'none'}"
    if "proxy" in lowered_type or "proxy" in lowered_detail:
        logger.warning("Gemini network failure (%s, reason=proxy)", diagnostic)
        return GeminiServiceError(
            "Gemini could not reach the API because the configured network proxy is unavailable.", 503
        )
    if "timeout" in lowered_type or "timeout" in lowered_detail:
        logger.warning("Gemini network failure (%s, reason=timeout)", diagnostic)
        return GeminiServiceError("Gemini transcription timed out. Please try again.", 504)
    if "connect" in lowered_type or "connection" in lowered_detail:
        logger.warning("Gemini network failure (%s, reason=connection)", diagnostic)
        return GeminiServiceError("Gemini could not connect to the API. Check the network connection and try again.", 503)
    if status == 429:
        logger.warning("Gemini service failure (%s, reason=rate_limit)", diagnostic)
        return GeminiServiceError("Gemini transcription is temporarily rate limited. Please try again shortly.", 429)
    if status in {401, 403}:
        logger.warning("Gemini service failure (%s, reason=authentication)", diagnostic)
        return GeminiServiceError("Gemini authentication was rejected. Check the backend API key configuration.", 503)
    if status == 404:
        logger.warning("Gemini service failure (%s, reason=model_unavailable)", diagnostic)
        return GeminiServiceError("The configured Gemini transcription model is unavailable for this API key.", 503)
    if status == 413:
        logger.warning("Gemini service failure (%s, reason=file_too_large)", diagnostic)
        return GeminiServiceError("Gemini rejected this audio file because it is too large.", 413)
    if status == 400:
        logger.warning("Gemini service failure (%s, reason=invalid_audio_or_request)", diagnostic)
        return GeminiServiceError("Gemini could not process this audio file or transcription request.", 422)
    if "validation" in lowered_type:
        logger.error("Gemini SDK request validation failure (%s)", diagnostic)
        return GeminiServiceError("The backend Gemini request is invalid. Check the server logs.", 500)
    logger.error("Gemini provider failure (%s)", diagnostic)
    return GeminiServiceError("Gemini transcription is temporarily unavailable. Please try again.", 502)


def transcribe_audio(
    *,
    api_key: str,
    audio_bytes: bytes,
    filename: str,
    mime_type: str | None,
    vocabulary: list[str],
    use_env_proxy: bool = False,
    timeout_seconds: float = 60,
) -> GeminiTranscription:
    """Upload one audio file, transcribe it verbatim, then delete the remote file."""
    if not api_key:
        raise GeminiConfigurationError(
            "Gemini transcription is not configured. Add GEMINI_API_KEY to backend/.env and restart the backend."
        )
    stage = "temporary_file"
    try:
        from google import genai
        from google.genai import types
    except ImportError as exc:
        raise GeminiConfigurationError(
            "Gemini transcription dependencies are unavailable. Install backend requirements and restart the backend."
        ) from exc

    temporary_path: str | None = None
    uploaded_file: Any | None = None
    client: Any | None = None
    try:
        with tempfile.NamedTemporaryFile(suffix=_suffix_for(filename), delete=False) as temporary_file:
            temporary_file.write(audio_bytes)
            temporary_path = temporary_file.name

        client = genai.Client(
            api_key=api_key,
            http_options={
                "api_version": "v1beta",
                "timeout": int(timeout_seconds * 1000),
                "client_args": {"trust_env": use_env_proxy},
                # The SDK otherwise retries transient errors up to five times.
                # That can turn the configured per-sample timeout into several
                # minutes and leave a benchmark run apparently stuck.  A caller
                # receives one bounded attempt and an explicit safe error.
                "retry_options": {"attempts": 1},
            },
        )
        stage = "files_upload"
        upload_config = types.UploadFileConfig(mime_type=mime_type) if mime_type else None
        uploaded_file = client.files.upload(file=temporary_path, config=upload_config)
        audio_uri = getattr(uploaded_file, "uri", None)
        audio_mime_type = getattr(uploaded_file, "mime_type", None) or mime_type
        if not isinstance(audio_uri, str) or not audio_uri:
            raise GeminiServiceError("Gemini did not return an audio file URI.")
        transcription_config: dict[str, object] = {
            "language_codes": [],
            "mode": {"type": "verbatim"},
        }
        if vocabulary:
            transcription_config["custom_vocabulary"] = vocabulary[:1000]
        stage = "interactions_create"
        interaction = client.interactions.create(
            model=GEMINI_TRANSCRIBE_MODEL,
            input=[{"type": "audio", "uri": audio_uri, "mime_type": audio_mime_type}],
            generation_config={"transcription_config": transcription_config},
        )
        output_text = getattr(interaction, "output_text", None)
        if not isinstance(output_text, str) or not output_text.strip():
            raise GeminiServiceError("Gemini returned no transcription for this audio file.")
        return GeminiTranscription(text=output_text.strip())
    except GeminiServiceError:
        raise
    except Exception as exc:
        raise _safe_error(stage, exc) from exc
    finally:
        if uploaded_file is not None and client is not None:
            try:
                client.files.delete(name=uploaded_file.name)
            except Exception as exc:
                # Cleanup must not hide a completed transcription, but record a
                # safe diagnostic if the temporary remote file could not be
                # removed before the client's request deadline.
                logger.warning("Gemini remote cleanup failed (type=%s)", type(exc).__name__)
        if temporary_path:
            try:
                os.unlink(temporary_path)
            except FileNotFoundError:
                pass
        if client is not None:
            try:
                client.close()
            except Exception:
                pass
