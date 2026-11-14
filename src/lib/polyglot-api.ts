export type ApiError = {
  message: string;
  status?: number;
};

export type TranscriptionRequest = {
  audio: File;
  domain?: string;
  vocabulary?: string[];
  contextualRescoring?: boolean;
  /** Optional: lets the UI cancel an in-flight request. Not sent to the backend. */
  signal?: AbortSignal;
};

export type TranscriptWord = {
  text: string;
  language: "hi" | "en" | "other" | "unknown";
  start?: number;
  end?: number;
  confidence?: number;
};

export type TranscriptResult = {
  id: string;
  filename: string;
  transcript: string;
  contextualTranscript?: string;
  durationSeconds?: number;
  words?: TranscriptWord[];
  /** Optional ISO-8601 timestamp; shown in history when the backend provides it. */
  createdAt?: string;
  processingSeconds?: number;
  provider?: string;
  requestedLanguage?: string;
  detectedLanguage?: string;
  referenceTranscript?: string;
  error?: string;
  status: "completed" | "failed";
};

export type ModelInfo = {
  project: string;
  dataset: string;
  model: string;
  status: string;
  supportedLanguages: string[];
};

export type EvaluationMetric = {
  name: string;
  value: number | null;
  unit: string;
  experiment?: string;
};

export type EvaluationResponse = {
  metrics: EvaluationMetric[];
  experiments: Array<Record<string, string | number | null>>;
  status?: "awaiting-dataset" | "ready-to-run" | "running" | "completed" | "completed-with-errors" | "timed-out" | "failed";
  dataset?: { samples?: number; status?: string } | null;
  details?: Array<Record<string, unknown>> | null;
  normalization?: string | null;
  runId?: string | null;
  progress?: { completed: number; total: number; failed: number; currentSampleId?: string | null } | null;
  error?: string | null;
};

export type LiveAnalytics = {
  status: "empty" | "ready";
  totals: {
    recordings: number;
    successful: number;
    failed: number;
    averageProcessingSeconds: number | null;
    averageAudioSeconds: number | null;
    realTimeFactor: number | null;
    averageWords: number | null;
    totalWords: number;
    referencedRecordings: number;
    wer: number | null;
    cer: number | null;
    wordAccuracy?: number | null;
    proxyRecordings?: number;
    estimatedWer?: number | null;
    estimatedCer?: number | null;
    estimatedWordAccuracy?: number | null;
  };
  languageDistribution: Array<{ language: "hi" | "en" | "other" | "unknown"; count: number }>;
  activity: Array<{ date: string; recordings: number; successful: number; failed: number; averageProcessingSeconds: number | null }>;
  latencyTimeline: Array<{ timestamp: string; processingSeconds: number }>;
  durationComparison: Array<{ id: string; audioSeconds: number | null; processingSeconds: number | null }>;
  codeSwitching: { mixedRecordings: number; hindiEnglish: number; tamilEnglish: number | null; switches: number; switchRatio: number | null };
  records: LiveAnalyticsRecord[];
  referenceTrend: Array<{ timestamp: string; wer: number; cer: number }>;
  proxyTrend: Array<{ timestamp: string; wer: number; cer: number }>;
};

export type LiveAnalyticsRecord = {
  id: string;
  timestamp: string;
  filename: string;
  transcript: string;
  referenceTranscript: string | null;
  provider: string | null;
  detectedLanguage: string | null;
  status: "completed" | "failed";
  error: string | null;
  audioSeconds: number | null;
  processingSeconds: number | null;
  wordCount: number;
  estimatedWer: number | null;
  estimatedCer: number | null;
  wer: number | null;
  cer: number | null;
};

export type ApiMode = "demo" | "backend";

export const API_BASE_URL = import.meta.env["VITE_API_BASE_URL"]?.trim().replace(/\/$/, "") ?? "";
export const API_MODE: ApiMode = API_BASE_URL ? "backend" : "demo";
export const isDemoMode = API_MODE === "demo";

function configuredTranscriptionTimeoutMs(): number {
  const configured = Number(import.meta.env["VITE_TRANSCRIPTION_TIMEOUT_MS"]);
  // This is deliberately slightly longer than the backend's 60-second
  // default, while still guaranteeing that the UI leaves its busy state.
  return Number.isFinite(configured) && configured >= 15_000 && configured <= 120_000
    ? configured
    : 70_000;
}

export const TRANSCRIPTION_TIMEOUT_MS = configuredTranscriptionTimeoutMs();
export const EVALUATION_TIMEOUT_MS = 330_000;
const EVALUATION_REQUEST_TIMEOUT_MS = 15_000;

function apiUrl(path: string): string {
  if (!API_BASE_URL) {
    throw new Error(
      "Backend unavailable. Configure VITE_API_BASE_URL to connect the FastAPI service.",
    );
  }
  return `${API_BASE_URL}${path}`;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const url = apiUrl(path);
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError") throw cause;
    throw new Error("Could not reach the transcription backend. Check its address and try again.");
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(detail || `Backend request failed (${response.status}).`);
  }
  return (await response.json()) as T;
}

async function evaluationRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), EVALUATION_REQUEST_TIMEOUT_MS);
  try {
    return await request<T>(path, { ...init, signal: controller.signal });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError") {
      throw new Error("The evaluation backend did not respond within 15 seconds. Restart the backend and try again.");
    }
    throw cause;
  } finally {
    window.clearTimeout(timer);
  }
}

export async function transcribeAudio(input: TranscriptionRequest): Promise<TranscriptResult> {
  const form = new FormData();
  form.set("audio", input.audio);
  if (input.domain) form.set("domain", input.domain);
  form.set("vocabulary", JSON.stringify(input.vocabulary ?? []));
  form.set("contextual_rescoring", String(input.contextualRescoring ?? true));
  const controller = new AbortController();
  let timedOut = false;
  const abortForCaller = () => controller.abort();
  input.signal?.addEventListener("abort", abortForCaller, { once: true });
  if (input.signal?.aborted) controller.abort();
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, TRANSCRIPTION_TIMEOUT_MS);
  try {
    const result = await request<TranscriptResult>("/api/transcribe", {
      method: "POST",
      body: form,
      signal: controller.signal,
    });
    window.dispatchEvent(new Event("polyglot:transcription-saved"));
    return result;
  } catch (cause) {
    if (timedOut) {
      throw new Error(
        `Transcription request timed out after ${Math.ceil(TRANSCRIPTION_TIMEOUT_MS / 1000)} seconds. Please try again.`,
      );
    }
    throw cause;
  } finally {
    clearTimeout(timer);
    input.signal?.removeEventListener("abort", abortForCaller);
  }
}

export async function uploadRecording(audio: Blob, filename: string): Promise<{ id: string }> {
  const form = new FormData();
  form.set("audio", audio, filename);
  return request<{ id: string }>("/api/record", { method: "POST", body: form });
}

export async function adaptContext(input: {
  transcript: string;
  domain: string;
  vocabulary: string[];
}) {
  return request<{ original: string; adapted: string }>("/api/context", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function analyzeLanguage(transcript: string) {
  return request<{
    words: TranscriptWord[];
    hindiCount: number;
    englishCount: number;
    switches: number;
  }>("/api/analyze-language", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transcript }),
  });
}

export async function getHistory(): Promise<TranscriptResult[]> {
  return request<TranscriptResult[]>("/api/history");
}

export async function getModelInfo(): Promise<ModelInfo> {
  return request<ModelInfo>("/api/model-info");
}

export async function getEvaluation(): Promise<LiveAnalytics> {
  return evaluationRequest("/api/evaluation");
}

export async function setReferenceTranscript(id: string, referenceTranscript: string): Promise<TranscriptResult> {
  return request<TranscriptResult>(`/api/history/${encodeURIComponent(id)}/reference`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ referenceTranscript }),
  });
}

export async function uploadEvaluationDataset(dataset: File) {
  const form = new FormData();
  form.set("dataset", dataset);
  return request<{ status: string; samples: number; errors: string[] }>("/api/evaluation/dataset", {
    method: "POST", body: form,
  });
}

export async function runEvaluation(experiment: "E0" | "E1" | "E2" | "E3" | "E4" | "E5") {
  return evaluationRequest<EvaluationResponse>("/api/evaluation/run", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ experiment }),
  });
}

export async function getEvaluationRun(runId: string) {
  return evaluationRequest<EvaluationResponse>(`/api/evaluation/run/${encodeURIComponent(runId)}`);
}

export async function exportTranscript(input: { transcript: string; format: "txt" | "json" }) {
  return request<{ content: string; filename: string }>("/api/export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function downloadText(
  filename: string,
  text: string,
  mimeType = "text/plain;charset=utf-8",
) {
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
