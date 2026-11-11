import { createFileRoute } from "@tanstack/react-router";
import { SettingsPage } from "@/components/polyglot-pages";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Polyglot ASR" },
      {
        name: "description",
        content:
          "Backend connection, audio processing and transcript output preferences for the Polyglot ASR console.",
      },
      { property: "og:title", content: "Settings — Polyglot ASR" },
      {
        property: "og:description",
        content:
          "Backend connection, audio processing and transcript output preferences for the Polyglot ASR console.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsPage,
});
