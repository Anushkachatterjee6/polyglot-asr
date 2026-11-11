from __future__ import annotations

from ml.decoding.greedy import decode


def decode_logits(logits, id_to_token: dict[int, str], blank_id: int = 0, beam_width: int = 100) -> str:
    """Use pyctcdecode if installed; retain a deterministic greedy fallback."""
    try:
        from pyctcdecode import build_ctcdecoder
        labels = [id_to_token[index] for index in range(len(id_to_token))]
        return build_ctcdecoder(labels).decode(logits, beam_width=beam_width)
    except ImportError:
        return decode(logits, id_to_token, blank_id)
