import { newCard, uid } from "./cards";
import type { Category, ChecklistCard, SectionData } from "./types";

const text = (title: string, ...paras: string[]) => ({
  ...newCard("richtext"),
  title,
  doc: {
    type: "doc" as const,
    content: paras.map((p) => ({ type: "paragraph", content: [{ type: "text", text: p }] })),
  },
});
const list = (title: string, items: string[]): ChecklistCard => ({
  id: uid(),
  type: "checklist",
  title,
  items: items.map((t) => ({ id: uid(), text: t, done: false })),
});

export interface Starter {
  key: string;
  name: string;
  category: Category;
  build: () => SectionData[];
}

export const STARTERS: Starter[] = [
  {
    key: "writing",
    name: "Writing project",
    category: "writing",
    build: () => [
      { title: "Overview", description: "Premise and goals", cards: [text("Premise", "What is this piece about?")] },
      { title: "Characters", description: "", cards: [text("Cast", "")] },
      { title: "Drafts", description: "", cards: [list("Milestones", ["Outline", "First draft", "Revision"])] },
    ],
  },
  {
    key: "software",
    name: "Software project",
    category: "software",
    build: () => [
      { title: "Overview", description: "", cards: [text("Goal", "What problem does it solve?"), { ...newCard("link"), title: "Repository" }] },
      { title: "Tasks", description: "", cards: [list("Backlog", ["Set up repository", "First feature"])] },
      { title: "Credentials", description: "Stored in the separate Secrets vault", cards: [newCard("vaultref")] },
    ],
  },
  {
    key: "art",
    name: "Art project",
    category: "art",
    build: () => [
      { title: "Overview", description: "", cards: [text("Concept", "")] },
      { title: "References", description: "", cards: [{ ...newCard("image"), title: "Reference" }] },
    ],
  },
  {
    key: "research",
    name: "Research or study",
    category: "research",
    build: () => [
      { title: "Overview", description: "", cards: [text("Question", "What am I trying to learn?")] },
      { title: "Sources", description: "", cards: [{ ...newCard("file"), title: "Paper" }, { ...newCard("link"), title: "Source" }] },
      { title: "Notes", description: "", cards: [text("Notes", "")] },
    ],
  },
  {
    key: "general",
    name: "General",
    category: "general",
    build: () => [
      { title: "Overview", description: "", cards: [text("Notes", ""), list("To do", [])] },
    ],
  },
];
