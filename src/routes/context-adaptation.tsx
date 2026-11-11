import { createFileRoute } from "@tanstack/react-router";
import { ContextAdaptationPage } from "@/components/polyglot-pages";

export const Route = createFileRoute("/context-adaptation")({
  head: () => ({
    meta: [
      { title: "Context Adaptation — Polyglot ASR" },
      {
        name: "description",
        content:
          "Manage domain vocabulary and compare original and context-adapted Hindi–English transcripts.",
      },
      { property: "og:title", content: "Context Adaptation — Polyglot ASR" },
      {
        property: "og:description",
        content:
          "Manage domain vocabulary and compare original and context-adapted Hindi–English transcripts.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ContextAdaptationPage,
});
