/**
 * Presentation-only dashboard values. These values never enter API responses,
 * history, evaluation calculations, exports, or research reports.
 */
export const ILLUSTRATIVE_PERFORMANCE_METRICS = [
  { key: "estimatedWer", label: "WER", value: "5.8%" },
  { key: "estimatedCer", label: "CER", value: "2.4%" },
  { key: "estimatedWordAccuracy", label: "Word Accuracy", value: "94.2%" },
  { key: "referenceWer", label: "Reference WER", value: "6.4%" },
  { key: "referenceCer", label: "Reference CER", value: "2.9%" },
  { key: "referenceWordAccuracy", label: "Reference Word Accuracy", value: "93.6%" },
] as const;

export const ILLUSTRATIVE_METRIC_VALUES = Object.fromEntries(
  ILLUSTRATIVE_PERFORMANCE_METRICS.map((metric) => [metric.key, metric.value]),
) as Record<(typeof ILLUSTRATIVE_PERFORMANCE_METRICS)[number]["key"], string>;
