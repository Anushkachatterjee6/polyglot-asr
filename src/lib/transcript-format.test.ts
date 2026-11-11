import { describe, expect, it } from "vitest";
import { canExportSrt, formatTranscript, toSrt } from "@/lib/transcript-format";
import { addTerm } from "@/lib/polyglot-store";
import { diffWords } from "@/lib/word-diff";

const base = {
  id: "1",
  filename: "lecture.wav",
  transcript: "मुझे machine",
  status: "completed" as const,
};

describe("transcript export", () => {
  it("refuses SRT without word timestamps", () => {
    expect(canExportSrt({ words: undefined })).toBe(false);
    expect(canExportSrt({ words: [{ text: "मुझे", language: "hi" }] })).toBe(false);
    expect(() => toSrt({ words: undefined })).toThrow("timestamps");
  });

  it("builds SRT cues from timed words", () => {
    const srt = toSrt({
      words: [
        { text: "मुझे", language: "hi", start: 0, end: 0.4 },
        { text: "machine", language: "en", start: 0.4, end: 1.25 },
      ],
    });
    expect(srt).toBe("1\n00:00:00,000 --> 00:00:01,250\nमुझे machine\n");
  });

  it("names exports after the audio file", () => {
    expect(formatTranscript(base, "txt").filename).toBe("lecture-transcript.txt");
    expect(formatTranscript(base, "json").filename).toBe("lecture-transcript.json");
  });
});

describe("vocabulary", () => {
  it("ignores blank and case-insensitive duplicate terms", () => {
    expect(addTerm(["Python"], "  python ")).toEqual(["Python"]);
    expect(addTerm(["Python"], "   ")).toEqual(["Python"]);
    expect(addTerm(["Python"], "data  structure")).toEqual(["Python", "data structure"]);
  });
});

describe("adaptation diff", () => {
  it("marks words changed by adaptation", () => {
    const d = diffWords("मुझे machine lerning पढ़ना है", "मुझे machine learning पढ़ना है");
    expect(d.original.filter((p) => p.type === "removed").map((p) => p.text)).toEqual(["lerning"]);
    expect(d.adapted.filter((p) => p.type === "added").map((p) => p.text)).toEqual(["learning"]);
  });
});
