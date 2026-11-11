import type { TranscriptWord } from "@/lib/polyglot-api";

export type LanguageLabel = TranscriptWord["language"];

const DEVANAGARI = /[\u0900-\u097F]/;
const LATIN = /[A-Za-z]/;

/**
 * Script-based token labelling: Devanagari → Hindi, Latin → English, anything else → other.
 * This is a quick local estimate, not a language-identification model: romanized Hindi
 * ("kya", "hai") is labelled English. Backend word labels always take precedence.
 */
export function identifyWords(text: string): TranscriptWord[] {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => ({
      text: word,
      language: DEVANAGARI.test(word) ? "hi" : LATIN.test(word) ? "en" : "other",
    }));
}

export type LanguageSegment = { language: "hi" | "en"; words: TranscriptWord[] };

export type LanguageStats = {
  total: number;
  hindi: number;
  english: number;
  other: number;
  /** Hindi share of labelled (hi + en) tokens, 0–100. */
  hindiShare: number;
  englishShare: number;
  /** Number of hi↔en transitions between consecutive labelled tokens ("other" tokens are skipped). */
  switches: number;
  hindiToEnglish: number;
  englishToHindi: number;
  /** Switches per labelled word boundary, 0–100. */
  switchRate: number;
  segments: LanguageSegment[];
  longestRun: number;
  meanRunLength: number;
};

export function languageStats(words: TranscriptWord[]): LanguageStats {
  const labelled = words.filter(
    (w): w is TranscriptWord & { language: "hi" | "en" } => w.language !== "other",
  );
  const hindi = labelled.filter((w) => w.language === "hi").length;
  const english = labelled.length - hindi;
  const segments: LanguageSegment[] = [];
  let hindiToEnglish = 0;
  let englishToHindi = 0;
  for (const word of labelled) {
    const last = segments.at(-1);
    if (last && last.language === word.language) {
      last.words.push(word);
      continue;
    }
    if (last) {
      if (last.language === "hi") hindiToEnglish += 1;
      else englishToHindi += 1;
    }
    segments.push({ language: word.language, words: [word] });
  }
  const switches = hindiToEnglish + englishToHindi;
  const boundaries = Math.max(labelled.length - 1, 0);
  const runLengths = segments.map((s) => s.words.length);
  return {
    total: words.length,
    hindi,
    english,
    other: words.length - labelled.length,
    hindiShare: labelled.length ? round1((hindi / labelled.length) * 100) : 0,
    englishShare: labelled.length ? round1((english / labelled.length) * 100) : 0,
    switches,
    hindiToEnglish,
    englishToHindi,
    switchRate: boundaries ? round1((switches / boundaries) * 100) : 0,
    segments,
    longestRun: runLengths.length ? Math.max(...runLengths) : 0,
    meanRunLength: runLengths.length ? round1(labelled.length / runLengths.length) : 0,
  };
}

export type LanguageMix = "hindi" | "english" | "mixed" | "unknown";

/** Dominant-language bucket used for history filtering. ≥ 80 % of labelled tokens = dominant. */
export function languageMix(stats: LanguageStats): LanguageMix {
  if (stats.hindi + stats.english === 0) return "unknown";
  if (stats.hindiShare >= 80) return "hindi";
  if (stats.englishShare >= 80) return "english";
  return "mixed";
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}
