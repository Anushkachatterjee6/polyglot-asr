import { createFileRoute } from "@tanstack/react-router";
import { OverviewPage } from "@/components/polyglot-pages";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Polyglot ASR — Research Overview" },
      {
        name: "description",
        content:
          "Overview of the code-switched Hindi–English ASR research project: XLS-R 300M, MUCS 2021, model status and recent sessions.",
      },
      { property: "og:title", content: "Polyglot ASR — Research Overview" },
      {
        property: "og:description",
        content:
          "Overview of the code-switched Hindi–English ASR research project: XLS-R 300M, MUCS 2021, model status and recent sessions.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OverviewPage,
});
