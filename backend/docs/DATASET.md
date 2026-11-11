# MUCS 2021 Subtask 2 preparation

Use only the official Hindi-English release (OpenSLR 104 / MUCS 2021 Subtask 2), not a substitute corpus. It contains 16 kHz, 16-bit technical spoken-tutorial recordings, plus official train, test, and blind-test partitions. Keep the archives, audio, and generated manifests outside the repository.

## Expected original-release layout

After extraction, locate each Kaldi data directory anywhere below a dataset root. Each one must contain:

```text
<dataset-root>/
  audio/…/*.wav                 # long-form, 16 kHz, 16-bit source recordings
  <split-data>/
    wav.scp                     # recording-id <relative audio path>
    segments                    # utterance-id recording-id start-sec end-sec
    text                        # utterance-id <mixed Devanagari/Latin transcript>
    utt2spk                     # utterance-id speaker-id
```

The tool rejects pipe commands in `wav.scp`, audio outside the dataset root, missing metadata, duplicate utterance IDs/segments, bad segment times, unreadable audio, missing transcript/audio, and unsegmented annotations. It never invents speaker IDs. The transcript normalizer uses Unicode NFC and whitespace normalization only, preserving Devanagari, English, Romanized Hindi, punctuation, and code-switches.

An already-segmented JSON export is also supported only if every row has equivalent fields: `file_name`/`audio`/`path`, `sentence`/`transcript`/`text`, `speaker_id`, and preferably `utt_id`, plus optional `start`, `end`, `duration`, and `split`.

## Commands

```powershell
# Build a train manifest and an audit report from the actual released files.
py -m ml.data.prepare_dataset --dataset-root D:\datasets\mucs-2021 --kaldi-dir <path-to-extracted-Kaldi-train-directory> --split train --output D:\datasets\mucs-2021\manifests\train.jsonl
py -m ml.data.inspect_dataset D:\datasets\mucs-2021\manifests\train.jsonl --output D:\datasets\mucs-2021\reports\train-audit.json

# Build official held-out manifests. Do not pass either to tokenizer fitting or training.
py -m ml.data.prepare_dataset --dataset-root D:\datasets\mucs-2021 --kaldi-dir <path-to-extracted-Kaldi-test-directory> --split test --output D:\datasets\mucs-2021\manifests\test.jsonl
```

If an official development validation partition is absent, split only the official training partition by genuine speaker ID, then verify train/validation/test/blind-test speaker disjointness:

```powershell
py -m ml.data.split_manifest D:\datasets\mucs-2021\manifests\all-train.jsonl --train D:\datasets\mucs-2021\manifests\train.jsonl --validation D:\datasets\mucs-2021\manifests\validation.jsonl --test D:\datasets\mucs-2021\manifests\test.jsonl --blind-test D:\datasets\mucs-2021\manifests\blind-test.jsonl
```

## Completed local preparation run

The extracted official data was prepared from `C:\Users\Anushka\Downloads\Hindi-English_train\train` and `C:\Users\Anushka\Downloads\Hindi-English_test\test`. The actual commands used were:

```powershell
py -m ml.data.prepare_dataset --dataset-root C:\Users\Anushka\Downloads\Hindi-English_train\train --kaldi-dir C:\Users\Anushka\Downloads\Hindi-English_train\train\transcripts --split train --output backend\data\mucs-2021\train-all.jsonl
py -m ml.data.prepare_dataset --dataset-root C:\Users\Anushka\Downloads\Hindi-English_test\test --kaldi-dir C:\Users\Anushka\Downloads\Hindi-English_test\test\transcripts --split test --output backend\data\mucs-2021\test.jsonl
py -m ml.data.split_manifest backend\data\mucs-2021\train-all.jsonl --train backend\data\mucs-2021\train.jsonl --validation backend\data\mucs-2021\validation.jsonl --test backend\data\mucs-2021\test.jsonl
py -m ml.data.build_tokenizer --manifest backend\data\mucs-2021\train.jsonl --output-dir backend\data\mucs-2021\processor
```

See `DATASET_AUDIT.md` for measured counts and validation findings. Do not commit generated manifests because they contain absolute local audio paths.
