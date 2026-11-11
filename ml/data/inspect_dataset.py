from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

DEVANAGARI = re.compile(r"[\u0900-\u097F]")
LATIN = re.compile(r"[A-Za-z]")


def inspect_manifest(path: Path) -> dict[str, object]:
    records = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
    durations = [float(record["duration"]) for record in records if isinstance(record.get("duration"), (int, float))]
    distribution = {"devanagari_only": 0, "latin_only": 0, "mixed_script": 0, "other_or_empty": 0}
    for record in records:
        transcript = str(record.get("transcript", ""))
        devanagari, latin = bool(DEVANAGARI.search(transcript)), bool(LATIN.search(transcript))
        key = "mixed_script" if devanagari and latin else "devanagari_only" if devanagari else "latin_only" if latin else "other_or_empty"
        distribution[key] += 1
    sample_rates = sorted({record.get("sample_rate") for record in records if record.get("sample_rate") is not None})
    channels = sorted({record.get("channels") for record in records if record.get("channels") is not None})
    bit_depths = sorted({record.get("sample_width_bits") for record in records if record.get("sample_width_bits") is not None})
    return {"records": len(records), "splits": {split: sum(record.get("split") == split for record in records) for split in sorted({record.get("split") for record in records}, key=str)}, "speakers": len({record.get("speaker_id") for record in records if record.get("speaker_id")}), "audio_metadata": {"sample_rates_hz": sample_rates, "channels": channels, "sample_width_bits": bit_depths}, "language_distribution_by_script": distribution, "duration_seconds": {"total": sum(durations), "mean": sum(durations) / len(durations) if durations else None, "min": min(durations) if durations else None, "max": max(durations) if durations else None}}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate an audit only from an existing manifest.")
    parser.add_argument("manifest", type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    report = inspect_manifest(args.manifest)
    rendered = json.dumps(report, ensure_ascii=False, indent=2)
    if args.output:
        args.output.write_text(rendered + "\n", encoding="utf-8")
    print(rendered)
