from __future__ import annotations

from io import BytesIO
import json
from pathlib import Path
import wave

import pytest

from ml.data.inspect_dataset import inspect_manifest
from ml.data.prepare_dataset import build_json_manifest, build_kaldi_manifest, normalize_transcript
from ml.data.split_manifest import split_by_speaker, verify_speaker_disjoint
from ml.tokenizer import corpus_characters


def write_wav(path: Path, frames: int = 16_000) -> None:
    with wave.open(str(path), "wb") as source:
        source.setnchannels(1)
        source.setsampwidth(2)
        source.setframerate(16_000)
        source.writeframes(b"\x00\x00" * frames)


def test_kaldi_fixture_preserves_mixed_scripts_and_emits_audit_ready_manifest(tmp_path):
    # Synthetic fixture only: this is not MUCS data.
    audio = tmp_path / "lecture.wav"
    write_wav(audio)
    kaldi = tmp_path / "kaldi"
    kaldi.mkdir()
    (kaldi / "wav.scp").write_text("rec1 lecture.wav\n", encoding="utf-8")
    (kaldi / "segments").write_text("utt1 rec1 0.00 0.50\nutt2 rec1 0.50 1.00\n", encoding="utf-8")
    (kaldi / "text").write_text("utt1 आज Python पढ़ें\nutt2 Aaj mera exam hai\n", encoding="utf-8")
    (kaldi / "utt2spk").write_text("utt1 speaker-a\nutt2 speaker-b\n", encoding="utf-8")
    manifest = tmp_path / "train.jsonl"
    report = build_kaldi_manifest(tmp_path, kaldi, manifest, "train")
    assert report.as_dict()["valid"] is True
    assert report.records_written == 2
    rows = [json.loads(line) for line in manifest.read_text(encoding="utf-8").splitlines()]
    assert rows[0]["transcript"] == "आज Python पढ़ें"
    assert rows[1]["duration"] == 0.5
    audit = inspect_manifest(manifest)
    assert audit["records"] == 2
    assert audit["speakers"] == 2
    assert audit["language_distribution_by_script"]["mixed_script"] == 1


def test_json_fixture_reports_missing_duplicate_and_invalid_records(tmp_path):
    # Synthetic fixture only: exercises rejection paths without research data.
    write_wav(tmp_path / "good.wav")
    (tmp_path / "broken.wav").write_bytes(b"not a wave")
    annotations = tmp_path / "annotations.json"
    annotations.write_text(json.dumps([
        {"utt_id": "good", "file_name": "good.wav", "sentence": "मेरा Python", "speaker_id": "s1"},
        {"utt_id": "missing-audio", "file_name": "none.wav", "sentence": "hello", "speaker_id": "s2"},
        {"utt_id": "missing-text", "file_name": "good.wav", "sentence": "", "speaker_id": "s3"},
        {"utt_id": "broken", "file_name": "broken.wav", "sentence": "hello", "speaker_id": "s4"},
        {"utt_id": "good", "file_name": "good.wav", "sentence": "duplicate", "speaker_id": "s1"},
    ], ensure_ascii=False), encoding="utf-8")
    report = build_json_manifest(tmp_path, annotations, tmp_path / "manifest.jsonl", "train")
    assert report.records_written == 1
    assert report.missing_audio == ["missing-audio"]
    assert report.missing_transcript == ["missing-text"]
    assert report.invalid_audio
    assert report.duplicate_recordings == ["good"]
    assert normalize_transcript("  मेरा   Python ") == "मेरा Python"


def test_split_and_tokenizer_reject_leakage(tmp_path):
    train = tmp_path / "train.jsonl"
    test = tmp_path / "test.jsonl"
    train.write_text(json.dumps({"speaker_id": "shared", "transcript": "मेरा Python", "split": "train"}) + "\n", encoding="utf-8")
    test.write_text(json.dumps({"speaker_id": "shared", "transcript": "exam", "split": "test"}) + "\n", encoding="utf-8")
    with pytest.raises(ValueError, match="appears in both"):
        verify_speaker_disjoint({"train": train, "test": test})
    with pytest.raises(ValueError, match="held-out"):
        corpus_characters([test])


def test_speaker_split_is_disjoint_for_synthetic_development_fixture(tmp_path):
    # Synthetic fixture only: validates split mechanics, not MUCS statistics.
    source = tmp_path / "development.jsonl"
    rows = [{"id": f"utt-{index}", "speaker_id": f"speaker-{index}", "transcript": "मेरा Python", "split": "train"} for index in range(100)]
    source.write_text("".join(json.dumps(row, ensure_ascii=False) + "\n" for row in rows), encoding="utf-8")
    train, validation = tmp_path / "train.jsonl", tmp_path / "validation.jsonl"
    assert sum(split_by_speaker(source, train, validation, 0.2)) == 100
    verify_speaker_disjoint({"train": train, "validation": validation})
    train_speakers = {json.loads(line)["speaker_id"] for line in train.read_text(encoding="utf-8").splitlines()}
    validation_speakers = {json.loads(line)["speaker_id"] for line in validation.read_text(encoding="utf-8").splitlines()}
    assert not train_speakers & validation_speakers
