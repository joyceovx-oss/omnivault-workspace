import type { Card, Project, Section, Template, ItemReference } from "./types";

export interface SearchResult { id: string; type: string; title: string; location: string; text: string; projectId?: string; sectionId?: string; cardId?: string; templateId?: string; tags: string[]; }
function docText(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const node = value as { text?: string; content?: unknown[] };
  return [node.text ?? "", ...(node.content ?? []).map(docText)].join(" ");
}
export function cardText(c: Card): string {
  switch (c.type) {
    case "composite": return c.children.map((ch) => `${ch.title} ${cardText(ch)} ${(ch.tags ?? []).join(" ")}`).join(" ");
    case "richtext": return docText(c.doc);
    case "checklist": return c.items.map((i) => i.text).join(" ");
    case "radio": case "dropdown": return c.options.map((o) => o.label).join(" ");
    case "link": return `${c.url} ${c.notes}`;
    case "vaultref": return c.collection;
    default: return "";
  }
}
export function searchIndex(projects: Project[], sections: Section[], templates: Template[]): SearchResult[] {
  const rows: SearchResult[] = projects.map((p) => ({ id: p.id, type: "project", title: p.name, location: "Project", text: p.name, projectId: p.id, tags: [] }));
  for (const s of sections) {
    const p = projects.find((p) => p.id === s.projectId);
    if (!p) continue;
    rows.push({ id: s.id, type: "section", title: s.title, location: p.name, text: s.description, projectId: p.id, sectionId: s.id, tags: [] });
    const add = (c: Card, parent?: string) => {
      rows.push({ id: c.id, type: c.type, title: c.title, location: `${p.name} / ${s.title}${parent ? ` / ${parent}` : ""}`, text: cardText(c), projectId: p.id, sectionId: s.id, cardId: c.id, tags: c.tags ?? [] });
      if (c.type === "composite") c.children.forEach((ch) => add(ch, c.title));
    };
    s.cards.forEach((c) => add(c));
  }
  for (const t of templates) {
    const cards = t.level === "card" ? [t.card] : t.level === "section" ? t.section.cards : t.sections.flatMap((s) => s.cards);
    const sectionsText = t.level === "section" ? `${t.section.title} ${t.section.description}` : t.level === "project" ? t.sections.map((s) => `${s.title} ${s.description}`).join(" ") : "";
    rows.push({ id: t.id, type: "template", title: t.name, location: `${t.level} template`, text: `${sectionsText} ${cards.map((c) => `${c.title} ${cardText(c)}`).join(" ")}`, templateId: t.id, tags: cards.flatMap((c) => c.tags ?? []) });
  }
  return rows;
}
export function filterSearch(rows: SearchResult[], query: string, project = "all", type = "all", tag = "all") {
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return rows.filter((r) => (project === "all" || r.projectId === project) && (type === "all" || r.type === type) && (tag === "all" || r.tags.includes(tag)) && words.every((w) => `${r.title} ${r.text} ${r.tags.join(" ")}`.toLowerCase().includes(w)));
}
export function resolveReferences(refs: ItemReference[], rows: SearchResult[]) {
  return [...refs].sort((a, b) => b.accessedAt - a.accessedAt).flatMap((ref) => {
    const row = rows.find((r) => r.id === ref.targetId && (ref.type === "card" ? !!r.cardId : r.type === ref.type));
    return row ? [{ ref, row }] : [];
  });
}