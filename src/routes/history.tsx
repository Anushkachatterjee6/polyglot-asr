import { createFileRoute } from "@tanstack/react-router";
import { HistoryPage } from "@/components/polyglot-pages";

export const Route = createFileRoute("/history")({
  head: () => ({
    meta: [
      { title: "Transcription History — Polyglot ASR" },
      {
        name: "description",
        content:
          "Search, filter, view and download transcripts stored by the connected ASR backend.",
      },
      { property: "og:title", content: "Transcription History — Polyglot ASR" },
      {
        property: "og:description",
        content:
          "Search, filter, view and download transcripts stored by the connected ASR backend.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HistoryPage,
});
