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
  language: "hi" | "en" | "other";
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
  status: "completed";
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

export type ApiMode = "demo" | "backend";

export const API_BASE_URL = import.meta.env["VITE_API_BASE_URL"]?.trim().replace(/\/$/, "") ?? "";
export const API_MODE: ApiMode = API_BASE_URL ? "backend" : "demo";
export const isDemoMode = API_MODE === "demo";

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

export async function transcribeAudio(input: TranscriptionRequest): Promise<TranscriptResult> {
  const form = new FormData();
  form.set("audio", input.audio);
  if (input.domain) form.set("domain", input.domain);
  form.set("vocabulary", JSON.stringify(input.vocabulary ?? []));
  form.set("contextual_rescoring", String(input.contextualRescoring ?? true));
  return request<TranscriptResult>("/api/transcribe", {
    method: "POST",
    body: form,
    signal: input.signal ?? null,
  });
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

export async function getEvaluation(): Promise<{
  metrics: EvaluationMetric[];
  experiments: Array<Record<string, string | number | null>>;
}> {
  return request("/api/evaluation");
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
