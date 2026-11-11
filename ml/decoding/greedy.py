from __future__ import annotations

import numpy as np


def decode(logits: np.ndarray, id_to_token: dict[int, str], blank_id: int = 0) -> str:
    ids = np.argmax(logits, axis=-1).tolist()
    collapsed = [token for i, token in enumerate(ids) if token != blank_id and (i == 0 or token != ids[i - 1])]
    return "".join(id_to_token[index] for index in collapsed).replace("|", " ").strip()
