import { describe, expect, it } from "vitest";
import { identifyWords, languageMix, languageStats } from "@/lib/language-stats";

describe("language statistics", () => {
  it("labels Devanagari as Hindi, Latin as English and the rest as other", () => {
    expect(identifyWords("मुझे machine 42").map((w) => w.language)).toEqual(["hi", "en", "other"]);
  });

  it("counts switches between consecutive labelled tokens, skipping other tokens", () => {
    // HI EN EN HI EN HI HI → 4 switches (HI→EN 2, EN→HI 2)
    const stats = languageStats(
      identifyWords("मुझे machine learning का assignment complete करना है।"),
    );
    expect(stats.hindi).toBe(4);
    expect(stats.english).toBe(4);
    expect(stats.switches).toBe(4);
    expect(stats.hindiToEnglish).toBe(2);
    expect(stats.englishToHindi).toBe(2);
    expect(stats.segments.map((s) => s.words.length)).toEqual([1, 2, 1, 2, 2]);
    expect(stats.longestRun).toBe(2);
  });

  it("does not treat numbers or punctuation as a language switch", () => {
    const stats = languageStats(identifyWords("मुझे 2 बजे"));
    expect(stats.switches).toBe(0);
    expect(stats.other).toBe(1);
  });

  it("buckets a transcript as code-switched unless one language has at least 80%", () => {
    expect(languageMix(languageStats(identifyWords("a b c d मुझे")))).toBe("english");
    expect(languageMix(languageStats(identifyWords("a b c मुझे")))).toBe("mixed");
    expect(languageMix(languageStats(identifyWords("123")))).toBe("unknown");
  });
});
