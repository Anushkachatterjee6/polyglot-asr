import type { TranscriptResult } from "@/lib/polyglot-api";

export type ExportFormat = "txt" | "json" | "srt";

export function transcriptBaseName(filename: string) {
  return filename.replace(/\.[^.]+$/, "") || "transcript";
}

export function canExportSrt(result: { words?: TranscriptResult["words"] }) {
  return Boolean(
    result.words?.length && result.words.every((w) => w.start !== undefined && w.end !== undefined),
  );
}

function srtTime(seconds: number) {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const rest = ms % 1000;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(rest).padStart(3, "0")}`;
}

/** Groups timed words into subtitle cues of at most `maxWords` words. */
export function toSrt(result: { words?: TranscriptResult["words"] }, maxWords = 8): string {
  if (!canExportSrt(result)) throw new Error("SRT export needs word timestamps from the backend.");
  const words = result.words!;
  const cues: string[] = [];
  for (let i = 0; i < words.length; i += maxWords) {
    const chunk = words.slice(i, i + maxWords);
    const first = chunk[0]!;
    const last = chunk[chunk.length - 1]!;
    cues.push(
      `${cues.length + 1}\n${srtTime(first.start!)} --> ${srtTime(last.end!)}\n${chunk.map((w) => w.text).join(" ")}`,
    );
  }
  return `${cues.join("\n\n")}\n`;
}

export function formatTranscript(
  result: TranscriptResult,
  format: ExportFormat,
): { filename: string; content: string; mimeType: string } {
  const base = transcriptBaseName(result.filename);
  if (format === "json") {
    return {
      filename: `${base}-transcript.json`,
      content: JSON.stringify(result, null, 2),
      mimeType: "application/json;charset=utf-8",
    };
  }
  if (format === "srt") {
    return {
      filename: `${base}.srt`,
      content: toSrt(result),
      mimeType: "application/x-subrip;charset=utf-8",
    };
  }
  const text = result.contextualTranscript
    ? `${result.transcript}\n\n--- Context-adapted ---\n${result.contextualTranscript}\n`
    : `${result.transcript}\n`;
  return {
    filename: `${base}-transcript.txt`,
    content: text,
    mimeType: "text/plain;charset=utf-8",
  };
}
