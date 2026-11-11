"""XLS-R 300M CTC training entry point.

Run only after manifest inspection and with GPU-compatible torch installed.
"""
from __future__ import annotations
import argparse
import json
from pathlib import Path
from dataclasses import dataclass

from ml.training.dataset import load_audio, read_manifest


@dataclass
class DataCollatorCTC:
    processor: object

    def __call__(self, features):
        import torch
        audio = self.processor.pad([{"input_values": feature["input_values"]} for feature in features], padding=True, return_tensors="pt")
        with self.processor.as_target_processor():
            labels = self.processor.pad([{"input_ids": feature["labels"]} for feature in features], padding=True, return_tensors="pt")
        audio["labels"] = labels["input_ids"].masked_fill(labels.attention_mask.ne(1), -100)
        return audio


class AudioManifestDataset:
    """Lazy manifest dataset: audio is decoded only for the requested batch."""

    def __init__(self, rows: list[dict[str, object]], processor: object, sample_rate: int) -> None:
        self.rows = rows
        self.processor = processor
        self.sample_rate = sample_rate

    def __len__(self) -> int:
        return len(self.rows)

    def __getitem__(self, index: int) -> dict[str, object]:
        row = self.rows[index]
        audio = load_audio(row, self.sample_rate)
        input_values = self.processor(
            audio,
            sampling_rate=self.sample_rate,
            return_tensors="np",
        ).input_values[0]
        labels = self.processor.tokenizer(
            str(row["transcript"]),
            add_special_tokens=False,
        ).input_ids
        return {"input_values": input_values, "labels": labels}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--train-manifest", type=Path, required=True)
    parser.add_argument("--validation-manifest", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--resume-from-checkpoint", type=Path)
    parser.add_argument("--model-name", default="facebook/wav2vec2-xls-r-300m")
    parser.add_argument("--processor-path", type=Path, required=True)
    parser.add_argument("--config", type=Path, default=Path("ml/configs/xlsr_ctc.json"))
    args = parser.parse_args()
    # Imports are deferred so preparation tooling can run without GPU packages.
    import torch
    from transformers import AutoModelForCTC, AutoProcessor, Trainer, TrainingArguments
    if not torch.cuda.is_available():
        raise SystemExit(
            "CUDA GPU is required for XLS-R 300M training. Install CUDA-enabled PyTorch "
            "on a machine with a supported NVIDIA GPU; CPU training is intentionally disabled."
        )
    config = json.loads(args.config.read_text(encoding="utf-8"))
    processor = AutoProcessor.from_pretrained(str(args.processor_path))
    model = AutoModelForCTC.from_pretrained(args.model_name, vocab_size=len(processor.tokenizer), ctc_loss_reduction="mean", pad_token_id=processor.tokenizer.pad_token_id, ignore_mismatched_sizes=True)
    model.gradient_checkpointing_enable()
    model.config.use_cache = False

    def make_dataset(manifest: Path):
        return AudioManifestDataset(read_manifest(manifest), processor, int(config["sampling_rate"]))

    use_bf16 = torch.cuda.is_bf16_supported()
    training_args = TrainingArguments(output_dir=str(args.output_dir), learning_rate=config["learning_rate"], num_train_epochs=config["num_train_epochs"], per_device_train_batch_size=config["per_device_train_batch_size"], per_device_eval_batch_size=config["per_device_eval_batch_size"], gradient_accumulation_steps=config["gradient_accumulation_steps"], fp16=bool(config["fp16"]) and not use_bf16, bf16=use_bf16, gradient_checkpointing=True, evaluation_strategy=config["evaluation_strategy"], save_strategy="epoch", save_total_limit=config["save_total_limit"], load_best_model_at_end=True, metric_for_best_model="eval_loss", greater_is_better=False, logging_steps=20, report_to=[])
    trainer = Trainer(model=model, args=training_args, train_dataset=make_dataset(args.train_manifest), eval_dataset=make_dataset(args.validation_manifest), data_collator=DataCollatorCTC(processor))
    trainer.train(resume_from_checkpoint=str(args.resume_from_checkpoint) if args.resume_from_checkpoint else None)
    trainer.save_model(str(args.output_dir))
    processor.save_pretrained(str(args.output_dir))


if __name__ == "__main__":
    main()
