import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  CircleAlert,
  CloudOff,
  Download,
  Eye,
  EyeOff,
  FileAudio2,
  RefreshCw,
  Search,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { getHistory, isDemoMode, type TranscriptResult } from "@/lib/polyglot-api";
import { identifyWords, languageMix, languageStats, type LanguageMix } from "@/lib/language-stats";
import { canExportSrt, type ExportFormat } from "@/lib/transcript-format";
import { usePreferences } from "@/lib/polyglot-store";
import {
  EmptyState,
  LanguageLegend,
  LoadingBlock,
  Notice,
  PageHeading,
  SectionHeading,
  Surface,
  TokenText,
  downloadTranscript,
  formatDuration,
} from "./ui";

type Filter = "all" | LanguageMix;
type Sort = "newest" | "oldest" | "longest" | "name";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "mixed", label: "Code-switched" },
  { value: "hindi", label: "Mostly Hindi" },
  { value: "english", label: "Mostly English" },
];

export function HistoryPage() {
  const prefs = usePreferences();
  const [records, setRecords] = useState<TranscriptResult[]>([]);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(!isDemoMode);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("newest");
  const [viewing, setViewing] = useState<TranscriptResult | null>(null);

  const load = useCallback(() => {
    if (isDemoMode) return;
    setLoading(true);
    setError("");
    getHistory()
      .then((items) => setRecords(Array.isArray(items) ? items : []))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "History unavailable."))
      .finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  const dateFormat = useMemo(
    () => new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }),
    [],
  );
  const enriched = useMemo(
    () =>
      records.map((r) => ({
        record: r,
        stats: languageStats(r.words?.length ? r.words : identifyWords(r.transcript)),
      })),
    [records],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = enriched.filter(
      ({ record, stats }) =>
        !hidden.has(record.id) &&
        (filter === "all" || languageMix(stats) === filter) &&
        (!q ||
          record.filename.toLowerCase().includes(q) ||
          record.transcript.toLowerCase().includes(q) ||
          record.contextualTranscript?.toLowerCase().includes(q)),
    );
    const time = (r: TranscriptResult) => (r.createdAt ? Date.parse(r.createdAt) || 0 : 0);
    return [...list].sort((a, b) => {
      if (sort === "name") return a.record.filename.localeCompare(b.record.filename);
      if (sort === "longest")
        return (b.record.durationSeconds ?? 0) - (a.record.durationSeconds ?? 0);
      if (sort === "oldest") return time(a.record) - time(b.record);
      return time(b.record) - time(a.record);
    });
  }, [enriched, hidden, filter, query, sort]);

  async function download(record: TranscriptResult, format: ExportFormat) {
    try {
      await downloadTranscript(record, format);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Download failed.");
    }
  }

  const viewingStats = viewing
    ? languageStats(viewing.words?.length ? viewing.words : identifyWords(viewing.transcript))
    : null;

  return (
    <>
      <PageHeading
        eyebrow="Session archive"
        title="Transcription History"
        action={
          <Button variant="outline" size="sm" onClick={load} disabled={isDemoMode || loading}>
            <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
            Refresh
          </Button>
        }
      >
        Transcripts stored by the connected model service. The archive is never filled with sample
        recordings.
      </PageHeading>

      <Surface className="px-5 py-5">
        <SectionHeading
          title="Processed audio"
          detail={
            isDemoMode
              ? "History loads from the backend once it is connected"
              : loading
                ? "Loading…"
                : `${visible.length} of ${records.length - hidden.size} recordings`
          }
        />

        {!isDemoMode && records.length > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="relative min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search file names and transcripts"
                aria-label="Search history"
                className="pl-8"
              />
            </div>
            <div
              role="group"
              aria-label="Language filter"
              className="flex flex-wrap gap-1 rounded-md border border-border p-0.5"
            >
              {FILTERS.map((f) => (
                <button
                  key={f.value}
                  aria-pressed={filter === f.value}
                  onClick={() => setFilter(f.value)}
                  className={cn(
                    "rounded-[5px] px-2.5 py-1 text-[11px] font-medium transition-colors",
                    filter === f.value
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
              Sort
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as Sort)}
                className="field h-8 w-auto px-2 text-xs"
              >
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
                <option value="longest">Longest</option>
                <option value="name">Name</option>
              </select>
            </label>
          </div>
        )}

        {loading ? (
          <LoadingBlock label="Loading history…" />
        ) : error ? (
          <div className="space-y-3">
            <Notice tone="error" icon={CircleAlert}>
              History unavailable: {error}
            </Notice>
            <EmptyState
              icon={CloudOff}
              title="Couldn't reach the archive"
              detail="Check that the backend is running, then refresh."
              action={
                <Button variant="outline" size="sm" onClick={load}>
                  Try again
                </Button>
              }
            />
          </div>
        ) : records.length === 0 ? (
          <EmptyState
            icon={FileAudio2}
            title="No recordings in the archive"
            detail={
              isDemoMode
                ? "Recording history will load from the FastAPI service when it is connected. No sample data is shown."
                : "Completed backend transcriptions will appear here."
            }
          />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={Search}
            title="No matches"
            detail="Try a different search or language filter."
            action={
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setQuery("");
                  setFilter("all");
                }}
              >
                Clear filters
              </Button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead className="border-b border-border text-[11px] text-muted-foreground">
                <tr>
                  {["Recording", "Date", "Duration", "Language mix", "Transcript", ""].map((x) => (
                    <th key={x} className="px-3 py-2.5 font-medium">
                      {x}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visible.map(({ record, stats }) => (
                  <tr key={record.id} className="hover:bg-accent/30">
                    <td className="max-w-48 truncate px-3 py-3 font-medium" title={record.filename}>
                      {record.filename}
                    </td>
                    <td className="data-mono whitespace-nowrap px-3 py-3 text-muted-foreground">
                      {record.createdAt && !Number.isNaN(Date.parse(record.createdAt))
                        ? dateFormat.format(new Date(record.createdAt))
                        : "—"}
                    </td>
                    <td className="data-mono px-3 py-3 text-muted-foreground">
                      {record.durationSeconds == null
                        ? "—"
                        : formatDuration(record.durationSeconds)}
                    </td>
                    <td className="px-3 py-3">
                      <div
                        className="flex h-1.5 w-24 overflow-hidden rounded-full bg-muted"
                        title={`Hindi ${stats.hindiShare}% · English ${stats.englishShare}%`}
                      >
                        <span className="bg-hindi" style={{ width: `${stats.hindiShare}%` }} />
                        <span className="bg-english" style={{ width: `${stats.englishShare}%` }} />
                      </div>
                      <span className="data-mono mt-1 block text-[10px] text-muted-foreground">
                        {stats.switches} switches
                      </span>
                    </td>
                    <td className="transcript-copy max-w-72 truncate px-3 py-3 text-muted-foreground">
                      {record.transcript}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex justify-end gap-0.5">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          aria-label={`View ${record.filename}`}
                          onClick={() => setViewing(record)}
                        >
                          <Eye />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          aria-label={`Download ${record.filename}`}
                          onClick={() =>
                            void download(
                              record,
                              prefs.exportFormat === "srt" && !canExportSrt(record)
                                ? "txt"
                                : prefs.exportFormat,
                            )
                          }
                        >
                          <Download />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          aria-label={`Hide ${record.filename} from view`}
                          title="Hide from this view"
                          onClick={() => setHidden((s) => new Set(s).add(record.id))}
                        >
                          <EyeOff />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {hidden.size > 0 && (
          <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
            <span>{hidden.size} hidden from this view (still stored on the backend).</span>
            <Button
              variant="link"
              size="sm"
              className="h-auto p-0 text-[11px]"
              onClick={() => setHidden(new Set())}
            >
              Show all
            </Button>
          </div>
        )}
      </Surface>

      <Dialog open={viewing !== null} onOpenChange={(open) => !open && setViewing(null)}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          {viewing && viewingStats && (
            <>
              <DialogHeader>
                <DialogTitle className="truncate pr-6">{viewing.filename}</DialogTitle>
                <DialogDescription className="data-mono text-xs">
                  {[
                    viewing.createdAt && !Number.isNaN(Date.parse(viewing.createdAt))
                      ? dateFormat.format(new Date(viewing.createdAt))
                      : null,
                    viewing.durationSeconds != null
                      ? formatDuration(viewing.durationSeconds)
                      : null,
                    `${viewingStats.hindi} HI · ${viewingStats.english} EN · ${viewingStats.switches} switches`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </DialogDescription>
              </DialogHeader>
              <div className="rounded-md border border-border bg-background/40 p-4">
                <p className="eyebrow mb-2 text-muted-foreground">Model transcript</p>
                <TokenText
                  words={viewing.words}
                  fallback={viewing.transcript}
                  showTimestamps={prefs.showTimestamps}
                  showConfidence={prefs.showConfidence}
                />
              </div>
              {viewing.contextualTranscript && (
                <div className="rounded-md border border-primary/25 bg-primary/[0.04] p-4">
                  <p className="eyebrow mb-2 flex items-center gap-1.5 text-primary">
                    <Sparkles className="size-3" />
                    Context-adapted
                  </p>
                  <TokenText fallback={viewing.contextualTranscript} />
                </div>
              )}
              <LanguageLegend />
              <div className="flex flex-wrap gap-2 border-t border-border pt-4">
                <Button variant="outline" size="sm" onClick={() => void download(viewing, "txt")}>
                  <Download className="size-3.5" />
                  .txt
                </Button>
                <Button variant="outline" size="sm" onClick={() => void download(viewing, "json")}>
                  <Download className="size-3.5" />
                  .json
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!canExportSrt(viewing)}
                  onClick={() => void download(viewing, "srt")}
                >
                  <Download className="size-3.5" />
                  .srt
                </Button>
                <Badge variant="outline" className="ml-auto border-success/30 text-success">
                  Completed
                </Badge>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
