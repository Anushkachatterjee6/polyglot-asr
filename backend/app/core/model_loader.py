from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


class ModelUnavailable(RuntimeError):
    pass


@dataclass
class XlsrModel:
    path: Path | None
    processor: object | None = None
    model: object | None = None
    load_error: str | None = None

    @property
    def ready(self) -> bool:
        return self.model is not None and self.processor is not None

    def load(self) -> None:
        if not self.path:
            self.load_error = "POLYGLOT_MODEL_PATH is not configured."
            return
        if not self.path.exists():
            self.load_error = "Configured XLS-R checkpoint directory does not exist."
            return
        try:
            from transformers import AutoModelForCTC, AutoProcessor
            self.processor = AutoProcessor.from_pretrained(str(self.path))
            self.model = AutoModelForCTC.from_pretrained(str(self.path))
            self.model.eval()
        except Exception as exc:  # dependency/checkpoint errors are deliberately not exposed by API
            self.load_error = f"Could not load configured model: {type(exc).__name__}."
            self.processor = self.model = None

    def transcribe(self, audio_bytes: bytes) -> str:
        if not self.ready:
            raise ModelUnavailable("XLS-R model is not ready. Configure a trained checkpoint before transcription.")
        try:
            from io import BytesIO
            import soundfile as sf
            import torch
            samples, sample_rate = sf.read(BytesIO(audio_bytes), dtype="float32", always_2d=False)
            if getattr(samples, "ndim", 1) > 1:
                samples = samples.mean(axis=1)
            encoded = self.processor(samples, sampling_rate=sample_rate, return_tensors="pt", padding=True)
            with torch.no_grad():
                logits = self.model(**encoded).logits
            return self.processor.batch_decode(logits.argmax(dim=-1))[0].strip()
        except Exception as exc:
            raise ModelUnavailable("Could not decode audio or run XLS-R inference in this deployment.") from exc
