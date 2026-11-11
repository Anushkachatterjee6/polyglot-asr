# MUCS 2021 Subtask 2 dataset audit — 2026-11-11

## Data inspected

- Training source: `C:\Users\Anushka\Downloads\Hindi-English_train\train`
- Test source: `C:\Users\Anushka\Downloads\Hindi-English_test\test`
- Kaldi metadata directories: each split's `transcripts\` directory, containing `wav.scp`, `segments`, `text`, `utt2spk`, and `spk2utt`.

The original audio was not changed. Generated manifests, reports, and the tokenizer are local ignored artifacts in `backend\data\mucs-2021\`.

## Validation findings

Both partitions passed validation with zero missing audio, missing transcripts, duplicate utterances/segments, invalid audio, inconsistent Kaldi metadata, or `spk2utt`/`utt2spk` mismatches. All referenced recordings are mono, 16 kHz, 16-bit WAV.

| Partition | Utterances | Speakers | Duration | Script distribution (Devanagari / Latin / mixed / other) |
| --- | ---: | ---: | ---: | --- |
| Official train | 52,825 | 520 | 89.554 h | 7,456 / 955 / 44,412 / 2 |
| Development train | 46,725 | 465 | 79.689 h | 6,595 / 833 / 39,295 / 2 |
| Development validation | 6,100 | 55 | 9.865 h | 861 / 122 / 5,117 / 0 |
| Official test (held out) | 3,136 | 30 | 5.178 h | 590 / 37 / 2,509 / 0 |

Durations are segment totals (not long-recording wall time). The two `other` train utterances are non-empty transcript strings containing neither Devanagari nor Latin letters; they were retained rather than silently altered.

## Leakage controls

Development train/validation were derived deterministically by speaker: no speaker appears in both, and neither overlaps the official test manifest. The tokenizer was fit from `train.jsonl` only, resulting in 147 CTC vocabulary entries. The scripts reject `test` and `blind_test` rows during tokenizer fitting.

## Required before XLS-R training

1. Review the generated audit JSON files and the two `other_or_empty` transcripts if the research protocol requires a restricted character inventory.
2. Keep `test.jsonl` and any future blind-test manifest out of tokenizer fitting, training, and hyperparameter selection.
3. Select GPU hardware and configure the XLS-R run. No model training has been started.
