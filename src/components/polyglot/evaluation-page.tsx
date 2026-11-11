import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  ArrowDown,
  ArrowUp,
  AudioLines,
  ChartNoAxesCombined,
  CircleAlert,
  Gauge,
  RefreshCw,
  Shield,
  Sparkles,
  Waves,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getEvaluation, isDemoMode, type EvaluationMetric } from "@/lib/polyglot-api";
import {
  METRICS,
  bestExperiment,
  formatMetric,
  headlineMetric,
  mergeExperiments,
  toNumber,
  type MetricKey,
} from "@/lib/evaluation";
import {
  DataValue,
  EmptyState,
  LoadingBlock,
  Notice,
  PageHeading,
  SectionHeading,
  Surface,
  chartTooltipStyle,
} from "./ui";

const ICONS = {
  WER: Activity,
  CER: AudioLines,
  LID: Waves,
  SwitchF1: Sparkles,
  RTF: Gauge,
} as const;

export function EvaluationPage() {
  const [data, setData] = useState<{
    metrics: EvaluationMetric[];
    experiments: Array<Record<string, string | number | null>>;
  } | null>(null);
  const [loading, setLoading] = useState(!isDemoMode);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<MetricKey>("WER");

  const load = useCallback(() => {
    if (isDemoMode) return;
    setLoading(true);
    setError("");
    getEvaluation()
      .then((res) => setData({ metrics: res.metrics ?? [], experiments: res.experiments ?? [] }))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Evaluation unavailable."))
      .finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  const rows = useMemo(() => mergeExperiments(data?.experiments), [data]);
  const def = METRICS.find((m) => m.key === selected)!;
  const chartData = rows
    .filter((r) => r.values[selected] !== null)
    .map((r) => ({ name: r.id, label: r.label, value: r.values[selected] as number }));
  const best = bestExperiment(rows, def);
  const baseline = rows.find((r) => r.id === "E0")?.values[selected] ?? null;
  const measuredCount = rows.reduce(
    (n, r) => n + Object.values(r.values).filter((v) => v !== null).length,
    0,
  );

  return (
    <>
      <PageHeading
        eyebrow="Benchmarks & experiments"
        title="Model Evaluation"
        action={
          <Button variant="outline" size="sm" onClick={load} disabled={isDemoMode || loading}>
            <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
            Refresh results
          </Button>
        }
      >
        Metrics come only from completed backend evaluations. Anything not yet measured is shown as
        “—”, never estimated.
      </PageHeading>

      <div className="mb-5">
        {error ? (
          <Notice tone="error" icon={CircleAlert}>
            Couldn't load evaluation results: {error}
          </Notice>
        ) : isDemoMode ? (
          <Notice tone="warning" icon={Shield}>
            <strong className="text-foreground">No results available in demo mode.</strong> Connect
            the backend to load measured WER, CER, LID accuracy, switch-boundary F1 and RTF.
          </Notice>
        ) : (
          <Notice tone="info" icon={Shield}>
            <strong className="text-foreground">
              {measuredCount
                ? `${measuredCount} measured value${measuredCount === 1 ? "" : "s"} from the backend.`
                : "Backend connected — no measurements yet."}
            </strong>{" "}
            Empty cells are intentional; no numbers are invented.
          </Notice>
        )}
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {METRICS.map((m) => {
          const metric = headlineMetric(data?.metrics, m);
          const value = toNumber(metric?.value);
          return (
            <DataValue
              key={m.key}
              label={m.label}
              value={loading ? "…" : formatMetric(value, m)}
              note={
                value === null
                  ? "Not available"
                  : `Measured${metric?.experiment ? ` · ${metric.experiment}` : ""} · ${m.better} is better`
              }
              icon={ICONS[m.key]}
              tone={value === null ? "pending" : "measured"}
            />
          );
        })}
      </div>

      <Surface className="mb-5 px-5 py-5">
        <SectionHeading
          title="Experiment comparison"
          detail={
            <span className="inline-flex items-center gap-1">
              {def.label} ·{" "}
              {def.better === "lower" ? (
                <ArrowDown className="size-3" />
              ) : (
                <ArrowUp className="size-3" />
              )}
              {def.better} is better
            </span>
          }
          action={
            <div
              role="tablist"
              aria-label="Metric"
              className="flex flex-wrap gap-1 rounded-md border border-border p-0.5"
            >
              {METRICS.map((m) => (
                <button
                  key={m.key}
                  role="tab"
                  aria-selected={selected === m.key}
                  onClick={() => setSelected(m.key)}
                  className={cn(
                    "rounded-[5px] px-2.5 py-1 text-[11px] font-medium transition-colors",
                    selected === m.key
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {m.short}
                </button>
              ))}
            </div>
          }
        />
        {loading ? (
          <LoadingBlock label="Loading evaluation results…" />
        ) : chartData.length ? (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 16, right: 12, bottom: 4, left: 0 }}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 5" vertical={false} />
                <XAxis
                  dataKey="name"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  width={44}
                  tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                />
                <Tooltip
                  contentStyle={chartTooltipStyle}
                  cursor={{ fill: "var(--muted)" }}
                  formatter={(v: number) => [formatMetric(v, def), def.short]}
                  labelFormatter={(id: string) =>
                    `${id} · ${chartData.find((d) => d.name === id)?.label ?? ""}`
                  }
                />
                <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={56}>
                  {chartData.map((d) => (
                    <Cell
                      key={d.name}
                      fill={d.name === best ? "var(--primary)" : "var(--english)"}
                      fillOpacity={d.name === best ? 1 : 0.55}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <EmptyState
            icon={ChartNoAxesCombined}
            title={`No measured ${def.short} values yet`}
            detail="E0–E5 are the experiments defined in the research protocol. Bars appear only for experiments the backend has actually evaluated."
          />
        )}
      </Surface>

      <Surface className="px-5 py-5">
        <SectionHeading
          title="Results by experiment"
          detail="Protocol experiments plus any extra runs returned by the backend"
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-xs">
            <thead className="border-b border-border text-[11px] text-muted-foreground">
              <tr>
                <th className="py-2.5 pr-4 font-medium">Experiment</th>
                {METRICS.map((m) => (
                  <th
                    key={m.key}
                    className={cn(
                      "px-3 py-2.5 text-right font-medium",
                      m.key === selected && "text-primary",
                    )}
                  >
                    {m.short}
                  </th>
                ))}
                <th className="py-2.5 pl-3 text-right font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => {
                const count = Object.values(row.values).filter((v) => v !== null).length;
                return (
                  <tr key={row.id} className="hover:bg-accent/30">
                    <td className="py-3 pr-4">
                      <span className="data-mono mr-2 text-primary">{row.id}</span>
                      <span className="font-medium">{row.label}</span>
                    </td>
                    {METRICS.map((m) => {
                      const v = row.values[m.key];
                      const delta =
                        m.key === selected && v !== null && baseline !== null && row.id !== "E0"
                          ? v - baseline
                          : null;
                      return (
                        <td
                          key={m.key}
                          className={cn(
                            "data-mono px-3 py-3 text-right",
                            v === null
                              ? "text-muted-foreground/60"
                              : bestExperiment(rows, m) === row.id
                                ? "font-semibold text-primary"
                                : "",
                          )}
                        >
                          <span aria-label={v === null ? "not measured" : undefined}>
                            {formatMetric(v, m)}
                          </span>
                          {delta !== null && (
                            <span
                              className={cn(
                                "ml-1.5 text-[10px]",
                                (m.better === "lower" ? delta < 0 : delta > 0)
                                  ? "text-success"
                                  : "text-destructive",
                              )}
                            >
                              {delta > 0 ? "+" : ""}
                              {delta.toFixed(2)}
                            </span>
                          )}
                        </td>
                      );
                    })}
                    <td className="py-3 pl-3 text-right">
                      <span
                        className={cn(
                          "rounded-sm border px-2 py-0.5 text-[10px]",
                          count
                            ? "border-success/30 text-success"
                            : "border-border text-muted-foreground",
                        )}
                      >
                        {count ? `Measured ${count}/5` : "Not evaluated"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">
          Bold = best measured value per metric. Coloured deltas compare the selected metric against
          the E0 baseline.
        </p>
      </Surface>
    </>
  );
}
