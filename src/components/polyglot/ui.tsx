import type { ReactNode } from "react";
import { Activity, CloudOff, LoaderCircle, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  downloadText,
  exportTranscript,
  isDemoMode,
  type TranscriptResult,
  type TranscriptWord,
} from "@/lib/polyglot-api";
import { identifyWords } from "@/lib/language-stats";
import { formatTranscript, type ExportFormat } from "@/lib/transcript-format";

export function PageHeading({
  eyebrow,
  title,
  children,
  action,
}: {
  eyebrow: string;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <div className="eyebrow mb-2 text-primary">{eyebrow}</div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-[30px]">{title}</h1>
        {children && (
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{children}</p>
        )}
      </div>
      {action && <div className="flex flex-wrap items-center gap-2">{action}</div>}
    </div>
  );
}

export function SectionHeading({
  title,
  detail,
  action,
}: {
  title: string;
  detail?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold">{title}</h2>
        {detail && <p className="mt-1 text-xs text-muted-foreground">{detail}</p>}
      </div>
      {action && <div className="flex flex-wrap items-center gap-1.5">{action}</div>}
    </div>
  );
}

export function Surface({
  children,
  className,
  ...rest
}: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLElement>) {
  return (
    <section
      className={cn("research-surface rounded-lg border border-border bg-card", className)}
      {...rest}
    >
      {children}
    </section>
  );
}

export function EmptyState({
  icon: Icon = CloudOff,
  title,
  detail,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  detail: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center gap-2 px-5 py-8 text-center">
      <span className="flex size-10 items-center justify-center rounded-md border border-border bg-muted/40 text-muted-foreground">
        <Icon className="size-[18px]" />
      </span>
      <p className="mt-1 text-sm font-medium">{title}</p>
      <p className="max-w-md text-xs leading-5 text-muted-foreground">{detail}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function LoadingBlock({ label = "Loading…" }: { label?: string }) {
  return (
    <div
      role="status"
      className="flex min-h-40 flex-col items-center justify-center gap-3 text-xs text-muted-foreground"
    >
      <LoaderCircle className="size-5 animate-spin text-primary" />
      {label}
    </div>
  );
}

export function DataValue({
  label,
  value,
  note,
  icon: Icon = Activity,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  note: ReactNode;
  icon?: LucideIcon;
  tone?: "default" | "measured" | "pending";
}) {
  return (
    <Surface className="metric-tile px-4 py-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <Icon className="size-4 shrink-0 text-primary" />
      </div>
      <p
        className={cn(
          "data-mono mt-3 text-xl font-semibold",
          tone === "pending" && "text-muted-foreground",
        )}
      >
        {value}
      </p>
      <p
        className={cn(
          "mt-1 text-[11px] text-muted-foreground",
          tone === "measured" && "text-success",
        )}
      >
        {note}
      </p>
    </Surface>
  );
}

export function Notice({
  tone = "info",
  icon: Icon,
  children,
}: {
  tone?: "info" | "warning" | "error";
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <div
      role={tone === "error" ? "alert" : undefined}
      className={cn(
        "flex items-start gap-2.5 rounded-md border px-3.5 py-3 text-xs leading-5",
        tone === "info" && "border-primary/20 bg-primary/[0.04] text-muted-foreground",
        tone === "warning" && "border-warning/25 bg-warning/[0.05] text-muted-foreground",
        tone === "error" && "border-destructive/30 bg-destructive/[0.06] text-destructive",
      )}
    >
      <Icon
        className={cn(
          "mt-0.5 size-4 shrink-0",
          tone === "info" && "text-primary",
          tone === "warning" && "text-warning",
        )}
      />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function ModeBadge() {
  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1.5 px-2.5 py-1",
        isDemoMode
          ? "border-warning/30 bg-warning/5 text-warning"
          : "border-success/30 bg-success/5 text-success",
      )}
    >
      <span className={cn("size-1.5 rounded-full", isDemoMode ? "bg-warning" : "bg-success")} />
      {isDemoMode ? "Backend not connected" : "Backend configured"}
    </Badge>
  );
}

export function LanguageLegend({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-muted-foreground",
        className,
      )}
    >
      <span className="flex items-center gap-1.5">
        <span className="size-2 rounded-full bg-hindi" />
        Hindi
      </span>
      <span className="flex items-center gap-1.5">
        <span className="size-2 rounded-full bg-english" />
        English
      </span>
      <span className="flex items-center gap-1.5">
        <span className="size-2 rounded-full bg-other-lang" />
        Other / punctuation
      </span>
    </div>
  );
}

export function tokenClass(language: TranscriptWord["language"]) {
  return language === "hi" ? "token-hindi" : language === "en" ? "token-english" : "token-other";
}

export function TokenText({
  words,
  fallback,
  showTimestamps = false,
  showConfidence = false,
  className,
}: {
  words?: TranscriptWord[] | undefined;
  fallback: string;
  showTimestamps?: boolean;
  showConfidence?: boolean;
  className?: string | undefined;
}) {
  const tokens = words?.length ? words : identifyWords(fallback);
  return (
    <p className={cn("transcript-copy text-[15px] leading-8", className)}>
      {tokens.map((word, index) => {
        const title = [
          word.language === "hi" ? "Hindi" : word.language === "en" ? "English" : "Other",
          word.start === undefined ? null : `${word.start.toFixed(2)}s`,
          word.confidence === undefined ? null : `${Math.round(word.confidence * 100)}% confidence`,
        ]
          .filter(Boolean)
          .join(" · ");
        const lowConfidence =
          showConfidence && word.confidence !== undefined && word.confidence < 0.6;
        return (
          <span
            key={`${index}-${word.text}`}
            title={title}
            className={cn(
              tokenClass(word.language),
              lowConfidence && "underline decoration-warning decoration-dotted underline-offset-4",
            )}
          >
            {showTimestamps && word.start !== undefined && (
              <sup className="data-mono mr-0.5 text-[9px] text-muted-foreground">
                {word.start.toFixed(1)}
              </sup>
            )}
            {word.text}
            {index < tokens.length - 1 ? " " : ""}
          </span>
        );
      })}
    </p>
  );
}

export const chartTooltipStyle = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: "6px",
  color: "var(--popover-foreground)",
  fontSize: 11,
};

export function formatDuration(seconds?: number | null) {
  if (seconds == null || !Number.isFinite(seconds)) return "--:--";
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Downloads a transcript. txt/json try the backend export endpoint first, then format locally. */
export async function downloadTranscript(result: TranscriptResult, format: ExportFormat) {
  if (format !== "srt" && !isDemoMode) {
    try {
      const exported = await exportTranscript({ transcript: result.transcript, format });
      downloadText(
        exported.filename,
        exported.content,
        format === "json" ? "application/json;charset=utf-8" : undefined,
      );
      return;
    } catch {
      /* fall through to local formatting */
    }
  }
  const local = formatTranscript(result, format);
  downloadText(local.filename, local.content, local.mimeType);
}
