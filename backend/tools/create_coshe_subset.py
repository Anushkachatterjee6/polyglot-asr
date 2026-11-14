"""Create a validated, ten-sample CoSHE-500 evaluation ZIP.

This fetches only the first ten rows from the Hugging Face dataset viewer and
only the ten WAV assets referenced by those rows. Transcript text is copied
verbatim from the dataset response; it is never generated or normalised.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
from urllib.request import Request, urlopen
import zipfile


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPOSITORY_ROOT / "backend"))

from app.services.evaluation import validate_manifest  # noqa: E402


ROWS_URL = (
    "https://datasets-server.huggingface.co/rows?"
    "dataset=Trelis%2FCoSHE-500&config=default&split=eval&offset=0&length=10"
)


def download(url: str) -> bytes:
    with urlopen(Request(url, headers={"User-Agent": "Polyglot-ASR-evaluation-prep"}), timeout=60) as response:
        return response.read()


def create_subset(output: Path) -> dict[str, object]:
    payload = json.loads(download(ROWS_URL))
    rows = payload.get("rows", [])
    if len(rows) != 10:
        raise RuntimeError(f"Expected exactly 10 dataset rows, received {len(rows)}.")

    samples: list[dict[str, str]] = []
    audio: list[tuple[str, bytes]] = []
    for position, record in enumerate(rows):
        row = record["row"]
        transcript = row.get("transcription")
        audio_items = row.get("audio")
        if not isinstance(transcript, str) or not transcript or not isinstance(audio_items, list) or len(audio_items) != 1:
            raise RuntimeError(f"Dataset row {position} is missing its exact transcript or audio asset.")
        item = audio_items[0]
        source = item.get("src")
        if not isinstance(source, str):
            raise RuntimeError(f"Dataset row {position} has no downloadable audio URL.")
        filename = f"audio/coshe-eval-{position:03}.wav"
        data = download(source)
        if not data.startswith(b"RIFF"):
            raise RuntimeError(f"Dataset row {position} did not return WAV audio.")
        samples.append({"id": f"coshe-eval-{record['row_idx']}", "audio": filename, "reference": transcript})
        audio.append((filename, data))

    manifest = {
        "source": {"dataset": "Trelis/CoSHE-500", "split": "eval", "row_offset": 0, "samples": 10},
        "samples": samples,
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2))
        for filename, data in audio:
            archive.writestr(filename, data)

    with TemporaryDirectory() as temporary:
        root = Path(temporary)
        with zipfile.ZipFile(output) as archive:
            archive.extractall(root)
        report = validate_manifest(manifest, root)
    if report["errors"]:
        raise RuntimeError("Backend validation failed: " + "; ".join(report["errors"]))
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=REPOSITORY_ROOT / "coshe-500-eval-10.zip")
    arguments = parser.parse_args()
    validation = create_subset(arguments.output)
    print(json.dumps({"output": str(arguments.output), "validation": validation}, ensure_ascii=False))
