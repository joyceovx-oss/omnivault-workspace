import Dexie, { type Table } from "dexie";
import type { Attachment, Project, Section, Template, InboxItem, ItemReference, TrashItem, Tag, Card } from "./types";

class OmniDB extends Dexie {
  projects!: Table<Project, string>;
  sections!: Table<Section, string>;
  attachments!: Table<Attachment, string>;
  templates!: Table<Template, string>;
  inbox!: Table<InboxItem, string>;
  references!: Table<ItemReference, string>;
  trash!: Table<TrashItem, string>;
  tags!: Table<Tag, string>;
  constructor() {
    super("omnivault");
    // Schema v1. Add new this.version(n).stores(...).upgrade(...) blocks for migrations.
    this.version(1).stores({
      projects: "id, order",
      sections: "id, projectId, order",
      attachments: "id",
      templates: "id, level",
    });
    this.version(2).stores({
      projects: "id, order", sections: "id, projectId, order", attachments: "id", templates: "id, level",
      inbox: "id, createdAt", references: "id, kind, targetId, accessedAt", trash: "id, deletedAt",
    });
    this.version(3).stores({
      projects: "id, order", sections: "id, projectId, order", attachments: "id", templates: "id, level",
      inbox: "id, createdAt", references: "id, kind, targetId, accessedAt", trash: "id, deletedAt",
      tags: "id, &normalized, name",
    }).upgrade(async (tx) => {
      const byName = new Map<string, Tag>();
      const migrateCards = (cards: readonly Card[]): Card[] => cards.map((card): Card => {
        const children: Card[] | undefined = card.type === "composite" ? migrateCards(card.children) : undefined;
        const tagNames = [...new Set((card.tags ?? []).map((name) => {
          const cleaned = name.trim().replace(/\s+/g, " ");
          const normalized = cleaned.toLowerCase();
          if (!normalized) return "";
          let tag = byName.get(normalized);
          if (!tag) {
            tag = { id: crypto.randomUUID(), name: cleaned, normalized, createdAt: Date.now() };
            byName.set(normalized, tag);
          }
          return tag.name;
        }).filter(Boolean))];
        const tagIds = [...new Set([...(card.tagIds ?? []), ...tagNames.map((name) => byName.get(name.toLowerCase())?.id ?? "")].filter(Boolean))];
        return { ...card, ...(children ? { children } : {}), tags: tagNames, tagIds } as Card;
      });
      for (const section of await tx.table("sections").toArray())
        await tx.table("sections").put({ ...section, cards: migrateCards(section.cards) });
      for (const template of await tx.table("templates").toArray()) {
        if (template.level === "card") await tx.table("templates").put({ ...template, card: migrateCards([template.card])[0] });
        else if (template.level === "section") await tx.table("templates").put({ ...template, section: { ...template.section, cards: migrateCards(template.section.cards) } });
        else await tx.table("templates").put({ ...template, sections: template.sections.map((s: { cards: import("./types").Card[] }) => ({ ...s, cards: migrateCards(s.cards) })) });
      }
      for (const item of await tx.table("trash").toArray()) {
        if (item.type === "project") await tx.table("trash").put({ ...item, sections: item.sections.map((s: { cards: import("./types").Card[] }) => ({ ...s, cards: migrateCards(s.cards) })) });
        else if (item.type === "section") await tx.table("trash").put({ ...item, section: { ...item.section, cards: migrateCards(item.section.cards) } });
        else await tx.table("trash").put({ ...item, card: migrateCards([item.card])[0] });
      }
      if (byName.size) await tx.table("tags").bulkAdd([...byName.values()]);
    });
  }
}

export const db = new OmniDB();
