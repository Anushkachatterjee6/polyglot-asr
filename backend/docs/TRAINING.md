# GPU training and inference

Fine-tuning XLS-R 300M requires a CUDA-capable GPU (or a Colab/Kaggle GPU runtime), sufficient storage, and prepared train/validation manifests. Run from the repository root after installing `backend/requirements.txt`:

```powershell
python -m ml.data.build_tokenizer --manifest D:\datasets\mucs-2021\manifests\train.jsonl --output-dir D:\models\polyglot-processor
python -m ml.training.train --train-manifest D:\datasets\mucs-2021\manifests\train.jsonl --validation-manifest D:\datasets\mucs-2021\manifests\validation.jsonl --processor-path D:\models\polyglot-processor --output-dir D:\models\polyglot-xlsr
python -m ml.training.train --train-manifest D:\datasets\mucs-2021\manifests\train.jsonl --validation-manifest D:\datasets\mucs-2021\manifests\validation.jsonl --processor-path D:\models\polyglot-processor --output-dir D:\models\polyglot-xlsr --resume-from-checkpoint D:\models\polyglot-xlsr\checkpoint-1000
```

The trainer uses `facebook/wav2vec2-xls-r-300m`, CTC labels with padded labels masked to `-100`, gradient accumulation, FP16, checkpointing, and saves the processor with the model. Review GPU precision and batch settings in `ml/configs/xlsr_ctc.json` before running. No training, WER, CER, LID, switch-F1, or RTF results have been produced in this checkout.
