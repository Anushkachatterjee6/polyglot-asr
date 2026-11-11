import { createFileRoute } from "@tanstack/react-router";
import { TranscriptionPage } from "@/components/polyglot-pages";

export const Route = createFileRoute("/transcription")({
  head: () => ({
    meta: [
      { title: "Transcription Studio — Polyglot ASR" },
      {
        name: "description",
        content:
          "Upload or record Hindi–English audio, review the waveform and get code-switched transcripts from the XLS-R backend.",
      },
      { property: "og:title", content: "Transcription Studio — Polyglot ASR" },
      {
        property: "og:description",
        content:
          "Upload or record Hindi–English audio, review the waveform and get code-switched transcripts from the XLS-R backend.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TranscriptionPage,
});
