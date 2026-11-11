from __future__ import annotations

from pathlib import Path


def corpus_characters(manifests: list[Path]) -> list[str]:
    import json
    chars: set[str] = set()
    for manifest in manifests:
        for line in manifest.read_text(encoding="utf-8").splitlines():
            record = json.loads(line)
            if record.get("split") in {"test", "blind_test"}:
                raise ValueError(f"{manifest} contains held-out {record['split']!r} data; do not fit the tokenizer on it.")
            chars.update(record["transcript"])
    return sorted(chars)


def write_vocab(characters: list[str], output: Path) -> dict[str, int]:
    import json
    vocab = {"<pad>": 0, "<unk>": 1, "|": 2}
    for char in characters:
        key = "|" if char == " " else char
        if key not in vocab:
            vocab[key] = len(vocab)
    output.write_text(json.dumps(vocab, ensure_ascii=False, indent=2), encoding="utf-8")
    return vocab
