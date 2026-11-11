from __future__ import annotations

import re

DOMAIN_TERMS = {
    "computer science": ["algorithm", "compiler", "database"],
    "programming": ["Python", "compiler", "API"],
    "machine learning": ["machine learning", "neural network", "inference", "fine-tuning", "XLS-R"],
    "databases": ["PostgreSQL", "database", "SQL"],
    "networking": ["network", "protocol", "TCP"],
}


def adapt_transcript(transcript: str, domain: str, vocabulary: list[str]) -> str:
    """Apply only exact case-insensitive term canonicalisation.

    This is intentionally conservative: without competing acoustic candidates,
    replacing near matches would fabricate an improvement.
    """
    terms = [*DOMAIN_TERMS.get(domain.casefold(), []), *vocabulary]
    result = transcript
    for term in sorted({term.strip() for term in terms if term.strip()}, key=len, reverse=True):
        result = re.sub(rf"(?<!\w){re.escape(term)}(?!\w)", term, result, flags=re.IGNORECASE)
    return result
