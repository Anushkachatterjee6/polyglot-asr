"""Truthful aggregates over persisted Transcription Studio activity."""
from __future__ import annotations

from collections import Counter, defaultdict
from statistics import mean
from typing import Any

from app.schemas import TranscriptResult
from app.services.language_analysis import analyze_transcript
from ml.evaluation.metrics import cer, normalize_for_evaluation, wer

MIN_PROXY_RECORDS = 3


def _average(values: list[float]) -> float | None:
    return mean(values) if values else None


def _labels(record: TranscriptResult):
    """Reclassify raw text so historic cached labels cannot skew analytics."""
    return analyze_transcript(record.transcript)[0] if record.transcript else []


def _scores(reference: str, hypothesis: str) -> tuple[float | None, float | None]:
    return wer(normalize_for_evaluation(reference), normalize_for_evaluation(hypothesis)), cer(
        normalize_for_evaluation(reference), normalize_for_evaluation(hypothesis)
    )


def _proxy_scores(record: TranscriptResult) -> tuple[float | None, float | None]:
    """Measure raw-vs-contextual edit disagreement, never claim it is ground truth.

    It is available only when the existing local contextual adaptation actually
    changed a transcript. This detects correction candidates, not ASR errors.
    """
    adapted = record.contextualTranscript
    if not adapted or not record.transcript.strip() or adapted.strip() == record.transcript.strip():
        return None, None
    return _scores(record.transcript, adapted)


def build_live_analytics(records: list[TranscriptResult]) -> dict[str, Any]:
    successful = [r for r in records if r.status == "completed" and r.transcript.strip()]
    failed = [r for r in records if r.status == "failed"]
    processing = [r.processingSeconds for r in records if r.processingSeconds is not None]
    durations = [r.durationSeconds for r in records if r.durationSeconds is not None]
    ratios = [r.processingSeconds / r.durationSeconds for r in records if r.processingSeconds is not None and r.durationSeconds not in (None, 0)]
    language_counts: Counter[str] = Counter()
    daily: dict[str, dict[str, Any]] = defaultdict(lambda: {"recordings": 0, "successful": 0, "failed": 0, "latencies": []})
    timeline: list[dict[str, str | float]] = []
    comparison: list[dict[str, str | float | None]] = []
    detail_records: list[dict[str, object]] = []
    reference_trend: list[dict[str, str | float]] = []
    proxy_trend: list[dict[str, str | float]] = []
    reference_wers: list[float] = []
    reference_cers: list[float] = []
    proxy_wers: list[float] = []
    proxy_cers: list[float] = []
    word_counts: list[int] = []
    switches = mixed = hindi_english = 0
    switch_boundaries = 0

    for record in records:
        timestamp = record.createdAt.isoformat() if record.createdAt else "unknown"
        day = record.createdAt.date().isoformat() if record.createdAt else "unknown"
        bucket = daily[day]
        bucket["recordings"] += 1
        bucket["successful" if record.status == "completed" else "failed"] += 1
        if record.processingSeconds is not None:
            bucket["latencies"].append(record.processingSeconds)
            timeline.append({"timestamp": timestamp, "processingSeconds": record.processingSeconds})
        comparison.append({"id": record.id, "audioSeconds": record.durationSeconds, "processingSeconds": record.processingSeconds})
        labels = _labels(record) if record.status == "completed" and record.transcript.strip() else []
        label_values = [word.language for word in labels]
        present_labels = set(label_values)
        inferred_language = (
            "hi-en" if {"hi", "en"} <= present_labels
            else next(iter(present_labels)) if len(present_labels) == 1
            else record.detectedLanguage
        )
        language_counts.update(label_values)
        if record in successful:
            word_counts.append(len(labels))
            known = [label for label in label_values if label in {"hi", "en"}]
            record_switches = sum(left != right for left, right in zip(known, known[1:]))
            switches += record_switches
            switch_boundaries += max(0, len(known) - 1)
            if {"hi", "en"} <= set(known):
                mixed += 1
                hindi_english += 1

        ref_wer = ref_cer = None
        if record.status == "completed" and record.referenceTranscript and record.referenceTranscript.strip():
            ref_wer, ref_cer = _scores(record.referenceTranscript, record.transcript)
            if ref_wer is not None and ref_cer is not None:
                reference_wers.append(ref_wer); reference_cers.append(ref_cer)
                reference_trend.append({"timestamp": timestamp, "wer": ref_wer, "cer": ref_cer})
        proxy_wer, proxy_cer = _proxy_scores(record) if record.status == "completed" else (None, None)
        if proxy_wer is not None and proxy_cer is not None:
            proxy_wers.append(proxy_wer); proxy_cers.append(proxy_cer)
            proxy_trend.append({"timestamp": timestamp, "wer": proxy_wer, "cer": proxy_cer})
        detail_records.append({
            "id": record.id, "timestamp": timestamp, "filename": record.filename,
            "transcript": record.transcript, "referenceTranscript": record.referenceTranscript,
            "provider": record.provider, "detectedLanguage": inferred_language,
            "status": record.status, "error": record.error, "audioSeconds": record.durationSeconds,
            "processingSeconds": record.processingSeconds, "wordCount": len(labels),
            "estimatedWer": proxy_wer, "estimatedCer": proxy_cer,
            "wer": ref_wer, "cer": ref_cer,
        })

    activity = [{"date": day, "recordings": row["recordings"], "successful": row["successful"], "failed": row["failed"], "averageProcessingSeconds": _average(row["latencies"])} for day, row in sorted(daily.items())]
    enough_proxy = len(proxy_wers) >= MIN_PROXY_RECORDS
    return {
        "status": "ready" if records else "empty",
        "totals": {
            "recordings": len(records), "successful": len(successful), "failed": len(failed),
            "averageProcessingSeconds": _average(processing), "averageAudioSeconds": _average(durations),
            "realTimeFactor": _average(ratios), "averageWords": _average(word_counts), "totalWords": sum(word_counts),
            "referencedRecordings": len(reference_wers), "wer": _average(reference_wers), "cer": _average(reference_cers),
            "wordAccuracy": None if not reference_wers else max(0, 1 - _average(reference_wers)) ,
            "proxyRecordings": len(proxy_wers), "estimatedWer": _average(proxy_wers) if enough_proxy else None,
            "estimatedCer": _average(proxy_cers) if enough_proxy else None,
            "estimatedWordAccuracy": max(0, 1 - _average(proxy_wers)) if enough_proxy else None,
        },
        "languageDistribution": [{"language": language, "count": language_counts.get(language, 0)} for language in ("hi", "en", "other", "unknown")],
        "activity": activity, "latencyTimeline": sorted(timeline, key=lambda item: item["timestamp"]),
        "durationComparison": comparison, "records": sorted(detail_records, key=lambda item: str(item["timestamp"]), reverse=True),
        "referenceTrend": sorted(reference_trend, key=lambda item: item["timestamp"]),
        "proxyTrend": sorted(proxy_trend, key=lambda item: item["timestamp"]),
        "codeSwitching": {"mixedRecordings": mixed, "hindiEnglish": hindi_english, "tamilEnglish": None, "switches": switches, "switchRatio": switches / switch_boundaries if switch_boundaries else None},
    }
