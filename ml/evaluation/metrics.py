from __future__ import annotations

import re
import unicodedata

def _distance(reference: list[str], hypothesis: list[str]) -> int:
    previous = list(range(len(hypothesis) + 1))
    for i, value in enumerate(reference, 1):
        current = [i]
        for j, candidate in enumerate(hypothesis, 1):
            current.append(min(current[-1] + 1, previous[j] + 1, previous[j - 1] + (value != candidate)))
        previous = current
    return previous[-1]


def wer(reference: str, hypothesis: str) -> float | None:
    tokens = reference.split()
    return None if not tokens else _distance(tokens, hypothesis.split()) / len(tokens)


def cer(reference: str, hypothesis: str) -> float | None:
    return None if not reference else _distance(list(reference), list(hypothesis)) / len(reference)


def normalize_for_evaluation(text: str) -> str:
    """Unicode-normalise, case-fold, remove punctuation, and collapse spaces.

    This never transliterates or translates Hindi/Tamil/English text; original
    scripts remain intact for the actual edit-distance comparison.
    """
    text = unicodedata.normalize("NFC", text).casefold()
    # Combining marks are part of Indic graphemes (for example Devanagari
    # matras), so they must survive punctuation removal.
    text = "".join(
        char if (char.isalnum() or char.isspace() or unicodedata.category(char).startswith("M")) else " "
        for char in text
    )
    return re.sub(r"\s+", " ", text).strip()


def lid_accuracy(reference: list[str], hypothesis: list[str]) -> float | None:
    """Token-aligned language-label accuracy, unavailable when unalignable."""
    if not reference or len(reference) != len(hypothesis):
        return None
    return sum(left == right for left, right in zip(reference, hypothesis)) / len(reference)


def switch_boundary_f1(reference: list[str], hypothesis: list[str]) -> float | None:
    if len(reference) != len(hypothesis) or len(reference) < 2:
        return None
    actual = {i for i in range(1, len(reference)) if reference[i] != reference[i - 1]}
    predicted = {i for i in range(1, len(hypothesis)) if hypothesis[i] != hypothesis[i - 1]}
    if not actual and not predicted:
        return 1.0
    precision = len(actual & predicted) / len(predicted) if predicted else 0
    recall = len(actual & predicted) / len(actual) if actual else 0
    return 0 if precision + recall == 0 else 2 * precision * recall / (precision + recall)
