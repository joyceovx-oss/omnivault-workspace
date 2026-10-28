import Dexie, { type Table } from "dexie";
import type { Attachment, Project, Section, Template, InboxItem, ItemReference, TrashItem } from "./types";

class OmniDB extends Dexie {
  projects!: Table<Project, string>;
  sections!: Table<Section, string>;
  attachments!: Table<Attachment, string>;
  templates!: Table<Template, string>;
  inbox!: Table<InboxItem, string>;
  references!: Table<ItemReference, string>;
  trash!: Table<TrashItem, string>;
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
  }
}

export const db = new OmniDB();
