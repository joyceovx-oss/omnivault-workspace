export const SCHEMA_VERSION = 2;

export type Category = "general" | "writing" | "software" | "art" | "research";
export const CATEGORIES: { value: Category; label: string }[] = [
  { value: "general", label: "General" },
  { value: "writing", label: "Writing" },
  { value: "software", label: "Software" },
  { value: "art", label: "Art" },
  { value: "research", label: "Research & learning" },
];

export interface Project {
  id: string;
  name: string;
  category: Category;
  order: number;
  archived: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Section {
  id: string;
  projectId: string;
  title: string;
  description: string;
  order: number;
  cards: Card[];
}

/** Rich text uses Tiptap/ProseMirror JSON. */
export type RichDoc = { type: "doc"; content?: unknown[] };

interface Base {
  id: string;
  title: string;
  tags?: string[];
}
export interface RichTextCard extends Base {
  type: "richtext";
  doc: RichDoc;
}
export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}
export interface ChecklistCard extends Base {
  type: "checklist";
  items: ChecklistItem[];
}
export interface ChoiceOption {
  id: string;
  label: string;
}
export interface ChoiceCard extends Base {
  type: "radio" | "dropdown";
  options: ChoiceOption[];
  selected: string | null;
}
export interface ImageCard extends Base {
  type: "image";
  attachmentId: string | null;
  mode: "fit" | "actual";
}
export interface FileCard extends Base {
  type: "file";
  attachmentId: string | null;
}
export interface LinkCard extends Base {
  type: "link";
  url: string;
  notes: string;
}
/** Holds only a harmless collection label — never secret values. */
export interface VaultRefCard extends Base {
  type: "vaultref";
  collection: string;
}

export type LeafCard =
  | RichTextCard
  | ChecklistCard
  | ChoiceCard
  | ImageCard
  | FileCard
  | LinkCard
  | VaultRefCard;

export interface CompositeCard extends Base {
  type: "composite";
  children: LeafCard[];
}

export type Card = LeafCard | CompositeCard;
export type CardType = Card["type"];

export interface Attachment {
  id: string;
  name: string;
  mime: string;
  size: number;
  blob: Blob;
  createdAt: number;
}

export type SectionData = Pick<Section, "title" | "description" | "cards">;

export interface InboxItem { id: string; text: string; createdAt: number; }
export interface ItemReference { id: string; kind: "favorite" | "recent"; type: "project" | "section" | "card"; targetId: string; accessedAt: number; }
export type TrashItem = { id: string; deletedAt: number } & (
  | { type: "project"; project: Project; sections: Section[] }
  | { type: "section"; section: Section }
  | { type: "card"; card: Card; sectionId: string; projectId: string; index: number }
);

export type Template =
  | { id: string; level: "card"; name: string; createdAt: number; card: Card }
  | { id: string; level: "section"; name: string; createdAt: number; section: SectionData }
  | {
      id: string;
      level: "project";
      name: string;
      createdAt: number;
      category: Category;
      sections: SectionData[];
    };
