from __future__ import annotations

import json
from pathlib import Path


def read_manifest(path: Path) -> list[dict[str, object]]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def load_audio(record: dict[str, object], target_rate: int = 16_000):
    import soundfile as sf
    import numpy as np
    audio, rate = sf.read(str(record["audio"]), dtype="float32", always_2d=False)
    if getattr(audio, "ndim", 1) > 1:
        audio = audio.mean(axis=1)
    start, end = record.get("start"), record.get("end")
    if isinstance(start, (int, float)) and isinstance(end, (int, float)):
        audio = audio[round(float(start) * rate):round(float(end) * rate)]
    if len(audio) == 0:
        raise ValueError(f"Empty audio segment for {record.get('id', record['audio'])}")
    if rate != target_rate:
        import torch
        import torchaudio.functional as F
        audio = F.resample(torch.as_tensor(np.asarray(audio)), rate, target_rate).numpy()
    return audio
