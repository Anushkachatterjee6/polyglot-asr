import { describe, expect, it } from "vitest";
import {
  WER_METRIC,
  bestExperiment,
  headlineMetric,
  matchMetric,
  mergeExperiments,
} from "@/lib/evaluation";

describe("evaluation results", () => {
  it("matches backend metric names by abbreviation or full name", () => {
    expect(matchMetric("WER")?.key).toBe("WER");
    expect(matchMetric("Word Error Rate (WER)")?.key).toBe("WER");
    expect(matchMetric("Language Identification Accuracy")?.key).toBe("LID");
    expect(matchMetric("SwitchF1")?.key).toBe("SwitchF1");
    expect(matchMetric("Real-Time Factor")?.key).toBe("RTF");
    expect(matchMetric("power")).toBeUndefined();
  });

  it("keeps every protocol experiment unmeasured when the backend returns nothing", () => {
    const rows = mergeExperiments([]);
    expect(rows.map((r) => r.id)).toEqual(["E0", "E1", "E2", "E3", "E4", "E5"]);
    expect(rows.every((r) => Object.values(r.values).every((v) => v === null))).toBe(true);
  });

  it("uses only backend values and treats null as not measured", () => {
    const rows = mergeExperiments([
      { name: "E1 · Fine-tuned XLS-R", WER: 31.2, CER: null },
      { name: "E3", WER: "28.4" },
    ]);
    expect(rows.find((r) => r.id === "E1")?.values.WER).toBe(31.2);
    expect(rows.find((r) => r.id === "E1")?.values.CER).toBeNull();
    expect(rows.find((r) => r.id === "E3")?.values.WER).toBe(28.4);
    expect(bestExperiment(rows, WER_METRIC)).toBe("E3");
  });

  it("prefers a measured headline metric over a null one", () => {
    const metric = headlineMetric(
      [
        { name: "WER", value: null, unit: "%" },
        { name: "WER", value: 25, unit: "%", experiment: "E4" },
      ],
      WER_METRIC,
    );
    expect(metric?.experiment).toBe("E4");
  });
});
