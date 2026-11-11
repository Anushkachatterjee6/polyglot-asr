import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  AudioLines,
  AudioWaveform,
  Check,
  ChevronDown,
  CircleAlert,
  Copy,
  Download,
  FileAudio2,
  LoaderCircle,
  Mic,
  Pause,
  Play,
  RotateCcw,
  Rewind,
  FastForward,
  Shield,
  Sparkles,
  Square,
  Upload,
  Waves,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { isDemoMode, transcribeAudio, type TranscriptResult } from "@/lib/polyglot-api";
import { identifyWords, languageStats } from "@/lib/language-stats";
import { activeVocabulary, sessionStore, usePreferences, useSession } from "@/lib/polyglot-store";
import { canExportSrt, type ExportFormat } from "@/lib/transcript-format";
import {
  EmptyState,
  LanguageLegend,
  ModeBadge,
  Notice,
  PageHeading,
  SectionHeading,
  Surface,
  TokenText,
  downloadTranscript,
  formatDuration,
} from "./ui";

const BAR_COUNT = 120;
const ACCEPTED = /\.(wav|mp3|m4a|ogg|oga|flac|webm|aac)$/i;
const MAX_BYTES = 100 * 1024 * 1024;

async function computePeaks(
  file: File,
  bars: number,
): Promise<{ peaks: number[]; duration: number }> {
  const AudioCtx =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) throw new Error("Web Audio unavailable");
  const ctx = new AudioCtx();
  try {
    const audio = await ctx.decodeAudioData(await file.arrayBuffer());
    const data = audio.getChannelData(0);
    const block = Math.max(1, Math.floor(data.length / bars));
    const stride = Math.max(1, Math.floor(block / 200));
    const peaks: number[] = [];
    for (let i = 0; i < bars; i++) {
      let max = 0;
      for (let j = i * block; j < Math.min((i + 1) * block, data.length); j += stride)
        max = Math.max(max, Math.abs(data[j] ?? 0));
      peaks.push(max);
    }
    const top = Math.max(...peaks, 0.0001);
    return { peaks: peaks.map((p) => p / top), duration: audio.duration };
  } finally {
    void ctx.close();
  }
}

function Waveform({
  peaks,
  progress,
  duration,
  onSeek,
  live,
}: {
  peaks: number[] | null;
  progress: number;
  duration: number;
  onSeek?: ((fraction: number) => void) | undefined;
  live?: number[] | undefined;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const bars = live ?? peaks;
  const seekFromPointer = (event: PointerEvent<HTMLDivElement>) => {
    if (!onSeek || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    onSeek(Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)));
  };
  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!onSeek || !duration) return;
    const step = 5 / duration;
    if (event.key === "ArrowRight") onSeek(Math.min(1, progress + step));
    else if (event.key === "ArrowLeft") onSeek(Math.max(0, progress - step));
    else if (event.key === "Home") onSeek(0);
    else if (event.key === "End") onSeek(1);
    else return;
    event.preventDefault();
  };
  if (!bars) {
    return (
      <div className="flex h-24 items-center justify-center rounded-md border border-dashed border-border bg-muted/15 text-[11px] text-muted-foreground">
        Waveform appears after you add or record audio
      </div>
    );
  }
  const interactive = Boolean(onSeek && !live);
  return (
    <div
      ref={ref}
      role={interactive ? "slider" : "img"}
      tabIndex={interactive ? 0 : undefined}
      aria-label={live ? "Live microphone level" : "Audio position"}
      aria-valuemin={interactive ? 0 : undefined}
      aria-valuemax={interactive ? Math.round(duration) : undefined}
      aria-valuenow={interactive ? Math.round(progress * duration) : undefined}
      aria-valuetext={
        interactive
          ? `${formatDuration(progress * duration)} of ${formatDuration(duration)}`
          : undefined
      }
      onPointerDown={
        interactive
          ? (e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              seekFromPointer(e);
            }
          : undefined
      }
      onPointerMove={
        interactive
          ? (e) => {
              if (e.buttons === 1) seekFromPointer(e);
            }
          : undefined
      }
      onKeyDown={interactive ? onKey : undefined}
      className={cn(
        "relative flex h-24 items-center gap-[2px] overflow-hidden rounded-md border border-border/70 bg-muted/15 px-3",
        interactive && "waveform-canvas",
      )}
    >
      {bars.map((peak, i) => {
        const played = !live && i / bars.length < progress;
        return (
          <span
            key={i}
            className={cn(
              "min-w-0 flex-1 rounded-[1px] transition-colors",
              live ? "bg-destructive/70" : played ? "bg-primary" : "bg-primary/30",
            )}
            style={{ height: `${Math.max(4, peak * 92)}%` }}
          />
        );
      })}
      {interactive && (
        <span
          className="pointer-events-none absolute inset-y-2 w-px bg-foreground/70"
          style={{ left: `calc(12px + (100% - 24px) * ${progress})` }}
        />
      )}
    </div>
  );
}

export function TranscriptionPage() {
  const prefs = usePreferences();
  const session = useSession();
  const vocabulary = activeVocabulary(session);

  const [file, setFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState("");
  const [peaks, setPeaks] = useState<number[] | null>(null);
  const [decodeFailed, setDecodeFailed] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const [dragActive, setDragActive] = useState(false);

  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [liveLevels, setLiveLevels] = useState<number[]>([]);

  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<TranscriptResult | null>(null);
  const [error, setError] = useState("");
  const [rescoringOverride, setRescoringOverride] = useState<boolean | null>(null);
  const rescoring = rescoringOverride ?? prefs.contextualRescoring;

  const audioRef = useRef<HTMLAudioElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const urlRef = useRef("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const recordTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const meterFrame = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const stopMeter = useCallback(() => {
    if (meterFrame.current) cancelAnimationFrame(meterFrame.current);
    meterFrame.current = null;
    void audioCtxRef.current?.close().catch(() => undefined);
    audioCtxRef.current = null;
  }, []);

  useEffect(
    () => () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      if (recordTimer.current) clearInterval(recordTimer.current);
      recorderRef.current?.stream.getTracks().forEach((t) => t.stop());
      abortRef.current?.abort();
      stopMeter();
    },
    [stopMeter],
  );

  // Smooth playhead while playing.
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const tick = () => {
      if (audioRef.current) setCurrentTime(audioRef.current.currentTime);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  // Elapsed timer while waiting for the backend (no simulated progress).
  useEffect(() => {
    if (!busy) return;
    setElapsed(0);
    const id = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [busy]);

  function clearAudio() {
    audioRef.current?.pause();
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = "";
    setFile(null);
    setAudioUrl("");
    setPeaks(null);
    setDecodeFailed(false);
    setDuration(0);
    setCurrentTime(0);
    setPlaying(false);
    setResult(null);
    setError("");
  }

  function chooseFile(next: File | null) {
    if (!next) return;
    if (!next.type.startsWith("audio/") && !ACCEPTED.test(next.name)) {
      setError("Choose an audio file such as WAV, MP3, M4A, OGG, FLAC or WEBM.");
      return;
    }
    if (next.size > MAX_BYTES) {
      setError("This file is larger than 100 MB. Trim it or choose a shorter recording.");
      return;
    }
    clearAudio();
    const url = URL.createObjectURL(next);
    urlRef.current = url;
    setAudioUrl(url);
    setFile(next);
    computePeaks(next, BAR_COUNT)
      .then(({ peaks: p, duration: d }) => {
        setPeaks(p);
        setDuration((prev) => prev || d);
      })
      .catch(() => setDecodeFailed(true));
  }

  function onPick(e: ChangeEvent<HTMLInputElement>) {
    chooseFile(e.target.files?.[0] ?? null);
    e.target.value = "";
  }
  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragActive(false);
    chooseFile(e.dataTransfer.files?.[0] ?? null);
  }

  async function startRecording() {
    setError("");
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("Microphone recording is not supported in this browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, noiseSuppression: prefs.noiseRobustness, echoCancellation: true },
      });
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunks.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.current.push(event.data);
      };
      recorder.onstop = () => {
        const type = recorder.mimeType || "audio/webm";
        const ext = type.includes("ogg") ? "ogg" : type.includes("mp4") ? "m4a" : "webm";
        const blob = new Blob(chunks.current, { type });
        stream.getTracks().forEach((t) => t.stop());
        stopMeter();
        if (blob.size)
          chooseFile(
            new File([blob], `recording-${new Date().toISOString().replace(/[:.]/g, "-")}.${ext}`, {
              type,
            }),
          );
      };
      // Live level meter.
      try {
        const ctx = new AudioContext();
        audioCtxRef.current = ctx;
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        ctx.createMediaStreamSource(stream).connect(analyser);
        const buffer = new Uint8Array(analyser.fftSize);
        let last = 0;
        const loop = (t: number) => {
          if (t - last > 60) {
            last = t;
            analyser.getByteTimeDomainData(buffer);
            let sum = 0;
            for (const v of buffer) sum += ((v - 128) / 128) ** 2;
            const level = Math.min(1, Math.sqrt(sum / buffer.length) * 4);
            setLiveLevels((prev) => [...prev.slice(-(BAR_COUNT - 1)), level]);
          }
          meterFrame.current = requestAnimationFrame(loop);
        };
        meterFrame.current = requestAnimationFrame(loop);
      } catch {
        /* meter is optional */
      }
      setLiveLevels([]);
      recorder.start();
      setRecordSeconds(0);
      setRecording(true);
      recordTimer.current = setInterval(() => setRecordSeconds((s) => s + 1), 1000);
    } catch {
      setError(
        "Microphone access was denied or is unavailable. Allow microphone access in your browser and try again.",
      );
    }
  }

  function stopRecording() {
    recorderRef.current?.stop();
    setRecording(false);
    if (recordTimer.current) clearInterval(recordTimer.current);
  }

  async function runTranscription() {
    if (!file || isDemoMode) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const response = await transcribeAudio({
        audio: file,
        domain: session.domain,
        vocabulary: rescoring ? vocabulary : [],
        contextualRescoring: rescoring,
        signal: controller.signal,
      });
      setResult(response);
      sessionStore.set({ lastResult: response });
      toast.success("Transcription complete", { description: response.filename });
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError")
        setError("Transcription cancelled.");
      else setError(cause instanceof Error ? cause.message : "Transcription failed. Try again.");
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  async function togglePlayback() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      try {
        audio.playbackRate = rate;
        await audio.play();
        setPlaying(true);
      } catch {
        setError("This audio file could not be played in the browser.");
      }
    } else {
      audio.pause();
      setPlaying(false);
    }
  }
  function seekTo(fraction: number) {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    audio.currentTime = fraction * duration;
    setCurrentTime(audio.currentTime);
  }
  function skip(seconds: number) {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    audio.currentTime = Math.min(duration, Math.max(0, audio.currentTime + seconds));
    setCurrentTime(audio.currentTime);
  }
  function cycleRate() {
    const next = rate === 1 ? 1.25 : rate === 1.25 ? 1.5 : rate === 1.5 ? 0.75 : 1;
    setRate(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  }

  async function copyResult() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(
        result.contextualTranscript
          ? `${result.transcript}\n\n${result.contextualTranscript}`
          : result.transcript,
      );
      toast.success("Transcript copied");
    } catch {
      toast.error("Clipboard access was denied. Select the transcript text to copy it.");
    }
  }
  async function exportAs(format: ExportFormat) {
    if (!result) return;
    try {
      await downloadTranscript(result, format);
      toast.success(`Exported .${format}`);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Export failed.");
    }
  }

  const stats = useMemo(
    () =>
      result
        ? languageStats(result.words?.length ? result.words : identifyWords(result.transcript))
        : null,
    [result],
  );
  const srtReady = result ? canExportSrt(result) : false;
  const progress = duration ? Math.min(1, currentTime / duration) : 0;

  return (
    <>
      <PageHeading eyebrow="Audio workspace" title="Transcription Studio" action={<ModeBadge />}>
        Upload or record a Hindi–English sample. Transcript output comes only from the connected
        XLS-R research backend.
      </PageHeading>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(380px,0.9fr)]">
        <div className="space-y-5">
          <Surface className="p-5 sm:p-6">
            <SectionHeading
              title="Audio input"
              detail="WAV · MP3 · M4A · OGG · FLAC · WEBM · up to 100 MB"
              action={
                file && !recording ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs text-muted-foreground"
                    onClick={clearAudio}
                  >
                    <RotateCcw className="size-3.5" />
                    Clear
                  </Button>
                ) : undefined
              }
            />
            <input
              ref={inputRef}
              className="sr-only"
              type="file"
              accept="audio/*,.wav,.mp3,.m4a,.ogg,.flac,.webm"
              onChange={onPick}
              aria-label="Choose audio file"
              tabIndex={-1}
            />
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={onDrop}
              className={cn(
                "flex min-h-44 flex-col items-center justify-center rounded-md border border-dashed px-4 py-6 text-center transition-all",
                file
                  ? "border-primary/35 bg-primary/[0.035]"
                  : "border-border bg-muted/15 hover:border-primary/40",
                dragActive && "drop-zone-active",
              )}
            >
              {recording ? (
                <>
                  <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                    <span className="recording-pulse size-2.5 rounded-full bg-destructive" />
                    Recording
                  </div>
                  <p className="data-mono text-2xl font-semibold">
                    {formatDuration(recordSeconds)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Speak naturally — mix Hindi and English as you would.
                  </p>
                </>
              ) : file ? (
                <>
                  <div className="mb-3 flex size-10 items-center justify-center rounded-md border border-primary/20 bg-primary/10 text-primary">
                    <FileAudio2 className="size-5" />
                  </div>
                  <p className="max-w-full truncate px-2 text-sm font-semibold">{file.name}</p>
                  <p className="data-mono mt-1 text-xs text-muted-foreground">
                    {(file.size / 1024 / 1024).toFixed(2)} MB · {formatDuration(duration || null)}
                  </p>
                  <Button
                    variant="link"
                    size="sm"
                    className="mt-2 h-7 text-xs"
                    onClick={() => inputRef.current?.click()}
                  >
                    Replace file
                  </Button>
                </>
              ) : (
                <>
                  <div className="mb-3 flex size-10 items-center justify-center rounded-md border border-border bg-card text-primary">
                    <Upload className="size-5" />
                  </div>
                  <p className="text-sm font-semibold">
                    {dragActive ? "Release to add audio" : "Drop an audio file here"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    or choose a local file to review and play
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-4 h-8"
                    onClick={() => inputRef.current?.click()}
                  >
                    <Upload className="size-3.5" />
                    Choose file
                  </Button>
                </>
              )}
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <Button
                variant={recording ? "destructive" : "outline"}
                size="sm"
                className="h-9 text-xs"
                onClick={recording ? stopRecording : () => void startRecording()}
                disabled={busy}
              >
                {recording ? <Square /> : <Mic />}
                {recording ? "Stop recording" : "Record with microphone"}
              </Button>
              <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Shield className="size-3.5" />
                Audio stays in this browser until you transcribe
              </span>
            </div>
          </Surface>

          <Surface className="px-5 py-5">
            <SectionHeading
              title={recording ? "Live input level" : "Waveform & playback"}
              detail={
                recording
                  ? "Microphone signal"
                  : decodeFailed
                    ? "Waveform unavailable for this format — playback still works"
                    : "Click or drag the waveform to seek · ←/→ skip 5 s"
              }
            />
            <Waveform
              peaks={peaks}
              progress={progress}
              duration={duration}
              onSeek={seekTo}
              live={recording ? (liveLevels.length ? liveLevels : [0]) : undefined}
            />
            <audio
              ref={audioRef}
              src={audioUrl || undefined}
              preload="metadata"
              onLoadedMetadata={(e) => {
                const d = e.currentTarget.duration;
                if (Number.isFinite(d)) setDuration(d);
              }}
              onEnded={() => {
                setPlaying(false);
                setCurrentTime(duration);
              }}
              onPause={() => setPlaying(false)}
              className="hidden"
            />
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-1.5">
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-9"
                  aria-label="Back 5 seconds"
                  disabled={!file || recording}
                  onClick={() => skip(-5)}
                >
                  <Rewind />
                </Button>
                <Button
                  size="icon"
                  className="size-10 rounded-full"
                  aria-label={playing ? "Pause" : "Play"}
                  disabled={!file || recording}
                  onClick={() => void togglePlayback()}
                >
                  {playing ? <Pause /> : <Play />}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-9"
                  aria-label="Forward 5 seconds"
                  disabled={!file || recording}
                  onClick={() => skip(5)}
                >
                  <FastForward />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="data-mono h-8 px-2 text-xs"
                  aria-label={`Playback speed ${rate}x`}
                  disabled={!file || recording}
                  onClick={cycleRate}
                >
                  {rate}×
                </Button>
              </div>
              <span className="data-mono text-xs text-muted-foreground">
                {formatDuration(currentTime)} / {formatDuration(duration || null)}
              </span>
            </div>
          </Surface>

          <Surface className="px-5 py-5">
            <SectionHeading
              title="Recognition settings"
              detail="Sent with each transcription request"
              action={
                <Button asChild variant="ghost" size="sm" className="h-7 text-xs">
                  <Link to="/context-adaptation">Edit vocabulary</Link>
                </Button>
              }
            />
            <div className="divide-y divide-border">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3">
                <div>
                  <p className="text-xs font-medium">Language pair</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">Code-switch preservation</p>
                </div>
                <span className="inline-flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-xs">
                  <span className="token-hindi">हिन्दी</span>
                  <span className="text-muted-foreground">+</span>
                  <span className="token-english">English</span>
                </span>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium">Domain context</p>
                  <p className="mt-1 truncate text-[11px] text-muted-foreground">
                    {session.domain} · {vocabulary.length} term{vocabulary.length === 1 ? "" : "s"}
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between gap-3 pt-3">
                <div>
                  <p className="text-xs font-medium">Contextual rescoring</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {rescoringOverride === null
                      ? "Using your default from Settings"
                      : "Overridden for this session"}
                  </p>
                </div>
                <Switch
                  checked={rescoring}
                  onCheckedChange={setRescoringOverride}
                  aria-label="Contextual rescoring"
                />
              </div>
            </div>
          </Surface>
        </div>

        <div className="space-y-4">
          <Surface className="p-5 sm:p-6">
            <SectionHeading
              title="Transcript output"
              detail="Model transcript and context-adapted result"
              action={
                result && (
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      aria-label="Copy transcript"
                      title="Copy transcript"
                      onClick={() => void copyResult()}
                    >
                      <Copy />
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="h-8 gap-1 text-xs">
                          <Download className="size-3.5" />
                          Export
                          <ChevronDown className="size-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel className="text-[11px] text-muted-foreground">
                          Download as
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={() => void exportAs("txt")}>
                          Plain text (.txt)
                          {prefs.exportFormat === "txt" && <Check className="ml-auto size-3.5" />}
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => void exportAs("json")}>
                          JSON with word labels
                          {prefs.exportFormat === "json" && <Check className="ml-auto size-3.5" />}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={!srtReady}
                          onSelect={() => void exportAs("srt")}
                        >
                          Subtitles (.srt)
                          {!srtReady ? (
                            <span className="ml-auto text-[10px]">needs timestamps</span>
                          ) : (
                            prefs.exportFormat === "srt" && <Check className="ml-auto size-3.5" />
                          )}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </>
                )
              }
            />
            {busy ? (
              <div role="status" className="flex min-h-60 flex-col items-center justify-center">
                <LoaderCircle className="size-6 animate-spin text-primary" />
                <p className="mt-3 text-sm font-medium">Waiting for the research model…</p>
                <p className="data-mono mt-1 text-xs text-muted-foreground">{elapsed}s elapsed</p>
                <div className="mt-5 h-1 w-full max-w-xs overflow-hidden rounded bg-muted">
                  <div className="h-full w-1/3 animate-pulse rounded bg-primary" />
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-4 text-xs"
                  onClick={() => abortRef.current?.abort()}
                >
                  <X className="size-3.5" />
                  Cancel
                </Button>
              </div>
            ) : result && stats ? (
              <div className="space-y-4">
                <div className="rounded-md border border-border bg-background/40 p-4">
                  <div className="eyebrow mb-2 text-muted-foreground">
                    Model transcript
                    {result.durationSeconds ? ` · ${formatDuration(result.durationSeconds)}` : ""}
                  </div>
                  <TokenText
                    words={result.words}
                    fallback={result.transcript}
                    showTimestamps={prefs.showTimestamps}
                    showConfidence={prefs.showConfidence}
                  />
                </div>
                {result.contextualTranscript && (
                  <div className="rounded-md border border-primary/25 bg-primary/[0.04] p-4">
                    <div className="eyebrow mb-2 flex items-center gap-1.5 text-primary">
                      <Sparkles className="size-3.5" />
                      Context-adapted
                    </div>
                    <TokenText fallback={result.contextualTranscript} />
                  </div>
                )}
                <div className="grid grid-cols-3 gap-2 text-center">
                  {[
                    ["Hindi", stats.hindi, "token-hindi"],
                    ["English", stats.english, "token-english"],
                    ["Switches", stats.switches, "text-foreground"],
                  ].map(([label, value, cls]) => (
                    <div
                      key={label as string}
                      className="rounded-md border border-border px-2 py-2.5"
                    >
                      <p className={cn("data-mono text-lg font-semibold", cls as string)}>
                        {value as number}
                      </p>
                      <p className="text-[10px] text-muted-foreground">{label as string}</p>
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-[11px] text-success">
                    <Check className="size-3.5" />
                    Completed by connected backend
                  </span>
                  <Button asChild variant="link" size="sm" className="h-auto p-0 text-xs">
                    <Link to="/language-analysis">Open in Language Analysis →</Link>
                  </Button>
                </div>
                {!result.words?.length && (
                  <p className="text-[11px] text-muted-foreground">
                    No word labels returned — colours use a script-based estimate.
                  </p>
                )}
              </div>
            ) : (
              <EmptyState
                icon={AudioWaveform}
                title="Transcript will appear here"
                detail={
                  isDemoMode
                    ? "The speech service isn't connected, so nothing can be transcribed yet. This workspace never shows a made-up result."
                    : file
                      ? "Send this audio to the connected model when you're ready."
                      : "Choose or record an audio file to prepare a transcription."
                }
              />
            )}
          </Surface>

          <Button
            className="h-11 w-full"
            size="lg"
            disabled={!file || busy || recording || isDemoMode}
            onClick={() => void runTranscription()}
          >
            {busy ? <LoaderCircle className="animate-spin" /> : <AudioLines />}
            {busy
              ? "Processing audio…"
              : isDemoMode
                ? "Connect backend to transcribe"
                : "Transcribe audio"}
          </Button>

          {isDemoMode && (
            <Notice tone="warning" icon={Waves}>
              <strong className="text-foreground">Demo mode.</strong> Upload, recording, playback
              and the waveform all work locally. Transcription needs the FastAPI backend — see{" "}
              <Link to="/settings" className="text-primary underline-offset-2 hover:underline">
                Settings
              </Link>{" "}
              for how to connect it.
            </Notice>
          )}
          {error && (
            <Notice tone="error" icon={CircleAlert}>
              {error}
            </Notice>
          )}

          <Surface className="px-4 py-4">
            <p className="mb-3 text-xs font-medium">Reading the transcript</p>
            <LanguageLegend />
            <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
              Hover a word for its label, timestamp and confidence. Dotted underline = confidence
              under 60 %.
            </p>
          </Surface>
        </div>
      </div>
    </>
  );
}
