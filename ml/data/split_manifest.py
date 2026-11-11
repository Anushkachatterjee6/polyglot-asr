from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


def split_by_speaker(input_path: Path, train_path: Path, validation_path: Path, validation_ratio: float = 0.1) -> tuple[int, int]:
    records = [json.loads(line) for line in input_path.read_text(encoding="utf-8").splitlines() if line.strip()]
    if not records or any(not record.get("speaker_id") for record in records):
        raise ValueError("Speaker-aware splitting requires speaker_id for every record; no split was created.")
    if not 0 < validation_ratio < 1:
        raise ValueError("validation_ratio must be between zero and one.")
    train, validation = [], []
    for record in records:
        bucket = int(hashlib.sha256(str(record["speaker_id"]).encode()).hexdigest(), 16) % 10_000
        destination = validation if bucket < int(validation_ratio * 10_000) else train
        destination.append({**record, "split": "validation" if destination is validation else "train"})
    if not train or not validation:
        raise ValueError("Split produced an empty partition; adjust the ratio or use official splits.")
    for path, rows in ((train_path, train), (validation_path, validation)):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("".join(json.dumps(row, ensure_ascii=False) + "\n" for row in rows), encoding="utf-8")
    return len(train), len(validation)


def verify_speaker_disjoint(manifests: dict[str, Path]) -> None:
    """Reject any speaker overlap across train, validation, test, or blind test."""
    seen: dict[str, str] = {}
    for split, path in manifests.items():
        for line in path.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            speaker = json.loads(line).get("speaker_id")
            if not speaker:
                raise ValueError(f"{path}: every record needs speaker_id for leakage checking.")
            prior = seen.setdefault(str(speaker), split)
            if prior != split:
                raise ValueError(f"Speaker {speaker!r} appears in both {prior!r} and {split!r}.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Make deterministic, speaker-disjoint development partitions.")
    parser.add_argument("manifest", type=Path)
    parser.add_argument("--train", type=Path, required=True)
    parser.add_argument("--validation", type=Path, required=True)
    parser.add_argument("--validation-ratio", type=float, default=0.1)
    parser.add_argument("--test", type=Path, help="Official test manifest; checked for speaker leakage only.")
    parser.add_argument("--blind-test", type=Path, help="Official blind-test manifest; checked for speaker leakage only.")
    args = parser.parse_args()
    counts = split_by_speaker(args.manifest, args.train, args.validation, args.validation_ratio)
    manifests = {"train": args.train, "validation": args.validation}
    if args.test:
        manifests["test"] = args.test
    if args.blind_test:
        manifests["blind_test"] = args.blind_test
    verify_speaker_disjoint(manifests)
    print(counts)
