import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { Workspace } from "@/components/ov/Workspace";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "OmniVault — Projects, ideas and resources in one workspace" },
      { name: "description", content: "A flexible, document-like workspace for projects, sections, cards and reusable templates." },
      { property: "og:title", content: "OmniVault" },
      { property: "og:description", content: "A flexible, document-like workspace for projects, sections, cards and reusable templates." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <ClientOnly fallback={<div className="h-dvh bg-background" />}>
      <Workspace />
    </ClientOnly>
  ),
});
