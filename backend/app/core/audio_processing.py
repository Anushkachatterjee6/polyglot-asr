from __future__ import annotations

from io import BytesIO
import wave

SUPPORTED_CONTENT_TYPES = {"audio/wav", "audio/x-wav", "audio/mpeg", "audio/mp3", "audio/webm", "audio/ogg", "audio/mp4"}


def wav_duration_seconds(data: bytes) -> float | None:
    try:
        with wave.open(BytesIO(data)) as wav:
            return wav.getnframes() / wav.getframerate()
    except (wave.Error, EOFError):
        return None


def validate_upload(filename: str | None, content_type: str | None, size: int, max_size: int) -> None:
    if not filename:
        raise ValueError("Audio filename is required.")
    if size == 0:
        raise ValueError("Audio file is empty.")
    if size > max_size:
        raise ValueError(f"Audio exceeds the {max_size // 1024 // 1024} MB upload limit.")
    extension = filename.rsplit(".", 1)[-1].casefold() if "." in filename else ""
    if content_type not in SUPPORTED_CONTENT_TYPES and extension not in {"wav", "mp3", "webm", "ogg", "m4a"}:
        raise ValueError("Unsupported audio type. Upload WAV, MP3, WebM, OGG, or M4A audio.")
