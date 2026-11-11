import { afterEach, describe, expect, it, vi } from "vitest";
import { isDemoMode, transcribeAudio } from "@/lib/polyglot-api";

describe("Polyglot ASR API boundaries", () => {
  afterEach(() => vi.restoreAllMocks());

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
});
