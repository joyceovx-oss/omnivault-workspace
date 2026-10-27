import JSZip from "jszip";
import { db } from "./db";
import { cloneCard, collectAttachmentIds, uid } from "./cards";
import { sanitizeDoc } from "./url";
import { SCHEMA_VERSION, type Card, type Project, type Section, type Template } from "./types";

export interface Manifest {
  app: "omnivault";
  schemaVersion: number;
  exportedAt: string;
  projects: Project[];
  sections: Section[];
  templates: Template[];
  attachments: { id: string; name: string; mime: string; size: number }[];
}

/** Vault refs never hold secrets, but scrub to a harmless placeholder anyway. */
export function scrubCards(cards: Card[]): Card[] {
  return cards.map((c) => {
    if (c.type === "composite") return { ...c, children: scrubCards(c.children) as typeof c.children };
    if (c.type === "vaultref") return { id: c.id, type: "vaultref", title: c.title, collection: c.collection };
    if (c.type === "richtext") return { ...c, doc: sanitizeDoc(c.doc) as typeof c.doc };
    return c;
  });
}

const templateCards = (t: Template): Card[] =>
  t.level === "card" ? [t.card] : t.level === "section" ? t.section.cards : t.sections.flatMap((s) => s.cards);

export async function exportBackup(): Promise<Blob> {
  const [projects, sections, templates] = await Promise.all([db.projects.toArray(), db.sections.toArray(), db.templates.toArray()]);
  const used = new Set([...sections.flatMap((s) => collectAttachmentIds(s.cards)), ...templates.flatMap((t) => collectAttachmentIds(templateCards(t)))]);
  const atts = (await db.attachments.bulkGet([...used])).filter((a): a is NonNullable<typeof a> => !!a);
  const zip = new JSZip();
  const manifest: Manifest = {
    app: "omnivault",
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    projects,
    sections: sections.map((s) => ({ ...s, cards: scrubCards(s.cards) })),
    templates: templates.map(scrubTemplate),
    attachments: atts.map(({ id, name, mime, size }) => ({ id, name, mime, size })),
  };
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));
  for (const a of atts) zip.file(`files/${a.id}`, a.blob);
  return zip.generateAsync({ type: "blob" });
}

function scrubTemplate(t: Template): Template {
  if (t.level === "card") return { ...t, card: scrubCards([t.card])[0] };
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
  const attMap: Record<string, string> = {};
  const blobs: { id: string; name: string; mime: string; size: number; blob: Blob }[] = [];
  for (const a of m.attachments) {
    const f = zip.file(`files/${a.id}`);
    if (!f) continue;
    const blob = new Blob([await f.async("arraybuffer")], { type: a.mime });
    const nid = uid();
    attMap[a.id] = nid;
    blobs.push({ id: nid, name: a.name, mime: a.mime, size: blob.size, blob });
  }
  const fix = (cards: Card[]) => scrubCards(cards.map((c) => cloneCard(c, { attachmentMap: attMap })));
  const base = (await db.projects.count()) || 0;
  await db.transaction("rw", db.projects, db.sections, db.templates, db.attachments, async () => {
    for (const b of blobs) await db.attachments.add({ ...b, createdAt: Date.now() });
    const pMap: Record<string, string> = {};
    for (const [i, p] of m.projects.entries()) {
      pMap[p.id] = uid();
      await db.projects.add({ ...p, id: pMap[p.id], order: base + i });
    }
    for (const s of m.sections) {
      if (!pMap[s.projectId]) continue;
      await db.sections.add({ ...s, id: uid(), projectId: pMap[s.projectId], cards: fix(s.cards) });
    }
    for (const t of m.templates) {
      const id = uid();
      if (t.level === "card") await db.templates.add({ ...t, id, card: fix([t.card])[0] });
      else if (t.level === "section") await db.templates.add({ ...t, id, section: { ...t.section, cards: fix(t.section.cards) } });
      else await db.templates.add({ ...t, id, sections: t.sections.map((s) => ({ ...s, cards: fix(s.cards) })) });
    }
  });
  return m.projects.length;
}
