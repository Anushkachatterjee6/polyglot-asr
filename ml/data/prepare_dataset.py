"""Build a validated utterance manifest from MUCS Subtask 2 data.

The original release is Kaldi-style: ``wav.scp``, ``segments``, ``text`` and
``utt2spk`` describe sentence segments cut from long 16 kHz WAV recordings.
An already-segmented JSON export may also be used when it carries equivalent
audio, transcript, utterance ID and speaker metadata.
"""
from __future__ import annotations

import argparse
from dataclasses import asdict, dataclass, field
import json
from pathlib import Path
import unicodedata
import wave
from collections import defaultdict


@dataclass
class ManifestReport:
    records_written: int = 0
    missing_audio: list[str] = field(default_factory=list)
    missing_transcript: list[str] = field(default_factory=list)
    duplicate_recordings: list[str] = field(default_factory=list)
    invalid_audio: list[str] = field(default_factory=list)
    inconsistent_annotations: list[str] = field(default_factory=list)

    def as_dict(self) -> dict[str, object]:
        data = asdict(self)
        data["valid"] = not any(data[key] for key in data if key != "records_written")
        return data


def normalize_transcript(text: str) -> str:
    """Retain Devanagari, Latin/Romanized Hindi, and code-switching tokens."""
    return " ".join(unicodedata.normalize("NFC", text).strip().split())


def _read_kaldi_table(path: Path) -> dict[str, str]:
    table: dict[str, str] = {}
    for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip():
            continue
        key, separator, value = line.partition(" ")
        if not separator or not key or not value.strip():
            raise ValueError(f"{path}:{number} must contain an ID and a value.")
        if key in table:
            raise ValueError(f"Duplicate ID {key!r} in {path}.")
        table[key] = value.strip()
    return table


def _safe_audio_path(dataset_root: Path, value: str) -> Path | None:
    if value.endswith("|"):
        return None  # Never execute Kaldi pipe commands from an annotation file.
    candidate = Path(value)
    path = candidate if candidate.is_absolute() else dataset_root / candidate
    try:
        path.resolve().relative_to(dataset_root.resolve())
    except ValueError:
        return None
    return path.resolve()


def _audio_metadata(path: Path) -> tuple[float, int, int | None, int]:
    if path.suffix.casefold() == ".wav":
        with wave.open(str(path), "rb") as source:
            if source.getframerate() <= 0 or source.getnframes() < 0 or source.getnchannels() <= 0:
                raise wave.Error("invalid WAV metadata")
            return source.getnframes() / source.getframerate(), source.getframerate(), source.getsampwidth() * 8, source.getnchannels()
    try:
        import soundfile as sf
        info = sf.info(str(path))
        if info.samplerate <= 0 or info.frames < 0:
            raise ValueError("invalid audio metadata")
        return info.frames / info.samplerate, info.samplerate, None, info.channels
    except ImportError as exc:
        raise ValueError("soundfile is required to inspect non-WAV audio") from exc


def _write_records(records: list[dict[str, object]], output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text("".join(json.dumps(item, ensure_ascii=False) + "\n" for item in records), encoding="utf-8")


def build_kaldi_manifest(dataset_root: Path, kaldi_dir: Path, output: Path, split: str) -> ManifestReport:
    required = {name: kaldi_dir / name for name in ("wav.scp", "segments", "text", "utt2spk")}
    missing = [name for name, path in required.items() if not path.is_file()]
    if missing:
        raise ValueError(f"Kaldi directory is missing required files: {', '.join(missing)}")
    wavs, text, speakers = (_read_kaldi_table(required[name]) for name in ("wav.scp", "text", "utt2spk"))
    report, records, seen, seen_segments, referenced_recordings = ManifestReport(), [], set(), set(), set()
    for number, line in enumerate(required["segments"].read_text(encoding="utf-8").splitlines(), 1):
        fields = line.split()
        if len(fields) != 4:
            report.inconsistent_annotations.append(f"segments:{number}: expected utt recording start end")
            continue
        utt_id, recording_id, start_raw, end_raw = fields
        referenced_recordings.add(recording_id)
        if utt_id in seen:
            report.duplicate_recordings.append(utt_id)
            continue
        seen.add(utt_id)
        segment_identity = (recording_id, start_raw, end_raw)
        if segment_identity in seen_segments:
            report.duplicate_recordings.append(utt_id)
            continue
        seen_segments.add(segment_identity)
        transcript, speaker_id = text.get(utt_id, ""), speakers.get(utt_id)
        if not normalize_transcript(transcript):
            report.missing_transcript.append(utt_id)
            continue
        if not speaker_id:
            report.inconsistent_annotations.append(f"{utt_id}: missing utt2spk entry")
            continue
        audio_value = wavs.get(recording_id)
        path = _safe_audio_path(dataset_root, audio_value) if audio_value else None
        if not path or not path.is_file():
            report.missing_audio.append(f"{utt_id}:{recording_id}")
            continue
        try:
            start, end = float(start_raw), float(end_raw)
            duration, sample_rate, sample_width_bits, channels = _audio_metadata(path)
            if sample_rate != 16_000 or (sample_width_bits is not None and sample_width_bits != 16):
                raise ValueError(f"expected 16 kHz/16-bit audio, found {sample_rate} Hz/{sample_width_bits}-bit")
            if start < 0 or end <= start or end > duration + 0.02:
                raise ValueError("segment time outside recording")
        except (ValueError, wave.Error, OSError) as exc:
            report.invalid_audio.append(f"{utt_id}: {exc}")
            continue
        records.append({"id": utt_id, "audio": str(path), "start": start, "end": end, "duration": end - start, "sample_rate": sample_rate, "sample_width_bits": sample_width_bits, "channels": channels, "transcript": normalize_transcript(transcript), "speaker_id": speaker_id, "split": split})
    extra = (set(text) | set(speakers)) - seen
    report.inconsistent_annotations.extend(f"unsegmented annotation: {utt_id}" for utt_id in sorted(extra))
    report.inconsistent_annotations.extend(f"unreferenced wav.scp recording: {recording}" for recording in sorted(set(wavs) - referenced_recordings))
    spk2utt = kaldi_dir / "spk2utt"
    if spk2utt.is_file():
        inverse: dict[str, set[str]] = defaultdict(set)
        for number, line in enumerate(spk2utt.read_text(encoding="utf-8").splitlines(), 1):
            fields = line.split()
            if len(fields) < 2:
                report.inconsistent_annotations.append(f"spk2utt:{number}: expected speaker and one or more utterances")
                continue
            inverse[fields[0]].update(fields[1:])
        expected: dict[str, set[str]] = defaultdict(set)
        for utt_id, speaker in speakers.items():
            expected[speaker].add(utt_id)
        for speaker in sorted(set(inverse) | set(expected)):
            if inverse.get(speaker, set()) != expected.get(speaker, set()):
                report.inconsistent_annotations.append(f"spk2utt mismatch for speaker: {speaker}")
    report.records_written = len(records)
    _write_records(records, output)
    return report


def build_json_manifest(dataset_root: Path, annotations: Path, output: Path, split: str) -> ManifestReport:
    source = json.loads(annotations.read_text(encoding="utf-8"))
    items = source.get("items", source) if isinstance(source, dict) else source
    if not isinstance(items, list):
        raise ValueError("Annotation JSON must be a list or contain an 'items' list.")
    report, records, seen_ids, seen_audio = ManifestReport(), [], set(), set()
    for index, item in enumerate(items):
        if not isinstance(item, dict):
            report.inconsistent_annotations.append(f"item {index}: expected object")
            continue
        audio_value = item.get("audio", item.get("path", item.get("file_name")))
        transcript = item.get("transcript", item.get("text", item.get("sentence")))
        utt_id = str(item.get("utt_id", item.get("id", f"item-{index}")))
        speaker_id = item.get("speaker_id", item.get("speaker"))
        if utt_id in seen_ids:
            report.duplicate_recordings.append(utt_id)
            continue
        seen_ids.add(utt_id)
        if not isinstance(transcript, str) or not normalize_transcript(transcript):
            report.missing_transcript.append(utt_id)
            continue
        if not isinstance(speaker_id, str) or not speaker_id.strip():
            report.inconsistent_annotations.append(f"{utt_id}: missing speaker_id")
            continue
        path = _safe_audio_path(dataset_root, audio_value) if isinstance(audio_value, str) else None
        if not path or not path.is_file():
            report.missing_audio.append(utt_id)
            continue
        try:
            full_duration, sample_rate, sample_width_bits, channels = _audio_metadata(path)
            if sample_rate != 16_000 or (sample_width_bits is not None and sample_width_bits != 16):
                raise ValueError(f"expected 16 kHz/16-bit audio, found {sample_rate} Hz/{sample_width_bits}-bit")
            start, end = float(item.get("start", 0)), float(item.get("end", full_duration))
            if start < 0 or end <= start or end > full_duration + 0.02:
                raise ValueError("segment time outside recording")
        except (ValueError, wave.Error, OSError) as exc:
            report.invalid_audio.append(f"{utt_id}: {exc}")
            continue
        identity = (str(path), start, end)
        if identity in seen_audio:
            report.duplicate_recordings.append(utt_id)
            continue
        seen_audio.add(identity)
        records.append({"id": utt_id, "audio": str(path), "start": start, "end": end, "duration": end - start, "sample_rate": sample_rate, "sample_width_bits": sample_width_bits, "channels": channels, "transcript": normalize_transcript(transcript), "speaker_id": speaker_id, "split": str(item.get("split", split))})
    report.records_written = len(records)
    _write_records(records, output)
    return report


def build_manifest(dataset_root: Path, annotations: Path, output: Path, split: str = "train") -> ManifestReport:
    return build_json_manifest(dataset_root, annotations, output, split)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Build a validated MUCS Hindi-English JSONL manifest.")
    parser.add_argument("--dataset-root", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--split", choices=("train", "validation", "test", "blind_test"), required=True)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--kaldi-dir", type=Path)
    source.add_argument("--annotations", type=Path)
    args = parser.parse_args()
    report = build_kaldi_manifest(args.dataset_root, args.kaldi_dir, args.output, args.split) if args.kaldi_dir else build_json_manifest(args.dataset_root, args.annotations, args.output, args.split)
    print(json.dumps(report.as_dict(), ensure_ascii=False, indent=2))
