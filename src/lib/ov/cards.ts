import type { Card, CardType, LeafCard, SectionData } from "./types";

export const uid = () => crypto.randomUUID();

export const CARD_TYPES: { type: Exclude<CardType, "composite">; label: string }[] = [
  { type: "richtext", label: "Rich text" },
  { type: "checklist", label: "Checklist" },
  { type: "radio", label: "Radio selection" },
  { type: "dropdown", label: "Dropdown selection" },
  { type: "image", label: "Image" },
  { type: "file", label: "File attachment" },
  { type: "link", label: "Link & media" },
  { type: "vaultref", label: "Secrets vault reference" },
];

export function newCard(type: Exclude<CardType, "composite">): LeafCard {
  const id = uid();
  switch (type) {
    case "richtext":
      return { id, type, title: "Notes", doc: { type: "doc", content: [] } };
    case "checklist":
      return { id, type, title: "Checklist", items: [] };
    case "radio":
    case "dropdown":
      return {
        id,
        type,
        title: type === "radio" ? "Choose one" : "Select",
        options: [
          { id: uid(), label: "Option 1" },
          { id: uid(), label: "Option 2" },
        ],
        selected: null,
      };
    case "image":
      return { id, type, title: "Image", attachmentId: null, mode: "fit" };
    case "file":
      return { id, type, title: "File", attachmentId: null };
    case "link":
      return { id, type, title: "Link", url: "", notes: "" };
    case "vaultref":
      return { id, type, title: "Secrets", collection: "Default" };
  }
}

export function collectAttachmentIds(cards: Card[]): string[] {
  const out: string[] = [];
  for (const c of cards) {
    if (c.type === "composite") out.push(...collectAttachmentIds(c.children));
    else if ((c.type === "image" || c.type === "file") && c.attachmentId) out.push(c.attachmentId);
  }
  return out;
}

export interface CloneOpts {
  resetChecklist?: boolean;
  /** old attachment id -> new attachment id; ids missing from the map are kept. */
  attachmentMap?: Record<string, string>;
}

function cloneLeaf(c: LeafCard, o: CloneOpts): LeafCard {
  const base = structuredClone(c);
  base.id = uid();
  switch (base.type) {
    case "checklist":
      base.items = base.items.map((i) => ({
        ...i,
        id: uid(),
        done: o.resetChecklist ? false : i.done,
      }));
      break;
    case "radio":
    case "dropdown": {
      const map: Record<string, string> = {};
      base.options = base.options.map((op) => {
        const nid = uid();
        map[op.id] = nid;
        return { ...op, id: nid };
      });
      base.selected = base.selected ? (map[base.selected] ?? null) : null;
      break;
    }
    case "image":
    case "file":
      if (base.attachmentId && o.attachmentMap?.[base.attachmentId])
        base.attachmentId = o.attachmentMap[base.attachmentId]!;
      break;
    case "vaultref":
      base.collection = base.collection || "Default";
      break;
  }
  return base;
}

/** Deep copy with fresh ids everywhere. */
export function cloneCard(c: Card, o: CloneOpts = {}): Card {
  if (c.type === "composite")
    return { ...c, id: uid(), children: c.children.map((ch) => cloneLeaf(ch, o)) };
  return cloneLeaf(c, o);
}

export function cloneSectionData(s: SectionData, o: CloneOpts = {}): SectionData {
  return { title: s.title, description: s.description, cards: s.cards.map((c) => cloneCard(c, o)) };
}

/** Combine selected same-level cards into one composite at the first selected position. */
export function stitch(cards: Card[], ids: string[], title = "Stitched component"): Card[] {
  const set = new Set(ids);
  if (set.size < 2) throw new Error("Select at least two cards to stitch.");
  const picked = cards.filter((c) => set.has(c.id));
  if (picked.length !== set.size) throw new Error("Some selected cards are not in this section.");
  if (picked.some((c) => c.type === "composite"))
    throw new Error("Stitched components can't be nested. Ungroup them first.");
  const composite: Card = { id: uid(), type: "composite", title, children: picked as LeafCard[] };
  const firstIdx = cards.findIndex((c) => set.has(c.id));
  const rest = cards.filter((c) => !set.has(c.id));
  const insertAt = cards.slice(0, firstIdx).filter((c) => !set.has(c.id)).length;
  rest.splice(insertAt, 0, composite);
  return rest;
}

export function ungroup(cards: Card[], id: string): Card[] {
  const i = cards.findIndex((c) => c.id === id);
  const c = cards[i];
  if (!c || c.type !== "composite") throw new Error("Not a stitched component.");
  return [...cards.slice(0, i), ...c.children, ...cards.slice(i + 1)];
}

export function move<T>(list: T[], index: number, dir: -1 | 1): T[] {
  const j = index + dir;
  if (j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[index], next[j]] = [next[j], next[index]];
  return next;
}

/** Replace a card by id, searching inside composites too. */
export function replaceCard(cards: Card[], card: Card): Card[] {
  return cards.map((c) => {
    if (c.id === card.id) return card;
    if (c.type === "composite" && card.type !== "composite")
      return { ...c, children: c.children.map((ch) => (ch.id === card.id ? card : ch)) };
    return c;
  });
}
