import { createFileRoute } from "@tanstack/react-router";
import { LanguageAnalysisPage } from "@/components/polyglot-pages";

export const Route = createFileRoute("/language-analysis")({
  head: () => ({
    meta: [
      { title: "Language Analysis — Polyglot ASR" },
      {
        name: "description",
        content:
          "Token-level Hindi/English labels, language distribution and code-switching statistics for transcripts.",
      },
      { property: "og:title", content: "Language Analysis — Polyglot ASR" },
      {
        property: "og:description",
        content:
          "Token-level Hindi/English labels, language distribution and code-switching statistics for transcripts.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LanguageAnalysisPage,
});
