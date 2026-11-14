import { afterEach, describe, expect, it, vi } from "vitest";
import { isDemoMode, TRANSCRIPTION_TIMEOUT_MS, transcribeAudio } from "@/lib/polyglot-api";

describe("Polyglot ASR API boundaries", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("does not fabricate a transcript when the backend is not configured", async () => {
    if (isDemoMode) {
      await expect(transcribeAudio({ audio: new File(["audio"], "sample.wav") })).rejects.toThrow(
        "Backend unavailable. Configure VITE_API_BASE_URL",
      );
    }
  });

  it("reports disconnected backends without substituting demo output", async () => {
    if (isDemoMode) return;
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await expect(transcribeAudio({ audio: new File(["audio"], "sample.wav") })).rejects.toThrow(
      "Could not reach the transcription backend",
    );
  });

  it("bounds a stalled transcription request and returns a usable error", async () => {
    if (isDemoMode) return;
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init?: RequestInit) => new Promise((_, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      })),
    );
    const request = transcribeAudio({ audio: new File(["audio"], "sample.wav") });
    const rejection = expect(request).rejects.toThrow(
      `timed out after ${Math.ceil(TRANSCRIPTION_TIMEOUT_MS / 1000)} seconds`,
    );
    await vi.advanceTimersByTimeAsync(TRANSCRIPTION_TIMEOUT_MS);
    await rejection;
  });

  it("signals live analytics after a transcription is persisted", async () => {
    if (isDemoMode) return;
    const saved = vi.fn();
    window.addEventListener("polyglot:transcription-saved", saved);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: "recording-1", filename: "sample.wav", transcript: "hello", status: "completed",
    }), { status: 200, headers: { "Content-Type": "application/json" } })));
    await transcribeAudio({ audio: new File(["audio"], "sample.wav") });
    expect(saved).toHaveBeenCalledTimes(1);
    window.removeEventListener("polyglot:transcription-saved", saved);
  });
});
