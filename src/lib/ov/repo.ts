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
import type { Card, Category, Project, Section, SectionData, Template, ItemReference } from "./types";

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

export const updateCard = (sectionId: string, card: Card) =>
  mutateCards(sectionId, (cards) => replaceCard(cards, card));

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
export const saveCapture = (text: string, id = uid()) => persist(async () => {
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
export const recordRecent = (type: ItemReference["type"], targetId: string) => persist(() => db.references.put({ id: `recent:${type}:${targetId}`, kind: "recent", type, targetId, accessedAt: now() }));
export const permanentlyDelete = (id: string) => persist(() => db.transaction("rw", db.trash, db.references, async () => {
  const item = await db.trash.get(id);
  if (!item) return;
  const ids = item.type === "project" ? [item.project.id, ...item.sections.flatMap((s) => [s.id, ...s.cards.flatMap((c) => c.type === "composite" ? [c.id, ...c.children.map((ch) => ch.id)] : [c.id])])] : item.type === "section" ? [item.section.id, ...item.section.cards.flatMap((c) => c.type === "composite" ? [c.id, ...c.children.map((ch) => ch.id)] : [c.id])] : [item.card.id, ...(item.card.type === "composite" ? item.card.children.map((c) => c.id) : [])];
  await db.references.where("targetId").anyOf(ids).delete();
  await db.trash.delete(id);
}));
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
