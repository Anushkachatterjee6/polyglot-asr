from __future__ import annotations

import re
import unicodedata
from app.schemas import TranscriptWord

DEVANAGARI = re.compile(r"[\u0900-\u097F]")
LATIN = re.compile(r"^[A-Za-z][A-Za-z'-]*$")
# This is a conservative local heuristic, not a trained LID model. The training
# script can later supply an annotated Roman-Hindi classifier.
# Common Romanized Hindi function words and everyday vocabulary.  This list is
# intentionally applied only to complete tokens, so English contractions such
# as "I'm" are preserved as one English token rather than split or relabelled.
ROMAN_HINDI = frozenset(
    "aaj aap acha achha aur hai hain ho hu kya kyu kyun kaise ki ka ke ko "
    "mein main mujhe mera meri nahi nahin se tak tum tumhara yeh ye woh wo"
    .split()
)
TOKEN = re.compile(r"[\u0900-\u097F]+|[A-Za-z]+(?:['-][A-Za-z]+)*|\d+", re.UNICODE)


def classify_token(token: str) -> str:
    normalized = unicodedata.normalize("NFC", token)
    if DEVANAGARI.search(normalized):
        return "hi"
    if LATIN.match(normalized):
        return "hi" if normalized.casefold() in ROMAN_HINDI else "en"
    return "other"


def analyze_transcript(transcript: str) -> tuple[list[TranscriptWord], int, int, int]:
    words = [TranscriptWord(text=match.group(0), language=classify_token(match.group(0))) for match in TOKEN.finditer(transcript)]
    hindi = sum(word.language == "hi" for word in words)
    english = sum(word.language == "en" for word in words)
    # Tokens outside the two language labels remain `other`; the mutually
    # exclusive labels guarantee hi + en + other equals the token count.
    other = sum(word.language == "other" for word in words)
    assert hindi + english + other == len(words)
    sequence = [word.language for word in words if word.language in {"hi", "en"}]
    switches = sum(left != right for left, right in zip(sequence, sequence[1:]))
    return words, hindi, english, switches
