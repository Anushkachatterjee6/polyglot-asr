import { useCallback, useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Activity, AudioLines, CheckCircle2, Clock3, Languages, RefreshCw, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getEvaluation, isDemoMode, setReferenceTranscript, type LiveAnalytics } from "@/lib/polyglot-api";
import { ILLUSTRATIVE_METRIC_VALUES } from "@/lib/presentation-metrics";
import { DataValue, EmptyState, LoadingBlock, Notice, PageHeading, SectionHeading, Surface, chartTooltipStyle } from "./ui";

const names: Record<string, string> = { hi: "Hindi", en: "English", other: "Other", unknown: "Unknown" };
const colors: Record<string, string> = { hi: "var(--hindi)", en: "var(--english)", other: "var(--other-lang)", unknown: "var(--muted-foreground)" };
const format = (value: number, digits = 2) => value.toFixed(digits);

function Trend({ title, detail, data, proxy = false }: { title: string; detail: string; data: Array<{ timestamp: string; wer: number; cer: number }>; proxy?: boolean }) {
  return <Surface className="px-5 py-5"><SectionHeading title={title} detail={detail} />
    {data.length >= (proxy ? 3 : 1) ? <div className="h-56"><ResponsiveContainer width="100%" height="100%"><LineChart data={data}><CartesianGrid stroke="var(--border)" strokeDasharray="3 5" /><XAxis dataKey="timestamp" hide /><YAxis tickFormatter={(v) => `${Math.round(v * 100)}%`} /><Tooltip contentStyle={chartTooltipStyle} /><Line dataKey="wer" name="WER" stroke="var(--destructive)" /><Line dataKey="cer" name="CER" stroke="var(--warning)" /></LineChart></ResponsiveContainer></div> : <p className="py-20 text-center text-xs text-muted-foreground">{proxy ? "Need three context-adjusted recordings for an estimate." : "Add a human reference transcript to show actual error trends."}</p>}
  </Surface>;
}

export function EvaluationPage() {
  const [data, setData] = useState<LiveAnalytics | null>(null);
  const [loading, setLoading] = useState(!isDemoMode);
  const [error, setError] = useState("");
  const [references, setReferences] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const load = useCallback(async () => { if (!isDemoMode) try { setError(""); setData(await getEvaluation()); } catch (cause) { setError(cause instanceof Error ? cause.message : "Live analytics is unavailable."); } finally { setLoading(false); } }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (isDemoMode) return; const refresh = () => void load(); window.addEventListener("polyglot:transcription-saved", refresh); const timer = window.setInterval(refresh, 10_000); return () => { window.removeEventListener("polyglot:transcription-saved", refresh); window.clearInterval(timer); }; }, [load]);
  async function saveReference(id: string) { const text = references[id]?.trim(); if (!text) return; setSaving(id); try { await setReferenceTranscript(id, text); setReferences((old) => ({ ...old, [id]: "" })); await load(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save the reference."); } finally { setSaving(null); } }
  if (loading) return <LoadingBlock label="Loading live transcription analytics..." />;
  if (isDemoMode) return <EmptyState icon={Activity} title="Connect the backend to view analytics" detail="Metrics are derived only from persisted Transcription Studio records." />;
  if (!data || data.status === "empty") return <><PageHeading eyebrow="Operational insights" title="Live Transcription Analytics">Actual Transcription Studio activity only.</PageHeading><Surface><EmptyState icon={AudioLines} title="No recordings yet" detail="Metrics appear after an audio file is transcribed. Add a human reference later to calculate actual WER and CER." /></Surface></>;
  const { totals } = data;
  return <>
    <PageHeading eyebrow="Operational insights" title="Live Transcription Analytics">Actual records only. No benchmark upload, batch run, or additional Gemini request. <span className="ml-1 inline-flex rounded border border-warning/30 bg-warning/5 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-warning">ILLUSTRATIVE VALUES</span></PageHeading>
    <div className="mb-5 flex justify-end"><Button variant="outline" size="sm" onClick={() => { setLoading(true); void load(); }}><RefreshCw className="size-3.5" /> Refresh</Button></div>
    {error && <div className="mb-5"><Notice tone="error" icon={Activity}>{error}</Notice></div>}
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 2xl:grid-cols-5">
      <DataValue label="Total recordings" value={totals.recordings} note={`${totals.successful} successful, ${totals.failed} failed`} icon={AudioLines} />
      {totals.averageProcessingSeconds !== null && <DataValue label="Average latency" value={`${format(totals.averageProcessingSeconds)}s`} note="provider processing time" icon={Timer} />}
      {totals.averageAudioSeconds !== null && <DataValue label="Average audio duration" value={`${format(totals.averageAudioSeconds)}s`} note="actual uploaded audio only" icon={AudioLines} />}
      {totals.realTimeFactor !== null && <DataValue label="Real-Time Factor" value={`${format(totals.realTimeFactor, 3)}x`} note="processing divided by audio duration" icon={Clock3} />}
      <DataValue label="Total words" value={totals.totalWords} note={totals.averageWords === null ? "successful transcripts only" : `${format(totals.averageWords, 1)} words per transcript`} icon={Languages} />
      <DataValue label="Estimated WER" value={ILLUSTRATIVE_METRIC_VALUES.estimatedWer} note="Illustrative presentation value · not measured" icon={Activity} tone="pending" />
      <DataValue label="Estimated CER" value={ILLUSTRATIVE_METRIC_VALUES.estimatedCer} note="Illustrative presentation value · not measured" icon={Activity} tone="pending" />
      <DataValue label="Estimated Word Accuracy" value={ILLUSTRATIVE_METRIC_VALUES.estimatedWordAccuracy} note="Illustrative presentation value · not measured" icon={CheckCircle2} tone="pending" />
      <DataValue label="Reference WER" value={ILLUSTRATIVE_METRIC_VALUES.referenceWer} note="Illustrative presentation value · not measured" icon={Activity} tone="pending" />
      <DataValue label="Reference CER" value={ILLUSTRATIVE_METRIC_VALUES.referenceCer} note="Illustrative presentation value · not measured" icon={CheckCircle2} tone="pending" />
      <DataValue label="Reference Word Accuracy" value={ILLUSTRATIVE_METRIC_VALUES.referenceWordAccuracy} note="Illustrative presentation value · not measured" icon={CheckCircle2} tone="pending" />
    </div>
    <div className="mt-5 grid gap-5 xl:grid-cols-2">
      <Surface className="px-5 py-5"><SectionHeading title="Processing latency" detail="Completed and failed transcription attempts" /><div className="h-56"><ResponsiveContainer width="100%" height="100%"><LineChart data={data.latencyTimeline}><CartesianGrid stroke="var(--border)" strokeDasharray="3 5" /><XAxis dataKey="timestamp" hide /><YAxis unit="s" /><Tooltip contentStyle={chartTooltipStyle} /><Line dataKey="processingSeconds" stroke="var(--primary)" /></LineChart></ResponsiveContainer></div></Surface>
      <Surface className="px-5 py-5"><SectionHeading title="Language distribution" detail="Estimated word-level language distribution; not human-verified ground truth." /><div className="flex items-center gap-5"><div className="h-48 flex-1"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={data.languageDistribution} dataKey="count" nameKey="language" innerRadius={48} outerRadius={75}>{data.languageDistribution.map((item) => <Cell key={item.language} fill={colors[item.language]} />)}</Pie><Tooltip contentStyle={chartTooltipStyle} /></PieChart></ResponsiveContainer></div><div className="space-y-3">{data.languageDistribution.map((item) => <p key={item.language} className="text-xs"><span className="mr-2 inline-block size-2 rounded-full" style={{ background: colors[item.language] }} />{names[item.language]} <strong className="data-mono ml-2">{item.count}</strong></p>)}</div></div></Surface>
      <Surface className="px-5 py-5"><SectionHeading title="Daily transcription volume" detail="Persisted successful and failed records" /><div className="h-56"><ResponsiveContainer width="100%" height="100%"><BarChart data={data.activity}><CartesianGrid stroke="var(--border)" strokeDasharray="3 5" /><XAxis dataKey="date" /><YAxis allowDecimals={false} /><Tooltip contentStyle={chartTooltipStyle} /><Bar dataKey="successful" stackId="records" fill="var(--success)" /><Bar dataKey="failed" stackId="records" fill="var(--destructive)" /></BarChart></ResponsiveContainer></div></Surface>
      <Surface className="px-5 py-5"><SectionHeading title="Code-switching statistics" detail="Estimated from the current word-level classifier" /><dl className="grid grid-cols-2 gap-4 text-sm"><div><dt className="text-muted-foreground">Mixed-language recordings</dt><dd className="data-mono mt-1 text-lg font-semibold">{data.codeSwitching.mixedRecordings}</dd></div><div><dt className="text-muted-foreground">Hindi-English recordings</dt><dd className="data-mono mt-1 text-lg font-semibold">{data.codeSwitching.hindiEnglish}</dd></div><div><dt className="text-muted-foreground">Detected switches</dt><dd className="data-mono mt-1 text-lg font-semibold">{data.codeSwitching.switches}</dd></div><div><dt className="text-muted-foreground">Tamil-English</dt><dd className="mt-1 text-muted-foreground">Not reliably supported</dd></div></dl></Surface>
      <Trend title="WER and CER trend" detail="Reference-based values only" data={data.referenceTrend} />
      <Trend title="Estimated error trend" detail="Proxy only; contextual edit signal, not benchmark accuracy" data={data.proxyTrend} proxy />
    </div>
    <Surface className="mt-5 px-5 py-5"><SectionHeading title="Recording-level evaluation" detail="Raw Gemini text is never replaced. Save a separate human reference to calculate actual WER and CER." /><div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-xs"><thead className="border-b border-border text-muted-foreground"><tr><th className="p-2">Recording</th><th className="p-2">Date / language</th><th className="p-2">Original transcript</th><th className="p-2">Reference transcript</th><th className="p-2 text-right">Latency</th><th className="p-2">Status</th></tr></thead><tbody className="divide-y divide-border">{data.records.map((record) => <tr key={record.id}><td className="data-mono p-2">{record.id.slice(0, 8)}</td><td className="p-2">{record.timestamp === "unknown" ? "Unknown" : new Date(record.timestamp).toLocaleString()}<br /><span className="text-muted-foreground">{record.detectedLanguage ?? "Unknown"}</span></td><td className="max-w-64 truncate p-2" title={record.transcript}>{record.transcript || "--"}</td><td className="p-2"><input aria-label={`Reference transcript for ${record.id}`} value={references[record.id] ?? record.referenceTranscript ?? ""} onChange={(event) => setReferences((old) => ({ ...old, [record.id]: event.target.value }))} placeholder="Optional human reference" className="field h-8 min-w-48 px-2 text-xs" /><Button size="sm" className="ml-2 h-8 text-xs" disabled={!references[record.id]?.trim() || saving === record.id} onClick={() => void saveReference(record.id)}>{saving === record.id ? "Saving..." : "Save"}</Button></td><td className="data-mono p-2 text-right">{record.processingSeconds === null ? "--" : `${format(record.processingSeconds)}s`}</td><td className={record.status === "completed" ? "p-2 text-success" : "p-2 text-destructive"}>{record.status}</td></tr>)}</tbody></table></div></Surface>
  </>;
}
