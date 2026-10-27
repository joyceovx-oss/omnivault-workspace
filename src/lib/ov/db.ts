import Dexie, { type Table } from "dexie";
import type { Attachment, Project, Section, Template } from "./types";

class OmniDB extends Dexie {
  projects!: Table<Project, string>;
  sections!: Table<Section, string>;
  attachments!: Table<Attachment, string>;
  templates!: Table<Template, string>;
  constructor() {
    super("omnivault");
    // Schema v1. Add new this.version(n).stores(...).upgrade(...) blocks for migrations.
    this.version(1).stores({
      projects: "id, order",
      sections: "id, projectId, order",
      attachments: "id",
      templates: "id, level",
    });
  }
}

export const db = new OmniDB();
