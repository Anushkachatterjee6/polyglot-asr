"""Conservative vocabulary-constrained post-transcription correction.

This is intentionally separate from Gemini ASR. It only substitutes a supplied
or selected-domain term when the observed Latin-script phrase is a close typo
of that term; it never generates new concepts or rewrites sentence structure.
"""
from __future__ import annotations

from dataclasses import dataclass
from difflib import SequenceMatcher
import math
import re


DOMAIN_TERMS = {
    "computer science": ["algorithm", "compiler", "database"],
    "programming": ["Python", "compiler", "API"],
    "machine learning": [
        "machine learning", "algorithm", "algorithms", "inference", "fine-tuning",
        "neural network", "neural networks", "dataset", "datasets", "classification",
        "regression", "XLS-R", "identify", "patterns", "predictions", "explicit programming",
    ],
    "databases": ["PostgreSQL", "database", "SQL"],
    "networking": ["network", "protocol", "TCP"],
}

# Keep punctuation and non-Latin scripts outside replacements. This makes a
# replacement such as `inferense,` retain its comma and preserves Hindi/Tamil.
WORD = re.compile(r"[^\W_]+(?:[-'][^\W_]+)*", re.UNICODE)
ASCII_TERM = re.compile(r"^[a-z0-9]+$")


@dataclass(frozen=True)
class _Term:
    text: str
    normalized: str
    widths: tuple[int, ...]


def _normalize(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", value.casefold())


def _distance(left: str, right: str) -> int:
    """Small dependency-free Levenshtein implementation for bounded typos."""
    if len(left) < len(right):
        left, right = right, left
    row = list(range(len(right) + 1))
    for index, left_char in enumerate(left, 1):
        next_row = [index]
        for other_index, right_char in enumerate(right, 1):
            next_row.append(min(
                next_row[-1] + 1,
                row[other_index] + 1,
                row[other_index - 1] + (left_char != right_char),
            ))
        row = next_row
    return row[-1]


def _terms(domain: str, vocabulary: list[str]) -> list[_Term]:
    unique: dict[str, _Term] = {}
    for source in [*DOMAIN_TERMS.get(domain.casefold(), []), *vocabulary]:
        clean = source.strip().replace("\n", " ")
        normalized = _normalize(clean)
        if not clean or not normalized:
            continue
        widths = tuple(sorted({len(WORD.findall(clean)), len(re.findall(r"[^\s-]+", clean))}, reverse=True))
        unique.setdefault(clean.casefold(), _Term(clean, normalized, widths))
    # Prefer phrase coverage first, then the shorter canonical form. The latter
    # avoids turning a near-singular typo such as `netwoks` into `networks`
    # merely because the plural spelling is one character closer.
    return sorted(unique.values(), key=lambda term: (-max(term.widths), len(term.normalized)))


def _is_close_typo(observed: str, term: _Term) -> bool:
    if observed == term.normalized:
        return True
    # Very short terms (for example API and SQL) must be exact; fuzzy matching
    # them would be more likely to alter an ordinary word than fix a term.
    if len(term.normalized) < 5 or not ASCII_TERM.fullmatch(observed) or not ASCII_TERM.fullmatch(term.normalized):
        return False
    if observed[0] != term.normalized[0]:
        return False
    # A wider token window can contain an already-correct hyphenated term plus
    # its next ordinary word (for example `fine-tuning the`). It is not a typo.
    if observed.startswith(term.normalized):
        return False
    # Do not reinterpret a normal singular/plural form as a misspelling of a
    # neighbouring vocabulary form (for example `neural network` ↔ `networks`).
    if observed in {f"{term.normalized}s", f"{term.normalized}es"} or term.normalized in {
        f"{observed}s", f"{observed}es"
    }:
        return False
    distance = _distance(observed, term.normalized)
    permitted = max(1, math.ceil(len(term.normalized) * 0.25))
    similarity = SequenceMatcher(a=observed, b=term.normalized).ratio()
    return distance <= permitted and similarity >= 0.78


def _preserve_initial_case(replacement: str, observed: str) -> str:
    """Keep sentence-initial/title case without corrupting canonical forms such as XLS-R."""
    if observed and observed[0].isupper() and replacement and replacement[0].islower():
        return replacement[0].upper() + replacement[1:]
    return replacement


def _apply_safe_domain_grammar(transcript: str, domain: str) -> str:
    """Correct one unambiguous plural-subject agreement error in ML prose.

    The rule only applies to recognised Machine Learning noun phrases, so this
    is not a general grammar rewrite of the speaker's transcript.
    """
    if domain.casefold() != "machine learning":
        return transcript
    return re.sub(
        r"\b((?:machine learning )?(?:algorithms|neural networks|datasets))\s+helps\b",
        r"\1 help",
        transcript,
        flags=re.IGNORECASE,
    )


def adapt_transcript(transcript: str, domain: str, vocabulary: list[str]) -> str:
    """Canonicalise exact terms and correct close vocabulary-bound typos.

    A candidate must have the same number of words as its canonical vocabulary
    term. It cannot insert unrelated words, translate text, or modify terms
    outside the selected domain/vocabulary.
    """
    terms = _terms(domain, vocabulary)
    matches = list(WORD.finditer(transcript))
    replacements: list[tuple[int, int, str]] = []
    index = 0
    while index < len(matches):
        selected: tuple[int, _Term] | None = None
        for term in terms:
            for width in term.widths:
                end_index = index + width
                if end_index > len(matches):
                    continue
                candidate = "".join(_normalize(match.group()) for match in matches[index:end_index])
                if _is_close_typo(candidate, term):
                    selected = (end_index, term)
                    break
            if selected is not None:
                break
        if selected is None:
            index += 1
            continue
        end_index, term = selected
        observed = transcript[matches[index].start():matches[end_index - 1].end()]
        replacements.append((
            matches[index].start(),
            matches[end_index - 1].end(),
            _preserve_initial_case(term.text, observed),
        ))
        index = end_index

    if not replacements:
        return _apply_safe_domain_grammar(transcript, domain)
    result: list[str] = []
    position = 0
    for start, end, replacement in replacements:
        result.extend((transcript[position:start], replacement))
        position = end
    result.append(transcript[position:])
    return _apply_safe_domain_grammar("".join(result), domain)
