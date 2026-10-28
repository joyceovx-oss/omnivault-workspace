import { db } from "./db";
import { persist } from "./status";
import {
  cloneCard,
  cloneSectionData,
  collectAttachmentIds,
  newCard,
  replaceCard,
  uid,
} from "./cards";
import type { Card, Category, Project, Section, SectionData, Template, ItemReference, Tag } from "./types";
import { createVault as createEncryptedVault, deleteCardSecret, saveCardSecret as saveEncryptedCardSecret } from "./vault";

const now = () => Date.now();

/* ---------- attachments ---------- */
export const MAX_FILE_BYTES = 50 * 1024 * 1024;

export function addAttachment(file: File | Blob, name: string) {
  if (file.size > MAX_FILE_BYTES) throw new Error("File is larger than 50 MB.");
  const id = uid();
  return persist(() =>
    db.attachments.add({ id, name, mime: file.type || "application/octet-stream", size: file.size, blob: file, createdAt: now() }),
  ).then(() => id);
}

export const initializeSecretsVault = (passphrase: string) => persist(() => createEncryptedVault(passphrase));
export const saveSecretForCard = (cardId: string, secret: string) => persist(() => saveEncryptedCardSecret(cardId, secret));

/** Copy attachment blobs so the clone owns independent records. */
async function copyAttachments(cards: Card[]): Promise<Record<string, string>> {
  const map: Record<string, string> = {};
  for (const id of new Set(collectAttachmentIds(cards))) {
    const a = await db.attachments.get(id);
    if (!a) continue;
    const nid = uid();
    await db.attachments.add({ ...a, id: nid, createdAt: now() });
    map[id] = nid;
  }
  return map;
}

async function cloneWithFiles(data: SectionData[], resetChecklist: boolean) {
  const map = await copyAttachments(data.flatMap((s) => s.cards));
  return data.map((s) => cloneSectionData(s, { resetChecklist, attachmentMap: map }));
}

/* ---------- projects ---------- */
async function nextOrder(table: "projects" | "sections", projectId?: string) {
  const rows =
    table === "projects"
      ? await db.projects.toArray()
      : await db.sections.where("projectId").equals(projectId!).toArray();
  return rows.reduce((m, r) => Math.max(m, r.order), -1) + 1;
}

export function createProject(name: string, category: Category, sections?: SectionData[]) {
  return persist(() =>
    db.transaction("rw", db.projects, db.sections, db.attachments, async () => {
      const p: Project = { id: uid(), name, category, order: await nextOrder("projects"), archived: false, createdAt: now(), updatedAt: now() };
      await db.projects.add(p);
      const data = sections?.length
        ? await cloneWithFiles(sections, true)
        : [{ title: "Overview", description: "", cards: [newCard("richtext")] }];
      const ids: string[] = [];
      for (const [i, s] of data.entries()) {
        const id = uid();
        ids.push(id);
        await db.sections.add({ id, projectId: p.id, order: i, ...s });
      }
      return { projectId: p.id, sectionId: ids[0]! };
    }),
  );
}

export const updateProject = (id: string, patch: Partial<Project>) =>
  persist(() => db.projects.update(id, { ...patch, updatedAt: now() }));

export const deleteProject = (id: string) =>
  persist(() =>
    db.transaction("rw", db.projects, db.sections, db.trash, async () => {
      const project = await db.projects.get(id);
      if (!project) throw new Error("Project not found");
      const sections = await db.sections.where("projectId").equals(id).toArray();
      await db.trash.add({ id: uid(), type: "project", project, sections, deletedAt: now() });
      await db.sections.where("projectId").equals(id).delete();
      await db.projects.delete(id);
    }),
  );

export async function duplicateProject(id: string) {
  const p = await db.projects.get(id);
  if (!p) throw new Error("Project not found");
  const secs = await db.sections.where("projectId").equals(id).sortBy("order");
  const res = await persist(() =>
    db.transaction("rw", db.projects, db.sections, db.attachments, async () => {
      const np: Project = { ...p, id: uid(), name: `${p.name} (copy)`, order: await nextOrder("projects"), createdAt: now(), updatedAt: now() };
      await db.projects.add(np);
      const data = await cloneWithFiles(secs, false);
      for (const [i, s] of data.entries()) await db.sections.add({ id: uid(), projectId: np.id, order: i, ...s });
      return np.id;
    }),
  );
  return res;
}

export async function reorder(table: "projects" | "sections", ids: string[]) {
  return persist(() =>
    db.transaction("rw", db[table], async () => {
      for (const [i, id] of ids.entries()) await db[table].update(id, { order: i });
    }),
  );
}

/* ---------- sections ---------- */
export async function createSection(projectId: string, data?: SectionData) {
  return persist(() =>
    db.transaction("rw", db.sections, db.attachments, async () => {
      const d = data ? (await cloneWithFiles([data], true))[0]! : { title: "Untitled section", description: "", cards: [] };
      const s: Section = { id: uid(), projectId, order: await nextOrder("sections", projectId), ...d };
      await db.sections.add(s);
      return s.id;
    }),
  );
}

export const updateSection = (id: string, patch: Partial<Section>) =>
  persist(() => db.sections.update(id, patch));

export const deleteSection = (id: string) => persist(() => db.transaction("rw", db.sections, db.trash, async () => {
  const section = await db.sections.get(id);
  if (!section) throw new Error("Section not found");
  await db.trash.add({ id: uid(), type: "section", section, deletedAt: now() });
  await db.sections.delete(id);
}));

export async function duplicateSection(id: string) {
  const s = await db.sections.get(id);
  if (!s) throw new Error("Section not found");
  const nid = await createSection(s.projectId, { ...s, title: `${s.title} (copy)` });
  // createSection resets checklists for templates; restore state for a plain duplicate.
  const map = await copyAttachments(s.cards);
  await updateSection(nid, { cards: s.cards.map((c) => cloneCard(c, { attachmentMap: map })) });
  return nid;
}

/** Read-modify-write inside a transaction so concurrent card edits don't clobber each other. */
export function mutateCards(sectionId: string, fn: (cards: Card[]) => Card[]) {
  return persist(() =>
    db.transaction("rw", db.sections, async () => {
      const s = await db.sections.get(sectionId);
      if (!s) throw new Error("Section not found");
      await db.sections.update(sectionId, { cards: fn(s.cards) });
    }),
  );
}

async function resolveCardTags(card: Card): Promise<Card> {
  if (card.type === "composite")
    return { ...card, children: await Promise.all(card.children.map((child) => resolveCardTags(child))) as typeof card.children };
  const names = new Map<string, string>();
  for (const name of (card.tags ?? []).map(normalizeTagName).filter(Boolean))
    if (!names.has(name.toLowerCase())) names.set(name.toLowerCase(), name);
  if (names.size) {
    const records: Tag[] = [];
    for (const [normalized, name] of names.entries()) {
      let tag = await db.tags.where("normalized").equals(normalized).first();
      if (!tag) {
        tag = { id: uid(), name, normalized, createdAt: now() };
        await db.tags.add(tag);
      }
      records.push(tag);
    }
    return { ...card, tags: records.map((tag) => tag.name), tagIds: records.map((tag) => tag.id) };
  }
  if (card.tagIds?.length) {
    const records = (await db.tags.bulkGet(card.tagIds)).filter((tag): tag is Tag => !!tag);
    return { ...card, tags: records.map((tag) => tag.name), tagIds: records.map((tag) => tag.id) };
  }
  return card;
}

export const updateCard = (sectionId: string, card: Card) => persist(() => db.transaction("rw", db.sections, db.tags, async () => {
  const section = await db.sections.get(sectionId);
  if (!section) throw new Error("Section not found");
  await db.sections.update(sectionId, { cards: replaceCard(section.cards, await resolveCardTags(card)) });
}));

export async function duplicateCard(sectionId: string, card: Card) {
  const map = await persist(() => copyAttachments([card]));
  const copy = cloneCard(card, { attachmentMap: map });
  await mutateCards(sectionId, (cards) => {
    const i = cards.findIndex((c) => c.id === card.id);
    const next = [...cards];
    next.splice(i + 1, 0, copy);
    return next;
  });
}

/* ---------- templates ---------- */
export async function saveCardTemplate(name: string, card: Card) {
  return persist(() =>
    db.transaction("rw", db.templates, db.attachments, async () => {
      const map = await copyAttachments([card]);
      const t: Template = { id: uid(), level: "card", name, createdAt: now(), card: cloneCard(card, { resetChecklist: true, attachmentMap: map }) };
      await db.templates.add(t);
    }),
  );
}

export async function saveSectionTemplate(name: string, s: SectionData) {
  return persist(() =>
    db.transaction("rw", db.templates, db.attachments, async () => {
      const section = (await cloneWithFiles([s], true))[0]!;
      await db.templates.add({ id: uid(), level: "section", name, createdAt: now(), section });
    }),
  );
}

export async function saveProjectTemplate(name: string, projectId: string) {
  const p = await db.projects.get(projectId);
  if (!p) throw new Error("Project not found");
  const secs = await db.sections.where("projectId").equals(projectId).sortBy("order");
  return persist(() =>
    db.transaction("rw", db.templates, db.attachments, async () => {
      const sections = await cloneWithFiles(secs, true);
      await db.templates.add({ id: uid(), level: "project", name, createdAt: now(), category: p.category, sections });
    }),
  );
}

export async function insertCardTemplate(sectionId: string, t: Extract<Template, { level: "card" }>) {
  const map = await persist(() => copyAttachments([t.card]));
  const card = cloneCard(t.card, { resetChecklist: true, attachmentMap: map });
  await mutateCards(sectionId, (cards) => [...cards, card]);
}

export const deleteTemplate = (id: string) => persist(() => db.templates.delete(id));

/* ---------- offline productivity ---------- */
export const saveCapture = (text: string, id: string = uid()) => persist(async () => {
  if (!text.trim()) throw new Error("Enter a note or link.");
  const existing = await db.inbox.get(id);
  await db.inbox.put({ id, text: text.trim(), createdAt: existing?.createdAt ?? now() });
  return id;
});
export const deleteCapture = (id: string) => persist(() => db.inbox.delete(id));
export const moveCapture = (id: string, sectionId: string) => persist(() => db.transaction("rw", db.inbox, db.sections, async () => {
  const item = await db.inbox.get(id), section = await db.sections.get(sectionId);
  if (!item || !section) throw new Error("Capture or destination no longer exists.");
  const card = newCard("richtext");
  if (card.type !== "richtext") throw new Error("Invalid capture type");
  card.title = "Captured note";
  card.doc = { type: "doc", content: item.text.split("\n").map((text) => ({ type: "paragraph", content: text ? [{ type: "text", text }] : [] })) };
  await db.sections.update(sectionId, { cards: [...section.cards, card] });
  await db.inbox.delete(id);
  return card.id;
}));
export const deleteCard = (sectionId: string, cardId: string) => persist(() => db.transaction("rw", db.sections, db.trash, async () => {
  const section = await db.sections.get(sectionId);
  const index = section?.cards.findIndex((c) => c.id === cardId) ?? -1;
  const card = section?.cards[index];
  if (!section || !card) throw new Error("Card not found");
  await db.trash.add({ id: uid(), type: "card", card, sectionId, projectId: section.projectId, index, deletedAt: now() });
  await db.sections.update(sectionId, { cards: section.cards.filter((c) => c.id !== cardId) });
}));
export const toggleFavorite = (type: ItemReference["type"], targetId: string) => persist(async () => {
  const id = `favorite:${type}:${targetId}`;
  if (await db.references.get(id)) await db.references.delete(id);
  else await db.references.put({ id, kind: "favorite", type, targetId, accessedAt: now() });
});
export const recordRecent = (type: ItemReference["type"], targetId: string) => persist(() => db.transaction("rw", db.references, async () => {
  const id = `recent:${type}:${targetId}`;
  const previous = await db.references.get(id);
  await db.references.put({ id, kind: "recent", type, targetId, accessedAt: Math.max(now(), (previous?.accessedAt ?? 0) + 1) });
  const recent = await db.references.where("kind").equals("recent").sortBy("accessedAt");
  if (recent.length > 30) await db.references.bulkDelete(recent.slice(0, recent.length - 30).map((item) => item.id));
}));
export const clearRecentHistory = () => persist(() => db.references.where("kind").equals("recent").delete());
export async function permanentlyDelete(id: string): Promise<void> {
  let secretIds: string[] = [];
  await persist(() => db.transaction("rw", db.trash, db.references, async () => {
    const item = await db.trash.get(id);
    if (!item) return;
    const cardIds = (cards: Card[]) => cards.flatMap((card) => card.type === "composite" ? [card.id, ...card.children.map((child) => child.id)] : [card.id]);
    const ids = item.type === "project" ? [item.project.id, ...item.sections.flatMap((section) => [section.id, ...cardIds(section.cards)])] : item.type === "section" ? [item.section.id, ...cardIds(item.section.cards)] : [item.card.id, ...(item.card.type === "composite" ? item.card.children.map((card) => card.id) : [])];
    secretIds = item.type === "project" ? item.sections.flatMap((section) => cardIds(section.cards)) : item.type === "section" ? cardIds(item.section.cards) : cardIds([item.card]);
    await db.references.where("targetId").anyOf(ids).delete();
    await db.trash.delete(id);
  }));
  await Promise.all(secretIds.map((secretId) => persist(() => deleteCardSecret(secretId))));
}
export const restoreTrash = (id: string) => persist(() => db.transaction("rw", db.projects, db.sections, db.trash, async () => {
  const item = await db.trash.get(id);
  if (!item) throw new Error("Trash item not found");
  async function parent(projectId: string) {
    const existing = await db.projects.get(projectId);
    if (existing) return existing.id;
    const recovered = (await db.projects.toArray()).find((p) => p.name === "Recovered items");
    if (recovered) return recovered.id;
    const pid = uid();
    await db.projects.add({ id: pid, name: "Recovered items", category: "general", order: await nextOrder("projects"), archived: false, createdAt: now(), updatedAt: now() });
    return pid;
  }
  if (item.type === "project") {
    if (await db.projects.get(item.project.id)) throw new Error("A project with this identifier already exists.");
    await db.projects.add(item.project);
    await db.sections.bulkAdd(item.sections);
  } else if (item.type === "section") {
    await db.sections.add({ ...item.section, projectId: await parent(item.section.projectId) });
  } else {
    let section = await db.sections.get(item.sectionId);
    if (!section) {
      const projectId = await parent(item.projectId);
      section = { id: uid(), projectId, title: "Recovered cards", description: "", order: await nextOrder("sections", projectId), cards: [] };
      await db.sections.add(section);
    }
    const cards = [...section.cards];
    cards.splice(Math.min(item.index, cards.length), 0, item.card);
    await db.sections.update(section.id, { cards });
  }
  await db.trash.delete(id);
}));

export function normalizeTagName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

export async function ensureTag(name: string): Promise<Tag> {
  const cleaned = normalizeTagName(name);
  if (!cleaned) throw new Error("Tag name cannot be empty.");
  const normalized = cleaned.toLowerCase();
  return persist(() => db.transaction("rw", db.tags, async () => {
    const existing = await db.tags.where("normalized").equals(normalized).first();
    if (existing) return existing;
    const tag: Tag = { id: uid(), name: cleaned, normalized, createdAt: now() };
    await db.tags.add(tag);
    return tag;
  }));
}

function mapCards(cards: Card[], update: (card: Card) => Card): Card[] {
  return cards.map((card) => {
    if (card.type !== "composite") return update(card);
    return update({ ...card, children: mapCards(card.children, update) } as Card) as Card;
  });
}

function renameCardTag(card: Card, tag: Tag, oldNormalized: string): Card {
  if (card.tagIds?.includes(tag.id))
    return { ...card, tags: [...(card.tags ?? []).filter((name) => normalizeTagName(name).toLowerCase() !== oldNormalized && normalizeTagName(name).toLowerCase() !== tag.normalized), tag.name] };
  return card;
}

function removeCardTag(card: Card, tagId: string, name: string): Card {
  return {
    ...card,
    tagIds: (card.tagIds ?? []).filter((id) => id !== tagId),
    tags: (card.tags ?? []).filter((tag) => normalizeTagName(tag).toLowerCase() !== normalizeTagName(name).toLowerCase()),
  };
}

export const renameTag = (id: string, name: string) => {
  const cleaned = normalizeTagName(name);
  if (!cleaned) throw new Error("Tag name cannot be empty.");
  const normalized = cleaned.toLowerCase();
  return persist(() => db.transaction("rw", db.tags, db.sections, db.templates, db.trash, async () => {
    const tag = await db.tags.get(id);
    if (!tag) throw new Error("Tag not found.");
    const duplicate = await db.tags.where("normalized").equals(normalized).first();
    if (duplicate && duplicate.id !== id) throw new Error("A tag with this name already exists.");
    const oldNormalized = tag.normalized;
    const renamed = { ...tag, name: cleaned, normalized };
    await db.tags.put(renamed);
    for (const section of await db.sections.toArray())
      await db.sections.put({ ...section, cards: mapCards(section.cards, (card) => renameCardTag(card, renamed, oldNormalized)) });
    for (const template of await db.templates.toArray()) {
      if (template.level === "card") await db.templates.put({ ...template, card: mapCards([template.card], (card) => renameCardTag(card, renamed, oldNormalized))[0]! });
      else if (template.level === "section") await db.templates.put({ ...template, section: { ...template.section, cards: mapCards(template.section.cards, (card) => renameCardTag(card, renamed, oldNormalized)) } });
      else await db.templates.put({ ...template, sections: template.sections.map((section) => ({ ...section, cards: mapCards(section.cards, (card) => renameCardTag(card, renamed, oldNormalized)) })) });
    }
    for (const item of await db.trash.toArray()) {
      if (item.type === "project") await db.trash.put({ ...item, sections: item.sections.map((s) => ({ ...s, cards: mapCards(s.cards, (card) => renameCardTag(card, renamed, oldNormalized)) })) });
      else if (item.type === "section") await db.trash.put({ ...item, section: { ...item.section, cards: mapCards(item.section.cards, (card) => renameCardTag(card, renamed, oldNormalized)) } });
      else await db.trash.put({ ...item, card: mapCards([item.card], (card) => renameCardTag(card, renamed, oldNormalized))[0]! });
    }
    return renamed;
  }));
};

export const deleteTag = (id: string) => persist(() => db.transaction("rw", db.tags, db.sections, db.templates, db.trash, async () => {
  const tag = await db.tags.get(id);
  if (!tag) return;
  for (const section of await db.sections.toArray())
    await db.sections.put({ ...section, cards: mapCards(section.cards, (card) => removeCardTag(card, id, tag.name)) });
  for (const template of await db.templates.toArray()) {
    if (template.level === "card") await db.templates.put({ ...template, card: mapCards([template.card], (card) => removeCardTag(card, id, tag.name))[0]! });
    else if (template.level === "section") await db.templates.put({ ...template, section: { ...template.section, cards: mapCards(template.section.cards, (card) => removeCardTag(card, id, tag.name)) } });
    else await db.templates.put({ ...template, sections: template.sections.map((section) => ({ ...section, cards: mapCards(section.cards, (card) => removeCardTag(card, id, tag.name)) })) });
  }
  for (const item of await db.trash.toArray()) {
    if (item.type === "project") await db.trash.put({ ...item, sections: item.sections.map((s) => ({ ...s, cards: mapCards(s.cards, (card) => removeCardTag(card, id, tag.name)) })) });
    else if (item.type === "section") await db.trash.put({ ...item, section: { ...item.section, cards: mapCards(item.section.cards, (card) => removeCardTag(card, id, tag.name)) } });
    else await db.trash.put({ ...item, card: mapCards([item.card], (card) => removeCardTag(card, id, tag.name))[0]! });
  }
  await db.tags.delete(id);
}));
