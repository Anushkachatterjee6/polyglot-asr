# Evaluation methodology

Evaluate only against an official held-out MUCS test split; never include it or the blind-test split in tokenizer fitting, training, contextual vocabulary discovery, or decoder tuning.

`ml/evaluation/metrics.py` provides token WER, character CER, and switch-boundary F1. A report may be exposed through `/api/evaluation` only after a measured JSON report is saved at `POLYGLOT_EVALUATION_PATH`. Until then the API intentionally returns `null` values for E0–E5.

For each experiment, record checkpoint identifier, exact normalization policy, decoder settings, language-model/context weights, test manifest digest, hardware, wall-clock inference time, and result count. Compute real-time factor as inference wall time divided by processed audio duration. Evaluate LID only on an aligned, token-level annotated set; Romanized Hindi requires annotations and must not be counted as English merely because it uses Latin letters.
