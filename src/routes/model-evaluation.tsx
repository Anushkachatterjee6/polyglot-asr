import { createFileRoute } from "@tanstack/react-router";
import { EvaluationPage } from "@/components/polyglot-pages";

export const Route = createFileRoute("/model-evaluation")({
  head: () => ({
    meta: [
      { title: "Model Evaluation — Polyglot ASR" },
      {
        name: "description",
        content:
          "WER, CER, language-ID accuracy, switch-boundary F1 and real-time factor across experiments E0–E5.",
      },
      { property: "og:title", content: "Model Evaluation — Polyglot ASR" },
      {
        property: "og:description",
        content:
          "WER, CER, language-ID accuracy, switch-boundary F1 and real-time factor across experiments E0–E5.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: EvaluationPage,
});
