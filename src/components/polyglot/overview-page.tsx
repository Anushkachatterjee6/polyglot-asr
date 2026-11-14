import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Activity,
  ArrowRight,
  AudioLines,
  BookOpenText,
  Clock3,
  FileAudio2,
  Headphones,
  Shield,
  Waves,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  getHistory,
  getModelInfo,
  isDemoMode,
  type ModelInfo,
  type TranscriptResult,
} from "@/lib/polyglot-api";
import { ILLUSTRATIVE_PERFORMANCE_METRICS } from "@/lib/presentation-metrics";
import {
  DataValue,
  EmptyState,
  LoadingBlock,
  PageHeading,
  SectionHeading,
  Surface,
  formatDuration,
} from "./ui";

const QUICK_LINKS = [
  {
    to: "/transcription",
    label: "Transcribe audio",
    detail: "Upload or record a sample",
    icon: AudioLines,
  },
  {
    to: "/language-analysis",
    label: "Analyze switching",
    detail: "Token labels & switch points",
    icon: Waves,
  },
  {
    to: "/context-adaptation",
    label: "Tune vocabulary",
    detail: "Domain terms for rescoring",
    icon: BookOpenText,
  },
  {
    to: "/model-evaluation",
    label: "View analytics",
    detail: "Live transcription insights",
    icon: Activity,
  },
] as const;

export function OverviewPage() {
  const [model, setModel] = useState<ModelInfo | null>(null);
  const [history, setHistory] = useState<TranscriptResult[] | null>(null);
  const [loading, setLoading] = useState(!isDemoMode);

  useEffect(() => {
    if (isDemoMode) return;
    void Promise.allSettled([
      getModelInfo().then(setModel),
      getHistory().then(setHistory),
    ]).finally(() => setLoading(false));
  }, []);

  const recent = (history ?? []).slice(0, 5);

  return (
    <>
      <PageHeading
        eyebrow="Research overview"
        title="Polyglot ASR"
        action={
          <Badge
            variant="outline"
            className="gap-1.5 border-warning/30 bg-warning/5 px-2.5 py-1.5 text-warning"
          >
            <span className="size-1.5 rounded-full bg-warning" />
            {model?.status ?? (isDemoMode ? "Backend not connected" : "Evaluation pending")}
          </Badge>
        }
      >
        Code-switched Hindi–English speech recognition with Gemini 3.5 Transcribe
        model and contextual language adaptation.
      </PageHeading>

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <DataValue
          label="Processed recordings"
          value={history ? history.length : "—"}
          note={history ? "From backend history" : "Awaiting connected data"}
          icon={FileAudio2}
          tone={history ? "measured" : "pending"}
        />
        <DataValue
          label="Word error rate"
          value={ILLUSTRATIVE_PERFORMANCE_METRICS[0].value}
          note="Illustrative presentation value · not measured"
          icon={Activity}
          tone="pending"
        />
        <DataValue
          label="Supported languages"
          value={model?.supportedLanguages?.join(" + ") ?? "Hindi + English"}
          note="Code-switched speech pair"
          icon={AudioLines}
        />
        <DataValue
          label="Acoustic model"
          value={model?.model ?? "Gemini 3.5 Transcribe"}
          note={model?.dataset ?? "MUCS 2021 · Subtask 2"}
          icon={Waves}
        />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {QUICK_LINKS.map(({ to, label, detail, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            className="group research-surface flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3.5 transition-colors hover:border-primary/35 hover:bg-accent/40"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Icon className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{label}</span>
              <span className="block truncate text-[11px] text-muted-foreground">{detail}</span>
            </span>
            <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.35fr_1fr]">
        <Surface className="flex min-h-[320px] flex-col px-5 py-5">
          <SectionHeading
            title="Model performance"
            detail="Presentation summary aligned with Model Evaluation"
            action={
              <Link to="/model-evaluation" className="text-xs text-primary hover:underline">
                Details →
              </Link>
            }
          />
          {loading ? (
            <LoadingBlock />
          ) : (
            <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-3">
              {ILLUSTRATIVE_PERFORMANCE_METRICS.map((metric) => (
                <div key={metric.key} className="rounded-md border border-border px-3 py-3">
                  <p className="text-[11px] text-muted-foreground">{metric.label}</p>
                  <p className="data-mono mt-1.5 text-lg font-semibold">
                    {metric.value}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    Illustrative presentation value
                  </p>
                </div>
              ))}
            </div>
          )}
          <div className="mt-auto flex items-center gap-2 border-t border-border pt-3 text-[11px] text-muted-foreground">
            <Shield className="size-3.5 text-primary" />
            Illustrative values are display-only and excluded from research records and exports.
          </div>
        </Surface>

        <Surface className="min-h-[320px] px-5 py-5">
          <SectionHeading
            title="Recent transcriptions"
            detail="Latest audio sessions"
            action={
              <Link to="/history" className="text-xs text-primary hover:underline">
                All history →
              </Link>
            }
          />
          {loading ? (
            <LoadingBlock />
          ) : recent.length ? (
            <ul className="divide-y divide-border">
              {recent.map((r) => (
                <li key={r.id} className="py-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate text-xs font-medium">{r.filename}</span>
                    <span className="data-mono flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground">
                      <Clock3 className="size-3" />
                      {formatDuration(r.durationSeconds)}
                    </span>
                  </div>
                  <p className="transcript-copy mt-1 truncate text-xs text-muted-foreground">
                    {r.transcript}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={Headphones}
              title="No recordings processed"
              detail={
                isDemoMode
                  ? "Audio processed by the connected research service will appear here."
                  : "Transcribe your first sample to see it here."
              }
            />
          )}
        </Surface>
      </div>

      <Surface className="mt-5 px-5 py-5">
        <SectionHeading title="Research configuration" detail="Current experiment foundation" />
        <div className="grid grid-cols-1 divide-y divide-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {[
            ["Dataset", "MUCS 2021 · Subtask 2"],
            ["ASR engine", "Google Gemini 3.5 Transcribe"],
            ["Language pair", "Hindi + English · hi-IN / en-IN"],
          ].map(([k, v]) => (
            <div key={k} className="py-3 first:pt-0 sm:px-4 sm:py-1 sm:first:pl-0">
              <span className="eyebrow text-muted-foreground">{k}</span>
              <p className="mt-1 text-sm font-medium">{v}</p>
            </div>
          ))}
        </div>
      </Surface>
    </>
  );
}
