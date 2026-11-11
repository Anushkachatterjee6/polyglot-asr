from __future__ import annotations

import argparse
from pathlib import Path

from ml.tokenizer import corpus_characters, write_vocab


def main() -> None:
    parser = argparse.ArgumentParser(description="Create the mixed Devanagari/Latin CTC processor from training transcripts only.")
    parser.add_argument("--manifest", type=Path, action="append", required=True, help="Training manifest; repeat for additional training shards.")
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()
    from transformers import Wav2Vec2CTCTokenizer, Wav2Vec2FeatureExtractor, Wav2Vec2Processor
    args.output_dir.mkdir(parents=True, exist_ok=True)
    vocab_path = args.output_dir / "vocab.json"
    write_vocab(corpus_characters(args.manifest), vocab_path)
    tokenizer = Wav2Vec2CTCTokenizer(str(vocab_path), unk_token="<unk>", pad_token="<pad>", word_delimiter_token="|")
    feature_extractor = Wav2Vec2FeatureExtractor(feature_size=1, sampling_rate=16_000, padding_value=0.0, do_normalize=True, return_attention_mask=True)
    Wav2Vec2Processor(feature_extractor=feature_extractor, tokenizer=tokenizer).save_pretrained(str(args.output_dir))


if __name__ == "__main__":
    main()
