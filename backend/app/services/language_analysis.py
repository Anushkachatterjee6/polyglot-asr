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
    "aaj aap acha achha accha aur hai hain ho hu kya kyu kyun kaise ki ka ke ko "
    "mein main mujhe mera meri nahi nahin se tak tum tumhara yeh ye woh wo "
    "kal jaana jana jao gaya gayi raha rahi rahe karna karo kiya karega karenge "
    "bahut bohot acha theek thik yaar bhai didi ji na haan han nahi mujko hum "
    "hamara apna tumhe unko isko usko yahan wahan abhi phir fir lekin magar"
    .split()
)
ENGLISH_WORDS = frozenset(
    "a am an and are as at be because been but by can college could do does for from have he her "
    "here how i if in is it just like me my of on or our so that the their them then there these "
    "they this to was we were what when where which who why with would you your actually exam "
    "assignment check complete fine inference learning machine model neural study studying use using python"
    .split()
)
TOKEN = re.compile(r"[\u0900-\u097F]+|[A-Za-z]+(?:['-][A-Za-z]+)*|\d+", re.UNICODE)


def classify_token(token: str) -> str:
    normalized = unicodedata.normalize("NFC", token)
    if DEVANAGARI.search(normalized):
        return "hi"
    if LATIN.match(normalized):
        value = normalized.casefold()
        if value in ROMAN_HINDI or value.endswith(("wala", "wali", "waale", "raha", "rahi")):
            return "hi"
        if value in ENGLISH_WORDS or "'" in value or value.endswith(("ing", "ed", "tion", "ment", "ness", "ly")):
            return "en"
        # Ambiguous Latin tokens must not be silently counted as English.
        return "unknown"
    return "other"


def analyze_transcript(transcript: str) -> tuple[list[TranscriptWord], int, int, int]:
    words = [TranscriptWord(text=match.group(0), language=classify_token(match.group(0))) for match in TOKEN.finditer(transcript)]
    hindi = sum(word.language == "hi" for word in words)
    english = sum(word.language == "en" for word in words)
    remaining = sum(word.language in {"other", "unknown"} for word in words)
    assert hindi + english + remaining == len(words)
    sequence = [word.language for word in words if word.language in {"hi", "en"}]
    switches = sum(left != right for left, right in zip(sequence, sequence[1:]))
    return words, hindi, english, switches
