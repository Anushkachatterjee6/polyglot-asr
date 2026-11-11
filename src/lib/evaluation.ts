import type { EvaluationMetric } from "@/lib/polyglot-api";

export type MetricKey = "WER" | "CER" | "LID" | "SwitchF1" | "RTF";

export type MetricDef = {
  key: MetricKey;
  label: string;
  short: string;
  aliases: string[];
  unit: "%" | "×" | "";
  better: "lower" | "higher";
};

export const METRICS: MetricDef[] = [
  {
    key: "WER",
    label: "Word Error Rate",
    short: "WER",
    aliases: ["wer", "word error"],
    unit: "%",
    better: "lower",
  },
  {
    key: "CER",
    label: "Character Error Rate",
    short: "CER",
    aliases: ["cer", "character error"],
    unit: "%",
    better: "lower",
  },
  {
    key: "LID",
    label: "Language ID Accuracy",
    short: "LID Acc.",
    aliases: ["lid", "language identification", "language id"],
    unit: "%",
    better: "higher",
  },
  {
    key: "SwitchF1",
    label: "Switch-Boundary F1",
    short: "Switch F1",
    aliases: ["switchf1", "switch_f1", "switch boundary", "switch-boundary", "boundary f1"],
    unit: "",
    better: "higher",
  },
  {
    key: "RTF",
    label: "Real-Time Factor",
    short: "RTF",
    aliases: ["rtf", "real-time", "real time"],
    unit: "×",
    better: "lower",
  },
];

export const WER_METRIC: MetricDef = METRICS[0]!;

export const PROTOCOL_EXPERIMENTS = [
  { id: "E0", label: "Original XLS-R" },
  { id: "E1", label: "Fine-tuned XLS-R" },
  { id: "E2", label: "Beam Search" },
  { id: "E3", label: "KenLM" },
  { id: "E4", label: "Contextual Adaptation" },
  { id: "E5", label: "Robustness Optimization" },
];

function escape(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Matches a backend metric name or experiment column to one of the five tracked metrics. */
export function matchMetric(name: string): MetricDef | undefined {
  const normalized = name.toLowerCase().trim();
  return METRICS.find((def) =>
    def.aliases.some(
      (alias) =>
        normalized === alias || new RegExp(`(^|[^a-z])${escape(alias)}([^a-z]|$)`).test(normalized),
    ),
  );
}

export function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value)))
    return Number(value);
  return null;
}

export function headlineMetric(
  metrics: EvaluationMetric[] | null | undefined,
  def: MetricDef,
): EvaluationMetric | undefined {
  const matches = (metrics ?? []).filter((m) => matchMetric(m.name)?.key === def.key);
  return matches.find((m) => toNumber(m.value) !== null) ?? matches[0];
}

export type ExperimentRow = {
  id: string;
  label: string;
  values: Record<MetricKey, number | null>;
  fromBackend: boolean;
};

const emptyValues = (): Record<MetricKey, number | null> => ({
  WER: null,
  CER: null,
  LID: null,
  SwitchF1: null,
  RTF: null,
});

/** Protocol experiments E0–E5 merged with backend rows. Values are only ever taken from the backend. */
export function mergeExperiments(
  rows: Array<Record<string, string | number | null>> | null | undefined,
): ExperimentRow[] {
  const merged: ExperimentRow[] = PROTOCOL_EXPERIMENTS.map((e) => ({
    ...e,
    values: emptyValues(),
    fromBackend: false,
  }));
  for (const row of rows ?? []) {
    const name = String(row["name"] ?? row["experiment"] ?? "").trim();
    if (!name) continue;
    const id = name.match(/^E\d+/i)?.[0].toUpperCase() ?? name;
    let target = merged.find((r) => r.id === id);
    if (!target) {
      target = {
        id,
        label: name.replace(/^E\d+\s*[·:\-–]?\s*/i, "") || name,
        values: emptyValues(),
        fromBackend: true,
      };
      merged.push(target);
    }
    target.fromBackend = true;
    for (const [key, value] of Object.entries(row)) {
      const def = matchMetric(key);
      if (def) target.values[def.key] = toNumber(value);
    }
  }
  return merged;
}

export function formatMetric(value: number | null, def: MetricDef) {
  if (value === null) return "—";
  if (def.unit === "%") return `${value.toFixed(value < 10 ? 2 : 1)}%`;
  if (def.unit === "×") return `${value.toFixed(3)}×`;
  return value.toFixed(3);
}

export function bestExperiment(rows: ExperimentRow[], def: MetricDef): string | null {
  const measured = rows.filter((r) => r.values[def.key] !== null);
  if (!measured.length) return null;
  return measured.reduce((best, r) => {
    const a = r.values[def.key]!;
    const b = best.values[def.key]!;
    return def.better === "lower" ? (a < b ? r : best) : a > b ? r : best;
  }).id;
}
