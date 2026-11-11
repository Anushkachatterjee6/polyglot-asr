import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  ArrowLeftRight,
  AudioLines,
  CircleAlert,
  FileText,
  History,
  Info,
  LoaderCircle,
  Ruler,
  ScanText,
  Sparkles,
  Waves,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { analyzeLanguage, isDemoMode, type TranscriptWord } from "@/lib/polyglot-api";
import { identifyWords, languageStats } from "@/lib/language-stats";
import { useSession } from "@/lib/polyglot-store";
import {
  DataValue,
  EmptyState,
  LanguageLegend,
  Notice,
  PageHeading,
  SectionHeading,
  Surface,
  chartTooltipStyle,
  tokenClass,
} from "./ui";

const EXAMPLE = "मुझे machine learning का assignment complete करना है।";

type Analysis = { words: TranscriptWord[]; source: "backend" | "transcript" | "script" };

const SOURCE_LABEL: Record<Analysis["source"], string> = {
  backend: "Backend language-ID model",
  transcript: "Word labels from the last transcription",
  script: "Local script estimate (Devanagari vs Latin)",
};

export function LanguageAnalysisPage() {
  const session = useSession();
  const last = session.lastResult;
  const [text, setText] = useState("");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const stats = useMemo(() => (analysis ? languageStats(analysis.words) : null), [analysis]);

  async function analyzeBackend() {
    if (!text.trim() || isDemoMode) return;
    setBusy(true);
    setError("");
    try {
      const response = await analyzeLanguage(text);
      setAnalysis({ words: response.words, source: "backend" });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Analysis unavailable.");
    } finally {
      setBusy(false);
    }
  }
  function analyzeLocal() {
    if (!text.trim()) return;
    setError("");
    setAnalysis({ words: identifyWords(text), source: "script" });
  }
  function useLast() {
    if (!last) return;
    setText(last.transcript);
    setAnalysis(last.words?.length ? { words: last.words, source: "transcript" } : null);
  }

  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
  const timeline = stats?.segments ?? [];
  const labelledTotal = stats ? stats.hindi + stats.english : 0;

  return (
    <>
      <PageHeading eyebrow="Linguistic insights" title="Language Analysis">
        Token-level language labels, Hindi/English distribution and code-switching patterns for a
        transcript.
      </PageHeading>

      <Surface className="mb-5 px-5 py-5">
        <SectionHeading
          title="Transcript to analyze"
          detail="Paste a transcript, reuse your last transcription, or load the example phrase from the project brief"
          action={
            <>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={useLast}
                disabled={!last}
              >
                <History className="size-3.5" />
                Use last transcript
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => {
                  setText(EXAMPLE);
                  setAnalysis(null);
                }}
              >
                <Sparkles className="size-3.5" />
                Load example
              </Button>
            </>
          }
        />
        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setAnalysis(null);
          }}
          aria-label="Transcript to analyze"
          placeholder="Paste a Hindi–English transcript…"
          className="field transcript-copy min-h-28 resize-y px-3 py-3 leading-7"
        />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <span className="data-mono text-[11px] text-muted-foreground">{wordCount} words</span>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={analyzeLocal} disabled={!text.trim()}>
              <ScanText className="size-3.5" />
              Quick script estimate
            </Button>
            <Button
              size="sm"
              onClick={() => void analyzeBackend()}
              disabled={!text.trim() || isDemoMode || busy}
              title={isDemoMode ? "Requires the backend" : undefined}
            >
              {busy ? (
                <LoaderCircle className="size-3.5 animate-spin" />
              ) : (
                <Activity className="size-3.5" />
              )}
              Analyze with model
            </Button>
          </div>
        </div>
        {isDemoMode && (
          <p className="mt-3 text-[11px] text-muted-foreground">
            Model analysis needs the backend. The quick estimate works offline but only looks at the
            writing system, so romanized Hindi (e.g. “kya hai”) counts as English.
          </p>
        )}
        {error && (
          <div className="mt-3">
            <Notice tone="error" icon={CircleAlert}>
              {error}
            </Notice>
          </div>
        )}
      </Surface>

      {!analysis || !stats ? (
        <Surface>
          <EmptyState
            icon={Waves}
            title="No analysis yet"
            detail="Run an analysis to see token labels, language distribution and switch points. Nothing is pre-filled with sample statistics."
          />
        </Surface>
      ) : (
        <>
          <div
            className={cn(
              "mb-4 flex items-center gap-2 text-xs",
              analysis.source === "script" ? "text-warning" : "text-success",
            )}
          >
            <Info className="size-3.5" />
            <span>
              Source: <strong className="font-medium">{SOURCE_LABEL[analysis.source]}</strong>
              {analysis.source === "script" && " — an estimate, not a model prediction"}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-6">
            <DataValue
              label="Hindi words"
              value={stats.hindi}
              note={`${stats.hindiShare}% of labelled`}
              icon={AudioLines}
            />
            <DataValue
              label="English words"
              value={stats.english}
              note={`${stats.englishShare}% of labelled`}
              icon={FileText}
            />
            <DataValue
              label="Switch points"
              value={stats.switches}
              note={`HI→EN ${stats.hindiToEnglish} · EN→HI ${stats.englishToHindi}`}
              icon={ArrowLeftRight}
            />
            <DataValue
              label="Switch rate"
              value={`${stats.switchRate}%`}
              note="of word boundaries"
              icon={Activity}
            />
            <DataValue
              label="Mean run length"
              value={stats.meanRunLength}
              note="words per monolingual span"
              icon={Ruler}
            />
            <DataValue
              label="Longest run"
              value={stats.longestRun}
              note={
                stats.other
                  ? `${stats.other} other tokens skipped`
                  : "consecutive same-language words"
              }
              icon={Waves}
            />
          </div>

          <Surface className="mt-5 px-5 py-5">
            <SectionHeading
              title="Code-switching timeline"
              detail="Each block is a monolingual span; width is proportional to word count"
              action={<LanguageLegend />}
            />
            {labelledTotal ? (
              <>
                <div
                  className="flex h-9 w-full overflow-hidden rounded-md border border-border"
                  role="img"
                  aria-label={`Timeline with ${timeline.length} language spans and ${stats.switches} switches`}
                >
                  {timeline.map((segment, i) => (
                    <div
                      key={i}
                      title={`${segment.language === "hi" ? "Hindi" : "English"} · ${segment.words.map((w) => w.text).join(" ")}`}
                      className={cn(
                        "flex items-center justify-center border-r border-background/60 text-[10px] font-semibold last:border-r-0",
                        segment.language === "hi"
                          ? "bg-hindi/80 text-background"
                          : "bg-english/80 text-background",
                      )}
                      style={{ width: `${(segment.words.length / labelledTotal) * 100}%` }}
                    >
                      {segment.words.length / labelledTotal > 0.06 &&
                        (segment.language === "hi" ? "HI" : "EN")}
                    </div>
                  ))}
                </div>
                <ol className="mt-4 flex flex-wrap items-center gap-1.5 text-xs">
                  {timeline.map((segment, i) => (
                    <li key={i} className="flex items-center gap-1.5">
                      {i > 0 && (
                        <ArrowLeftRight
                          className="size-3 text-muted-foreground"
                          aria-label="switch"
                        />
                      )}
                      <span
                        className={cn(
                          "transcript-copy rounded-md border px-2 py-1",
                          segment.language === "hi" ? "token-chip-hindi" : "token-chip-english",
                        )}
                      >
                        {segment.words.map((w) => w.text).join(" ")}
                      </span>
                    </li>
                  ))}
                </ol>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">No Hindi or English tokens found.</p>
            )}
          </Surface>

          <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-[0.85fr_1.15fr]">
            <Surface className="px-5 py-5">
              <SectionHeading title="Language distribution" detail="Labelled word counts" />
              <div className="flex flex-wrap items-center gap-6">
                <div className="h-[180px] min-w-[180px] flex-1">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={[
                          { name: "Hindi", value: stats.hindi },
                          { name: "English", value: stats.english },
                        ]}
                        dataKey="value"
                        innerRadius={56}
                        outerRadius={78}
                        stroke="var(--card)"
                        strokeWidth={3}
                        paddingAngle={2}
                        isAnimationActive={false}
                      >
                        <Cell fill="var(--hindi)" />
                        <Cell fill="var(--english)" />
                      </Pie>
                      <Tooltip contentStyle={chartTooltipStyle} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="size-2 rounded-full bg-hindi" />
                      Hindi
                    </div>
                    <p className="data-mono ml-4 mt-1 text-sm font-semibold">
                      {stats.hindi}{" "}
                      <span className="text-[11px] font-normal text-muted-foreground">
                        · {stats.hindiShare}%
                      </span>
                    </p>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="size-2 rounded-full bg-english" />
                      English
                    </div>
                    <p className="data-mono ml-4 mt-1 text-sm font-semibold">
                      {stats.english}{" "}
                      <span className="text-[11px] font-normal text-muted-foreground">
                        · {stats.englishShare}%
                      </span>
                    </p>
                  </div>
                </div>
              </div>
              <div className="mt-2 h-24 border-t border-border pt-3">
                <p className="mb-1 text-[11px] text-muted-foreground">Switch direction</p>
                <ResponsiveContainer width="100%" height="80%">
                  <BarChart
                    data={[
                      { name: "HI→EN", value: stats.hindiToEnglish },
                      { name: "EN→HI", value: stats.englishToHindi },
                    ]}
                    layout="vertical"
                    margin={{ left: 0, right: 12 }}
                  >
                    <XAxis type="number" hide allowDecimals={false} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={64}
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                    />
                    <Tooltip contentStyle={chartTooltipStyle} cursor={{ fill: "var(--muted)" }} />
                    <Bar
                      dataKey="value"
                      radius={[0, 3, 3, 0]}
                      barSize={12}
                      isAnimationActive={false}
                    >
                      <Cell fill="var(--hindi)" />
                      <Cell fill="var(--english)" />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Surface>

            <Surface className="px-5 py-5">
              <SectionHeading
                title="Token-level labels"
                detail={`${analysis.words.length} tokens`}
              />
              <div className="max-h-[360px] overflow-auto">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-card text-[11px] text-muted-foreground">
                    <tr className="border-b border-border">
                      <th className="py-2 pr-3 font-medium">#</th>
                      <th className="py-2 pr-3 font-medium">Token</th>
                      <th className="py-2 pr-3 font-medium">Label</th>
                      <th className="py-2 pr-3 font-medium">Start</th>
                      <th className="py-2 font-medium">Confidence</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {analysis.words.map((word, i) => {
                      const switched =
                        i > 0 &&
                        word.language !== "other" &&
                        (() => {
                          for (let j = i - 1; j >= 0; j--) {
                            const prev = analysis.words[j];
                            if (prev && prev.language !== "other")
                              return prev.language !== word.language;
                          }
                          return false;
                        })();
                      return (
                        <tr
                          key={`${i}-${word.text}`}
                          className={cn(switched && "bg-primary/[0.04]")}
                        >
                          <td className="data-mono py-2 pr-3 text-muted-foreground">{i + 1}</td>
                          <td
                            className={cn(
                              "transcript-copy py-2 pr-3 text-sm",
                              tokenClass(word.language),
                            )}
                          >
                            {word.text}
                            {switched && (
                              <span className="ml-2 text-[10px] text-primary" title="Switch point">
                                ⇄
                              </span>
                            )}
                          </td>
                          <td className="py-2 pr-3">
                            <span
                              className={cn(
                                "rounded-sm border px-1.5 py-0.5 text-[10px] font-semibold",
                                word.language === "hi"
                                  ? "token-chip-hindi"
                                  : word.language === "en"
                                    ? "token-chip-english"
                                    : "token-chip-other",
                              )}
                            >
                              {word.language.toUpperCase()}
                            </span>
                          </td>
                          <td className="data-mono py-2 pr-3 text-muted-foreground">
                            {word.start === undefined ? "—" : `${word.start.toFixed(2)}s`}
                          </td>
                          <td className="data-mono py-2 text-muted-foreground">
                            {word.confidence === undefined
                              ? "—"
                              : `${Math.round(word.confidence * 100)}%`}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Surface>
          </div>
        </>
      )}
    </>
  );
}
