import { useState } from "react";
import { toast } from "sonner";
import {
  CircleAlert,
  CircleCheck,
  LoaderCircle,
  PlugZap,
  RotateCcw,
  Server,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  API_BASE_URL,
  API_MODE,
  getModelInfo,
  isDemoMode,
  type ModelInfo,
} from "@/lib/polyglot-api";
import {
  preferencesStore,
  sessionStore,
  usePreferences,
  type Preferences,
  type SampleRate,
} from "@/lib/polyglot-store";
import type { ExportFormat } from "@/lib/transcript-format";
import { PageHeading, SectionHeading, Surface } from "./ui";

function Row({
  title,
  detail,
  children,
}: {
  title: string;
  detail: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 py-3.5">
      <div className="min-w-0">
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{detail}</p>
      </div>
      {children}
    </div>
  );
}

export function SettingsPage() {
  const prefs = usePreferences();
  const [test, setTest] = useState<{
    state: "idle" | "testing" | "ok" | "error";
    info?: ModelInfo;
    ms?: number;
    message?: string;
  }>({ state: "idle" });

  function update<K extends keyof Preferences>(key: K, value: Preferences[K]) {
    preferencesStore.set({ [key]: value } as Partial<Preferences>);
    toast.success("Preference saved", { id: "pref-saved", duration: 1200 });
  }

  async function testConnection() {
    setTest({ state: "testing" });
    const started = performance.now();
    try {
      const info = await getModelInfo();
      setTest({ state: "ok", info, ms: Math.round(performance.now() - started) });
    } catch (cause) {
      setTest({
        state: "error",
        message: cause instanceof Error ? cause.message : "Connection failed.",
      });
    }
  }

  return (
    <>
      <PageHeading eyebrow="Workspace preferences" title="Settings">
        Connection status, audio handling and output preferences. Preferences are saved in this
        browser automatically.
      </PageHeading>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-5">
          <Surface className="px-5 py-5">
            <SectionHeading
              title="Backend connection"
              detail="FastAPI service running the XLS-R 300M CTC model"
              action={
                <Badge
                  variant="outline"
                  className={cn(
                    "gap-1.5 px-2.5 py-1",
                    isDemoMode
                      ? "border-warning/30 bg-warning/5 text-warning"
                      : "border-success/30 bg-success/5 text-success",
                  )}
                >
                  <span
                    className={cn(
                      "size-1.5 rounded-full",
                      isDemoMode ? "bg-warning" : "bg-success",
                    )}
                  />
                  {isDemoMode ? "Demo mode" : "Backend mode"}
                </Badge>
              }
            />
            <label htmlFor="api-base" className="text-xs font-medium">
              API base URL
            </label>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Input
                id="api-base"
                value={API_BASE_URL || "Not configured"}
                readOnly
                className={cn(
                  "data-mono min-w-[220px] flex-1",
                  isDemoMode && "text-muted-foreground",
                )}
              />
              <Button
                variant="outline"
                onClick={() => void testConnection()}
                disabled={isDemoMode || test.state === "testing"}
              >
                {test.state === "testing" ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <PlugZap className="size-4" />
                )}
                Test connection
              </Button>
            </div>
            <p className="data-mono mt-2 text-[11px] text-muted-foreground">
              mode = {API_MODE} · source = VITE_API_BASE_URL
            </p>

            {isDemoMode ? (
              <div className="mt-4 rounded-md border border-warning/25 bg-warning/[0.05] p-3.5 text-xs leading-5 text-muted-foreground">
                <p className="mb-1 font-medium text-foreground">How to connect</p>
                Set{" "}
                <code className="data-mono rounded bg-muted px-1 py-0.5 text-foreground">
                  VITE_API_BASE_URL
                </code>{" "}
                to your FastAPI address (for example{" "}
                <code className="data-mono rounded bg-muted px-1 py-0.5 text-foreground">
                  http://localhost:8000
                </code>
                ) and reload. Until then, transcription, model analysis, adaptation, evaluation and
                history stay empty — nothing is simulated.
              </div>
            ) : test.state === "ok" && test.info ? (
              <div className="mt-4 rounded-md border border-success/25 bg-success/[0.05] p-3.5 text-xs">
                <p className="mb-2 flex items-center gap-1.5 font-medium text-success">
                  <CircleCheck className="size-4" />
                  Connected · {test.ms} ms
                </p>
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-muted-foreground">
                  <dt>Model</dt>
                  <dd className="text-foreground">{test.info.model}</dd>
                  <dt>Dataset</dt>
                  <dd className="text-foreground">{test.info.dataset}</dd>
                  <dt>Status</dt>
                  <dd className="text-foreground">{test.info.status}</dd>
                  <dt>Languages</dt>
                  <dd className="text-foreground">{test.info.supportedLanguages?.join(", ")}</dd>
                </dl>
              </div>
            ) : test.state === "error" ? (
              <div
                role="alert"
                className="mt-4 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/[0.06] p-3.5 text-xs text-destructive"
              >
                <CircleAlert className="mt-0.5 size-4 shrink-0" />
                {test.message}
              </div>
            ) : null}
          </Surface>

          <Surface className="px-5 py-5">
            <SectionHeading title="Model" detail="Research configuration" />
            <div className="divide-y divide-border">
              <Row title="Acoustic model" detail="Multilingual wav2vec 2.0 encoder, CTC head">
                <Badge variant="outline" className="data-mono">
                  XLS-R 300M
                </Badge>
              </Row>
              <Row title="Dataset" detail="Fine-tuning benchmark">
                <span className="text-xs">MUCS 2021 · Subtask 2</span>
              </Row>
              <Row title="Language pair" detail="Code-switched recognition">
                <span className="inline-flex gap-2 text-xs">
                  <span className="token-hindi">Hindi</span>
                  <span className="text-muted-foreground">+</span>
                  <span className="token-english">English</span>
                </span>
              </Row>
            </div>
          </Surface>

          <Surface className="px-5 py-5">
            <SectionHeading
              title="Audio processing"
              detail="Applied to browser recording; stored for when the backend contract adds these options"
            />
            <div className="divide-y divide-border">
              <Row
                title="Preferred sample rate"
                detail="Preprocessing target (XLS-R expects 16 kHz)"
              >
                <select
                  value={prefs.sampleRate}
                  onChange={(e) => update("sampleRate", e.target.value as SampleRate)}
                  aria-label="Preferred sample rate"
                  className="field h-8 w-auto px-2 text-xs"
                >
                  <option>16 kHz</option>
                  <option>24 kHz</option>
                  <option>48 kHz</option>
                </select>
              </Row>
              <Row title="Noise suppression" detail="Browser noise suppression while recording">
                <Switch
                  checked={prefs.noiseRobustness}
                  onCheckedChange={(v) => update("noiseRobustness", v)}
                  aria-label="Noise suppression"
                />
              </Row>
              <Row
                title="Contextual rescoring by default"
                detail="Send domain vocabulary with each transcription"
              >
                <Switch
                  checked={prefs.contextualRescoring}
                  onCheckedChange={(v) => update("contextualRescoring", v)}
                  aria-label="Contextual rescoring by default"
                />
              </Row>
            </div>
          </Surface>
        </div>

        <div className="space-y-5">
          <Surface className="px-5 py-5">
            <SectionHeading title="Output" detail="How transcripts are shown and exported" />
            <div className="divide-y divide-border">
              <div className="pb-3.5">
                <label htmlFor="output-format" className="mb-2 block text-sm font-medium">
                  Default export format
                </label>
                <select
                  id="output-format"
                  value={prefs.exportFormat}
                  onChange={(e) => update("exportFormat", e.target.value as ExportFormat)}
                  className="field h-9 px-3 text-xs"
                >
                  <option value="txt">Plain text (.txt)</option>
                  <option value="json">JSON with word labels (.json)</option>
                  <option value="srt">SubRip subtitles (.srt) — needs timestamps</option>
                </select>
              </div>
              <Row title="Word timestamps" detail="Show start times above words when returned">
                <Switch
                  checked={prefs.showTimestamps}
                  onCheckedChange={(v) => update("showTimestamps", v)}
                  aria-label="Show word timestamps"
                />
              </Row>
              <Row title="Highlight low confidence" detail="Underline words under 60 % confidence">
                <Switch
                  checked={prefs.showConfidence}
                  onCheckedChange={(v) => update("showConfidence", v)}
                  aria-label="Highlight low confidence words"
                />
              </Row>
            </div>
          </Surface>

          <Surface className="px-5 py-5">
            <SectionHeading title="Stored in this browser" detail="Nothing here is sent anywhere" />
            <div className="space-y-2">
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={() => {
                  preferencesStore.reset();
                  toast.success("Preferences reset to defaults");
                }}
              >
                <RotateCcw className="size-4" />
                Reset preferences
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={() => {
                  sessionStore.reset();
                  toast.success("Session vocabulary and last transcript cleared");
                }}
              >
                <Trash2 className="size-4" />
                Clear session vocabulary & last transcript
              </Button>
            </div>
            <p className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Server className="size-3.5" />
              Preferences persist across visits; vocabulary lasts until this tab closes.
            </p>
          </Surface>
        </div>
      </div>
    </>
  );
}
