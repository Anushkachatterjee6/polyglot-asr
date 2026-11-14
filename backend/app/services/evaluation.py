"""Dataset validation and bounded, truthful Gemini benchmark execution."""
from __future__ import annotations

import csv
from contextlib import contextmanager
import errno
import io
import json
import os
from pathlib import Path
import shutil
import tempfile
import time
import uuid
import zipfile
from typing import Any, Callable

from app.core.audio_processing import wav_duration_seconds
from app.core.gemini_transcribe import GeminiConfigurationError, GeminiServiceError, transcribe_audio
from app.services.contextual_adaptation import adapt_transcript
from app.services.language_analysis import analyze_transcript
from ml.evaluation.metrics import cer, lid_accuracy, normalize_for_evaluation, switch_boundary_f1, wer

EXPERIMENTS = {
    "E0": "Gemini 3.5 Transcribe — baseline transcription",
    "E1": "Gemini 3.5 Transcribe — domain vocabulary enabled",
    "E2": "Gemini 3.5 Transcribe — contextual adaptation after transcription",
    "E3": "Gemini 3.5 Transcribe — Hindi-English code-switching evaluation",
    "E4": "Gemini 3.5 Transcribe — Tamil-English code-switching evaluation",
    "E5": "Gemini 3.5 Transcribe — robustness across audio conditions",
}
MIME_TYPES = {".wav": "audio/wav", ".webm": "audio/webm", ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".m4a": "audio/mp4"}
_LOCK_RETRIES = 30
_LOCK_DELAY_SECONDS = 0.1
_STALE_LOCK_SECONDS = 15


class DatasetInstallationError(ValueError):
    """A safe, actionable error raised when Windows blocks a dataset swap."""


def benchmark_dir(data_dir: Path) -> Path:
    """Resolve the published immutable benchmark version, if one exists."""
    pointer = data_dir / "evaluation-benchmark.current.json"
    legacy = data_dir / "evaluation-benchmark"
    try:
        directory = json.loads(pointer.read_text(encoding="utf-8")).get("directory", "")
        candidate = data_dir / str(directory)
        if (
            isinstance(directory, str)
            and directory.startswith("evaluation-benchmark.dataset-")
            and candidate.parent == data_dir
            and candidate.is_dir()
        ):
            return candidate
    except (OSError, ValueError, json.JSONDecodeError):
        pass
    return legacy


def _manifest_from_zip(payload: bytes) -> tuple[dict[str, Any], zipfile.ZipFile]:
    archive = zipfile.ZipFile(io.BytesIO(payload))
    names = archive.namelist()
    manifest_name = next((name for name in names if name.casefold().endswith("manifest.json")), None)
    if manifest_name:
        return json.loads(archive.read(manifest_name)), archive
    csv_name = next((name for name in names if name.casefold().endswith("manifest.csv")), None)
    if csv_name:
        rows = list(csv.DictReader(io.StringIO(archive.read(csv_name).decode("utf-8-sig"))))
        return {"samples": rows}, archive
    archive.close()
    raise ValueError("Dataset ZIP must contain manifest.json or manifest.csv.")


def validate_manifest(manifest: dict[str, Any], root: Path | None = None) -> dict[str, Any]:
    samples = manifest.get("samples")
    if not isinstance(samples, list) or not samples:
        raise ValueError("Manifest must contain a non-empty samples array.")
    ids: set[str] = set()
    errors: list[str] = []
    annotations = {"languageLabels": 0, "switchBoundaries": 0}
    for index, sample in enumerate(samples, 1):
        if not isinstance(sample, dict):
            errors.append(f"row {index}: sample must be an object")
            continue
        sample_id = str(sample.get("id", "")).strip()
        audio = str(sample.get("audio", "")).strip()
        reference = sample.get("reference")
        if not sample_id or sample_id in ids:
            errors.append(f"row {index}: id is missing or duplicated")
        ids.add(sample_id)
        if not audio or Path(audio).is_absolute() or ".." in Path(audio).parts:
            errors.append(f"row {index}: audio must be a safe relative path")
        elif Path(audio).suffix.casefold() not in MIME_TYPES:
            errors.append(f"row {index}: unsupported audio extension")
        elif root and not (root / audio).is_file():
            errors.append(f"row {index}: audio file is missing ({audio})")
        elif root and Path(audio).suffix.casefold() == ".wav" and wav_duration_seconds((root / audio).read_bytes()) is None:
            errors.append(f"row {index}: audio is not a valid WAV file ({audio})")
        if not isinstance(reference, str) or not reference.strip():
            errors.append(f"row {index}: reference transcript is required")
        labels = sample.get("language_labels") or sample.get("languageLabels")
        if labels is not None:
            if not isinstance(labels, list) or not all(label in {"hi", "en", "ta", "other"} for label in labels):
                errors.append(f"row {index}: language_labels must contain hi, en, ta, or other")
            else:
                annotations["languageLabels"] += 1
        boundaries = sample.get("switch_boundaries") or sample.get("switchBoundaries")
        if boundaries is not None:
            if not isinstance(boundaries, list) or not all(isinstance(item, int) and item > 0 for item in boundaries):
                errors.append(f"row {index}: switch_boundaries must be positive integer positions")
            else:
                annotations["switchBoundaries"] += 1
    return {"samples": len(samples), "errors": errors, "annotations": annotations}


def _is_transient_lock_error(exc: OSError) -> bool:
    return exc.winerror in {5, 32, 33, 145} or exc.errno in {errno.EACCES, errno.EBUSY}


def _retry(operation: Callable[[], Any], description: str) -> Any:
    last_error: OSError | None = None
    for attempt in range(_LOCK_RETRIES):
        try:
            return operation()
        except OSError as exc:
            if not _is_transient_lock_error(exc):
                raise
            last_error = exc
            time.sleep(_LOCK_DELAY_SECONDS)
    raise DatasetInstallationError(
        f"Windows kept '{description}' locked after {_LOCK_RETRIES} retries. "
        "Close File Explorer/antivirus scans using the benchmark folder and try the upload again."
    ) from last_error


@contextmanager
def _dataset_install_lock(data_dir: Path):
    """Serialize uploads across backend processes with an atomic lock directory."""
    lock = data_dir / "evaluation-benchmark.install.lock"
    acquired = False
    for attempt in range(_LOCK_RETRIES):
        try:
            lock.mkdir()
            (lock / "owner.json").write_text(
                json.dumps({"pid": os.getpid(), "createdAt": time.time()}), encoding="utf-8"
            )
            acquired = True
            break
        except FileExistsError:
            try:
                if time.time() - lock.stat().st_mtime > _STALE_LOCK_SECONDS:
                    _retry(lambda: shutil.rmtree(lock), "stale benchmark installation lock")
                    continue
            except FileNotFoundError:
                continue
            time.sleep(_LOCK_DELAY_SECONDS)
    if not acquired:
        raise DatasetInstallationError(
            "Another benchmark upload is still installing. Wait for it to finish, then try again."
        )
    try:
        yield
    finally:
        try:
            _retry(lambda: shutil.rmtree(lock), "benchmark installation lock")
        except DatasetInstallationError:
            # A stale lock safely blocks concurrent installation rather than
            # risking corruption. The next request receives a clear message.
            pass


def _publish_validated_dataset(staging: Path, data_dir: Path) -> None:
    """Atomically publish a version pointer without renaming any directory.

    Windows can reject an otherwise-valid directory rename while Explorer,
    Defender, or another Python process has a handle open. The validated
    staging directory therefore *is* the immutable version; only a tiny JSON
    pointer is replaced. A failed pointer update leaves the prior benchmark
    selected and the new candidate unreferenced.
    """
    pointer = data_dir / "evaluation-benchmark.current.json"
    pointer_temp = data_dir / f".evaluation-benchmark.current-{uuid.uuid4().hex}.tmp"
    with _dataset_install_lock(data_dir):
        try:
            pointer_temp.write_text(json.dumps({"directory": staging.name}), encoding="utf-8")
            _retry(lambda: os.replace(pointer_temp, pointer), "active benchmark pointer")
        except (OSError, DatasetInstallationError) as exc:
            raise DatasetInstallationError(
                "Could not publish the validated benchmark because Windows locked the active-dataset pointer. "
                "The previous benchmark remains active; close processes using the data folder and retry."
            ) from exc
        finally:
            if pointer_temp.exists():
                try:
                    _retry(lambda: pointer_temp.unlink(), "temporary benchmark pointer")
                except DatasetInstallationError:
                    pass


def save_dataset(payload: bytes, data_dir: Path) -> dict[str, Any]:
    manifest, archive = _manifest_from_zip(payload)
    data_dir.mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix="evaluation-benchmark.dataset-", dir=data_dir))
    published = False
    try:
        for item in archive.infolist():
            target = staging / item.filename
            if item.is_dir():
                continue
            if Path(item.filename).is_absolute() or ".." in Path(item.filename).parts:
                raise ValueError("Dataset ZIP contains an unsafe path.")
            target.parent.mkdir(parents=True, exist_ok=True)
            with archive.open(item) as source, target.open("wb") as destination:
                shutil.copyfileobj(source, destination)
        (staging / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
        report = validate_manifest(manifest, staging)
        if report["errors"]:
            raise ValueError("; ".join(report["errors"]))
        _publish_validated_dataset(staging, data_dir)
        published = True
        active_root = benchmark_dir(data_dir)
        copied_report = validate_manifest(manifest, active_root)
        if copied_report["errors"]:
            raise ValueError("Copied benchmark is invalid: " + "; ".join(copied_report["errors"]))
        return copied_report
    finally:
        archive.close()
        if not published and staging.exists():
            try:
                _retry(lambda: shutil.rmtree(staging), "temporary benchmark directory")
            except DatasetInstallationError:
                pass


def load_dataset(data_dir: Path) -> tuple[dict[str, Any], Path] | None:
    root = benchmark_dir(data_dir)
    path = root / "manifest.json"
    if not path.is_file():
        return None
    manifest = json.loads(path.read_text(encoding="utf-8"))
    report = validate_manifest(manifest, root)
    if report["errors"]:
        raise ValueError("Saved benchmark is invalid: " + "; ".join(report["errors"]))
    return manifest, root


def _eligible(sample: dict[str, Any], experiment: str) -> bool:
    pair = str(sample.get("language_pair", sample.get("languagePair", ""))).casefold()
    return experiment not in {"E3", "E4"} or ("hi" in pair if experiment == "E3" else "ta" in pair)


def _write_json(path: Path, content: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(content, ensure_ascii=False, indent=2), encoding="utf-8")
    temporary.replace(path)


def _report(*, experiment: str, outcomes: list[dict[str, Any]], total: int, status: str,
            error: str | None = None, run_id: str | None = None) -> dict[str, Any]:
    """Aggregate only full successful runs; partial outcomes are evidence, not metrics."""
    failed = sum(item["error"] is not None for item in outcomes)
    complete = len(outcomes) == total and failed == 0 and status == "completed"
    if status == "completed-with-errors" and error is None:
        error = f"{failed} sample(s) failed. Partial outcomes were saved; no aggregate metrics were calculated."

    def average(key: str) -> float | None:
        if not complete:
            return None
        values = [item[key] for item in outcomes if item[key] is not None]
        return sum(values) / len(values) if values else None

    metrics = [{"name": name, "value": None if (value := average(key)) is None else value * 100 if key in {"WER", "CER", "LID"} else value,
                "unit": "%" if key in {"WER", "CER", "LID"} else "x", "experiment": experiment}
               for name, key in [("WER", "WER"), ("CER", "CER"), ("LID", "LID"), ("Switch Boundary F1", "SwitchF1"), ("RTF", "RTF")]]
    return {
        "protocol": "Gemini 3.5 Transcribe benchmark",
        "normalization": "NFC, case-fold, punctuation removed, whitespace collapsed; scripts preserved.",
        "metrics": metrics,
        "experiments": [{"name": f"{experiment} · {EXPERIMENTS[experiment]}", "WER": average("WER") * 100 if average("WER") is not None else None,
                         "CER": average("CER") * 100 if average("CER") is not None else None, "LID": average("LID") * 100 if average("LID") is not None else None,
                         "SwitchF1": average("SwitchF1"), "RTF": average("RTF")}],
        "details": outcomes,
        "dataset": {"samples": total, "completed": len(outcomes) - failed, "failed": failed, "status": status},
        "status": status, "runId": run_id,
        "progress": {"completed": len(outcomes), "total": total, "failed": failed, "currentSampleId": None},
        "error": error,
    }


def run_experiment(*, data_dir: Path, experiment: str, api_key: str, timeout_seconds: float,
                   use_env_proxy: bool, overall_timeout_seconds: float = 300, run_id: str | None = None,
                   progress_callback: Callable[[dict[str, Any]], None] | None = None) -> dict[str, Any]:
    if experiment not in EXPERIMENTS:
        raise ValueError("Unknown experiment. Select E0 through E5.")
    loaded = load_dataset(data_dir)
    if loaded is None:
        raise ValueError("Awaiting dataset. Upload a validated benchmark ZIP first.")
    manifest, root = loaded
    samples = [item for item in manifest["samples"] if _eligible(item, experiment)]
    if not samples:
        raise ValueError(f"{experiment} has no matching annotated samples in this benchmark.")
    outcomes: list[dict[str, Any]] = []
    deadline = time.monotonic() + overall_timeout_seconds
    snapshot_path = data_dir / "evaluation-runs" / f"{run_id or 'manual'}.json"

    def persist(status: str, current_sample_id: str | None = None, error: str | None = None) -> dict[str, Any]:
        report = _report(experiment=experiment, outcomes=outcomes, total=len(samples), status=status, error=error, run_id=run_id)
        report["progress"]["currentSampleId"] = current_sample_id
        _write_json(snapshot_path, report)
        if progress_callback:
            progress_callback(report)
        return report

    for sample in samples:
        if time.monotonic() >= deadline:
            return persist("timed-out", error="Evaluation exceeded its overall time limit. Partial sample results were saved; no aggregate metrics were calculated.")
        audio_path = root / sample["audio"]
        reference = str(sample["reference"])
        start = time.perf_counter()
        try:
            audio = audio_path.read_bytes()
            raw = transcribe_audio(api_key=api_key, audio_bytes=audio, filename=audio_path.name,
                                   mime_type=MIME_TYPES[audio_path.suffix.casefold()],
                                   vocabulary=list(sample.get("vocabulary", [])) if experiment == "E1" else [],
                                   timeout_seconds=timeout_seconds, use_env_proxy=use_env_proxy).text
            elapsed = time.perf_counter() - start
            adapted = adapt_transcript(raw, str(sample.get("domain", "")), list(sample.get("vocabulary", []))) if experiment == "E2" else raw
            duration = wav_duration_seconds(audio)
            ref_norm, hyp_norm = normalize_for_evaluation(reference), normalize_for_evaluation(adapted)
            labels = sample.get("language_labels") or sample.get("languageLabels")
            predicted = [item.language for item in analyze_transcript(adapted)[0]] if labels else None
            outcomes.append({"id": sample["id"], "reference": reference, "rawTranscript": raw, "adaptedTranscript": adapted if experiment == "E2" else None,
                             "WER": wer(ref_norm, hyp_norm), "CER": cer(ref_norm, hyp_norm), "LID": lid_accuracy(labels, predicted) if labels else None,
                             "SwitchF1": switch_boundary_f1(labels, predicted) if labels else None, "RTF": elapsed / duration if duration else None,
                             "processingSeconds": elapsed, "audioDurationSeconds": duration, "error": None})
        except Exception as exc:
            # Provider and configuration exceptions are already sanitized by the
            # Gemini service. Preserve them per sample so an unavailable SDK,
            # missing key, timeout, or rate limit is diagnosable rather than
            # being collapsed into an unhelpful exception-class placeholder.
            safe_error = (
                str(exc)
                if isinstance(exc, (GeminiConfigurationError, GeminiServiceError))
                else f"{type(exc).__name__} while transcribing this sample."
            )
            outcomes.append({"id": sample["id"], "reference": reference, "rawTranscript": None, "adaptedTranscript": None,
                             "WER": None, "CER": None, "LID": None, "SwitchF1": None, "RTF": None,
                             "processingSeconds": time.perf_counter() - start, "audioDurationSeconds": None, "error": safe_error})
        persist("running", current_sample_id=str(sample["id"]))

    report = persist("completed" if not any(item["error"] for item in outcomes) else "completed-with-errors")
    if report["status"] == "completed":
        _write_json(data_dir / "evaluation-results.json", report)
    return report
