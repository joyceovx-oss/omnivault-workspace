import JSZip from "jszip";
import { db } from "./db";
import { cloneCard, collectAttachmentIds, uid } from "./cards";
import { sanitizeDoc } from "./url";
import { SCHEMA_VERSION, type Card, type Project, type Section, type Template, type InboxItem, type ItemReference, type TrashItem, type Tag } from "./types";
import { persist } from "./status";

export interface Manifest {
  app: "omnivault";
  schemaVersion: number;
  exportedAt: string;
  projects: Project[];
  sections: Section[];
  templates: Template[];
  inbox?: InboxItem[];
  references?: ItemReference[];
  trash?: TrashItem[];
  tags?: Tag[];
  attachments: { id: string; name: string; mime: string; size: number }[];
}

/** Vault refs never hold secrets, but scrub to a harmless placeholder anyway. */
export function scrubCards(cards: Card[]): Card[] {
  return cards.map((c) => {
    if (c.type === "composite") return { ...c, children: scrubCards(c.children) as typeof c.children };
    if (c.type === "vaultref") return {
      id: c.id, type: "vaultref", title: c.title, collection: c.collection,
      identifier: c.identifier ?? "", note: c.note ?? "",
      ...(c.tags ? { tags: c.tags } : {}), ...(c.tagIds ? { tagIds: c.tagIds } : {}),
    };
    if (c.type === "richtext") return { ...c, doc: sanitizeDoc(c.doc) as typeof c.doc };
    return c;
  });
}

const templateCards = (t: Template): Card[] =>
  t.level === "card" ? [t.card] : t.level === "section" ? t.section.cards : t.sections.flatMap((s) => s.cards);

export async function exportBackup(): Promise<Blob> {
  const [projects, sections, templates, inbox, references, trash, tags] = await Promise.all([db.projects.toArray(), db.sections.toArray(), db.templates.toArray(), db.inbox.toArray(), db.references.toArray(), db.trash.toArray(), db.tags.toArray()]);
  const trashCards = (t: TrashItem) => t.type === "project" ? t.sections.flatMap((s) => s.cards) : t.type === "section" ? t.section.cards : [t.card];
  const used = new Set([...sections.flatMap((s) => collectAttachmentIds(s.cards)), ...templates.flatMap((t) => collectAttachmentIds(templateCards(t))), ...trash.flatMap((t) => collectAttachmentIds(trashCards(t)))]);
  const atts = (await db.attachments.bulkGet([...used])).filter((a): a is NonNullable<typeof a> => !!a);
  const zip = new JSZip();
  const manifest: Manifest = {
    app: "omnivault",
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    projects,
    sections: sections.map((s) => ({ ...s, cards: scrubCards(s.cards) })),
    templates: templates.map(scrubTemplate),
    inbox, references, tags,
    trash: trash.map((t) => t.type === "project" ? { ...t, sections: t.sections.map((s) => ({ ...s, cards: scrubCards(s.cards) })) } : t.type === "section" ? { ...t, section: { ...t.section, cards: scrubCards(t.section.cards) } } : { ...t, card: scrubCards([t.card])[0] ?? t.card }),
    attachments: atts.map(({ id, name, mime, size }) => ({ id, name, mime, size })),
  };
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));
  for (const a of atts) zip.file(`files/${a.id}`, a.blob);
  return zip.generateAsync({ type: "blob" });
}

function scrubTemplate(t: Template): Template {
  if (t.level === "card") return { ...t, card: scrubCards([t.card])[0]! };
  if (t.level === "section") return { ...t, section: { ...t.section, cards: scrubCards(t.section.cards) } };
  return { ...t, sections: t.sections.map((s) => ({ ...s, cards: scrubCards(s.cards) })) };
}

export function validateManifest(m: unknown): Manifest {
  const x = m as Manifest;
  if (!x || x.app !== "omnivault") throw new Error("This isn't an OmniVault backup.");
  if (typeof x.schemaVersion !== "number" || x.schemaVersion > SCHEMA_VERSION)
    throw new Error("This backup was made by a newer version of OmniVault.");
  for (const k of ["projects", "sections", "templates", "attachments"] as const)
    if (!Array.isArray(x[k])) throw new Error(`Backup is missing "${k}".`);
  for (const s of x.sections) if (typeof s.id !== "string" || !Array.isArray(s.cards)) throw new Error("A section in the backup is malformed.");
  for (const k of ["inbox", "references", "trash"] as const) if (x[k] !== undefined && !Array.isArray(x[k])) throw new Error(`Backup has invalid "${k}".`);
  if (x.tags !== undefined && !Array.isArray(x.tags)) throw new Error('Backup has invalid "tags".');
  for (const tag of x.tags ?? [])
    if (!tag || typeof tag.id !== "string" || typeof tag.name !== "string") throw new Error("A tag in the backup is malformed.");
  for (const i of x.inbox ?? []) if (typeof i.text !== "string" || typeof i.id !== "string") throw new Error("Invalid Inbox item.");
  for (const t of x.trash ?? []) if (!["project", "section", "card"].includes(t.type) || typeof t.id !== "string") throw new Error("Invalid Trash item.");
  return x;
}

/** Imports alongside existing data with fresh ids for everything. Returns number of projects. */
export async function importBackup(file: Blob): Promise<number> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch {
    throw new Error("The file isn't a valid ZIP archive.");
  }
  const mf = zip.file("manifest.json");
  if (!mf) throw new Error("Backup has no manifest.json.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(await mf.async("string"));
  } catch {
    throw new Error("manifest.json is not valid JSON.");
  }
  const m = validateManifest(parsed);
  const sourceCards: Card[] = [
    ...m.sections.flatMap((section) => section.cards),
    ...m.templates.flatMap((template) => template.level === "card" ? [template.card] : template.level === "section" ? template.section.cards : template.sections.flatMap((section) => section.cards)),
    ...(m.trash ?? []).flatMap((item) => item.type === "project" ? item.sections.flatMap((section) => section.cards) : item.type === "section" ? item.section.cards : [item.card]),
  ];
  const tagLabels = new Set<string>();
  const collectTags = (cards: Card[]) => cards.forEach((card) => {
    (card.tags ?? []).forEach((name) => { if (name.trim()) tagLabels.add(name.trim().replace(/\s+/g, " ")); });
    if (card.type === "composite") collectTags(card.children);
  });
  collectTags(sourceCards);
  const existingTags = await db.tags.toArray();
  const tagsByName = new Map(existingTags.map((tag) => [tag.normalized, tag]));
  const tagsById = new Map(existingTags.map((tag) => [tag.id, tag]));
  const tagIdMap: Record<string, string> = {};
  const tagsToAdd: Tag[] = [];
  for (const tag of m.tags ?? []) {
    const name = tag.name.trim().replace(/\s+/g, " ");
    const normalized = name.toLowerCase();
    if (!name) continue;
    let target = tagsByName.get(normalized);
    if (!target) {
      target = { id: uid(), name, normalized, createdAt: Date.now() };
      tagsByName.set(normalized, target);
      tagsById.set(target.id, target);
      tagsToAdd.push(target);
    }
    tagIdMap[tag.id] = target.id;
  }
  for (const name of tagLabels) {
    const normalized = name.toLowerCase();
    if (tagsByName.has(normalized)) continue;
    const tag: Tag = { id: uid(), name, normalized, createdAt: Date.now() };
    tagsByName.set(normalized, tag);
    tagsById.set(tag.id, tag);
    tagsToAdd.push(tag);
  }
  for (const oldTag of m.tags ?? []) {
    const normalized = oldTag.name.trim().replace(/\s+/g, " ").toLowerCase();
    const tag = tagsByName.get(normalized);
    if (tag) tagIdMap[oldTag.id] = tag.id;
  }
  const attMap: Record<string, string> = {};
  const blobs: { id: string; name: string; mime: string; size: number; blob: Blob }[] = [];
  for (const a of m.attachments) {
    const f = zip.file(`files/${a.id}`);
    if (!f) throw new Error(`Backup is missing attachment: ${a.name}`);
    const blob = new Blob([await f.async("arraybuffer")], { type: a.mime });
    const nid = uid();
    attMap[a.id] = nid;
    blobs.push({ id: nid, name: a.name, mime: a.mime, size: blob.size, blob });
  }
  const idMap: Record<string, string> = {};
  const mappedId = (id: string): string => idMap[id] ?? (idMap[id] = uid());
  const fix = (cards: Card[]) => scrubCards(cards.map((c) => {
    const next = cloneCard(c, { attachmentMap: attMap });
    const setCardData = (oldCard: Card, newCard: Card) => {
      newCard.id = mappedId(oldCard.id);
      const ids = [...new Set([...(oldCard.tagIds ?? []).map((id) => tagIdMap[id]).filter((id): id is string => !!id), ...(oldCard.tags ?? []).map((name) => tagsByName.get(name.trim().replace(/\s+/g, " ").toLowerCase())?.id).filter((id): id is string => !!id)])];
      newCard.tagIds = ids;
      newCard.tags = ids.map((id) => tagsById.get(id)?.name).filter((name): name is string => !!name);
      if (oldCard.type === "composite" && newCard.type === "composite")
        oldCard.children.forEach((child, index) => { const cloned = newCard.children[index]; if (cloned) setCardData(child, cloned); });
    };
    setCardData(c, next);
    return next;
  }));
  const base = (await db.projects.count()) || 0;
  await persist(() => db.transaction("rw", [db.projects, db.sections, db.templates, db.attachments, db.inbox, db.references, db.trash, db.tags], async () => {
    if (tagsToAdd.length) await db.tags.bulkAdd(tagsToAdd);
    for (const b of blobs) await db.attachments.add({ ...b, createdAt: Date.now() });
    const pMap: Record<string, string> = {};
    for (const [i, p] of m.projects.entries()) {
      const npid = mappedId(p.id);
      pMap[p.id] = npid;
      await db.projects.add({ ...p, id: npid, order: base + i });
    }
    for (const s of m.sections) {
      const pid = pMap[s.projectId];
      if (!pid) continue;
      await db.sections.add({ ...s, id: mappedId(s.id), projectId: pid, cards: fix(s.cards) });
    }
    for (const t of m.templates) {
      const id = uid();
      if (t.level === "card") await db.templates.add({ ...t, id, card: fix([t.card])[0]! });
      else if (t.level === "section") await db.templates.add({ ...t, id, section: { ...t.section, cards: fix(t.section.cards) } });
      else await db.templates.add({ ...t, id, sections: t.sections.map((s) => ({ ...s, cards: fix(s.cards) })) });
    }
    for (const i of m.inbox ?? []) await db.inbox.add({ ...i, id: uid() });
    for (const t of m.trash ?? []) {
      const section = (s: Section) => ({ ...s, id: mappedId(s.id), projectId: mappedId(s.projectId), cards: fix(s.cards) });
      if (t.type === "project") await db.trash.add({ ...t, id: uid(), project: { ...t.project, id: mappedId(t.project.id) }, sections: t.sections.map(section) });
      else if (t.type === "section") await db.trash.add({ ...t, id: uid(), section: section(t.section) });
      else { const card = fix([t.card])[0]; if (card) await db.trash.add({ ...t, id: uid(), card, sectionId: mappedId(t.sectionId), projectId: mappedId(t.projectId) }); }
    }
    for (const r of m.references ?? []) {
      const targetId = idMap[r.targetId];
      if (targetId && ["favorite", "recent"].includes(r.kind) && ["project", "section", "card"].includes(r.type)) await db.references.put({ ...r, targetId, id: `${r.kind}:${r.type}:${targetId}` });
    }
    const recent = await db.references.where("kind").equals("recent").sortBy("accessedAt");
    if (recent.length > 30) await db.references.bulkDelete(recent.slice(0, recent.length - 30).map((item) => item.id));
  }));
  return m.projects.length;
}
