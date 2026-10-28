import "fake-indexeddb/auto";
import Dexie from "dexie";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/ov/db";
import { createProject, deleteProject, deleteSection, deleteCard, restoreTrash, permanentlyDelete, saveCapture, moveCapture, toggleFavorite, recordRecent, updateSection, addAttachment, clearRecentHistory, duplicateCard, ensureTag, renameTag, deleteTag, saveCardTemplate } from "@/lib/ov/repo";
import { searchIndex, filterSearch, resolveReferences } from "@/lib/ov/search";
import { newCard } from "@/lib/ov/cards";
import { exportBackup, importBackup } from "@/lib/ov/backup";

beforeEach(async () => { await Promise.all(db.tables.map((table) => table.clear())); });
describe("offline productivity", () => {
  it("finds card body text and exposes its project, section and card destination", async () => {
    const p = await createProject("Research", "research");
    const c = newCard("checklist");
    if (c.type !== "checklist") throw new Error("Wrong type");
    c.items = [{ id: "item", text: "Review telescope findings", done: true }]; c.tags = ["science"];
    await updateSection(p.sectionId, { cards: [c] });
    const rows = searchIndex(await db.projects.toArray(), await db.sections.toArray(), []);
    expect(filterSearch(rows, "telescope", p.projectId, "checklist", "science").map((r) => [r.projectId, r.sectionId, r.cardId])).toEqual([[p.projectId, p.sectionId, c.id]]);
    expect(filterSearch(rows, "telescope", "all", "all", "other")).toHaveLength(0);
  });
  it("restores projects with their sections, card states and attachments", async () => {
    const p = await createProject("Keep", "general");
    const attachmentId = await addAttachment(new Blob(["bytes"]), "sample.txt");
    const c = newCard("file"); if (c.type !== "file") throw new Error("Wrong type"); c.attachmentId = attachmentId;
    await updateSection(p.sectionId, { cards: [c] });
    await deleteProject(p.projectId);
    expect(await db.projects.count()).toBe(0); expect(await db.attachments.get(attachmentId)).toBeDefined();
    const item = await db.trash.toCollection().first(); if (!item) throw new Error("Missing trash");
    await restoreTrash(item.id);
    expect((await db.sections.get(p.sectionId))?.cards).toEqual([c]); expect(await db.trash.count()).toBe(0);
  });
  it("restores a trashed section when its project has disappeared", async () => {
    const p = await createProject("Parent", "general"); await deleteSection(p.sectionId); await deleteProject(p.projectId);
    const item = (await db.trash.toArray()).find((t) => t.type === "section"); if (!item) throw new Error("Missing trash");
    await restoreTrash(item.id);
    const section = await db.sections.get(p.sectionId); expect(section).toBeDefined();
    expect((await db.projects.get(section?.projectId ?? ""))?.name).toBe("Recovered items");
  });
  it("restores cards in position and removes permanently deleted stable references", async () => {
    const p = await createProject("Cards", "general"); const a = newCard("checklist"), b = newCard("link");
    await updateSection(p.sectionId, { cards: [a, b] }); await toggleFavorite("card", a.id);
    await deleteCard(p.sectionId, a.id); let item = await db.trash.toCollection().first(); if (!item) throw new Error("Missing trash");
    await restoreTrash(item.id); expect((await db.sections.get(p.sectionId))?.cards.map((c) => c.id)).toEqual([a.id, b.id]);
    await deleteCard(p.sectionId, a.id); item = await db.trash.toCollection().first(); if (!item) throw new Error("Missing trash");
    await permanentlyDelete(item.id); expect(await db.references.count()).toBe(0); expect(await db.trash.count()).toBe(0);
  });
  it("moves captures atomically without losing multiline text or links", async () => {
    const id = await saveCapture("Idea\nhttps://example.com"); const p = await createProject("Destination", "general");
    await expect(moveCapture(id, "missing")).rejects.toThrow(); expect(await db.inbox.get(id)).toBeDefined();
    const cardId = await moveCapture(id, p.sectionId); expect(await db.inbox.get(id)).toBeUndefined();
    const rows = searchIndex(await db.projects.toArray(), await db.sections.toArray(), []);
    expect(rows.find((r) => r.cardId === cardId)?.text).toContain("https://example.com");
  });
  it("favorites toggle without copies; recents deduplicate and resolve current names", async () => {
    const p = await createProject("Original", "general"); await toggleFavorite("section", p.sectionId); await recordRecent("section", p.sectionId); await recordRecent("section", p.sectionId);
    expect(await db.references.count()).toBe(2); await updateSection(p.sectionId, { title: "Renamed" });
    const rows = searchIndex(await db.projects.toArray(), await db.sections.toArray(), []);
    expect(resolveReferences(await db.references.toArray(), rows).map((r) => r.row.title)).toEqual(["Renamed", "Renamed"]);
    await toggleFavorite("section", p.sectionId); expect(await db.references.count()).toBe(1);
    await deleteSection(p.sectionId); expect(resolveReferences(await db.references.toArray(), searchIndex(await db.projects.toArray(), await db.sections.toArray(), []))).toHaveLength(0);
  });
  it("keeps Inbox and Trash through database close and reopen", async () => {
    await saveCapture("Persisted"); const p = await createProject("Saved", "general"); await deleteProject(p.projectId);
    db.close(); await db.open(); expect(await db.inbox.count()).toBe(1); expect(await db.trash.count()).toBe(1);
  });
  it("normalizes tag names, preserves stable assignments through duplication and rename, and removes only the tag on delete", async () => {
    const p = await createProject("Tagged", "general");
    const first = await ensureTag("  Release   Notes ");
    const same = await ensureTag("release notes");
    expect(same.id).toBe(first.id);
    const card = newCard("richtext");
    card.tags = [first.name];
    card.tagIds = [first.id];
    await updateSection(p.sectionId, { cards: [card] });
    db.close(); await db.open();
    expect((await db.sections.get(p.sectionId))?.cards[0]?.tagIds).toEqual([first.id]);
    await duplicateCard(p.sectionId, card);
    expect((await db.sections.get(p.sectionId))?.cards.map((item) => item.tagIds)).toEqual([[first.id], [first.id]]);

    await renameTag(first.id, "Ship Notes");
    const cards = (await db.sections.get(p.sectionId))?.cards ?? [];
    expect(cards.map((item) => item.tags)).toEqual([["Ship Notes"], ["Ship Notes"]]);
    expect(cards.map((item) => item.tagIds)).toEqual([[first.id], [first.id]]);
    const rows = searchIndex(await db.projects.toArray(), await db.sections.toArray(), []);
    expect(filterSearch(rows, "ship notes").filter((row) => row.cardId)).toHaveLength(2);
    await deleteCard(p.sectionId, cards[0]!.id);
    const trashed = await db.trash.toCollection().first();
    expect(trashed?.type).toBe("card");
    if (trashed) await restoreTrash(trashed.id);
    expect((await db.sections.get(p.sectionId))?.cards[0]?.tagIds).toEqual([first.id]);
    await deleteTag(first.id);
    expect((await db.sections.get(p.sectionId))?.cards).toHaveLength(2);
    expect((await db.sections.get(p.sectionId))?.cards.every((item) => !item.tagIds?.length)).toBe(true);
  });
  it("exports and imports tag definitions and card relationships", async () => {
    const p = await createProject("Backup tags", "general");
    const tag = await ensureTag("important");
    const card = newCard("checklist");
    card.tags = [tag.name]; card.tagIds = [tag.id];
    await updateSection(p.sectionId, { cards: [card] });
    await saveCardTemplate("Tagged template", card);
    const backup = await exportBackup();
    await importBackup(backup);
    const sections = await db.sections.toArray();
    const imported = sections.flatMap((section) => section.cards).find((candidate) => candidate.id !== card.id);
    expect(imported?.tags).toEqual(["important"]);
    expect(imported?.tagIds).toEqual([tag.id]);
    const importedTemplate = (await db.templates.toArray()).find((template) => template.level === "card" && template.name === "Tagged template");
    expect(importedTemplate?.level === "card" && importedTemplate.card.tagIds).toEqual([tag.id]);
    expect(await db.tags.where("normalized").equals("important").count()).toBe(1);
  });
  it("caps recent history and clears it persistently", async () => {
    for (let index = 0; index < 35; index++) await recordRecent("project", `project-${index}`);
    expect(await db.references.where("kind").equals("recent").count()).toBe(30);
    db.close(); await db.open();
    expect(await db.references.where("kind").equals("recent").count()).toBe(30);
    await clearRecentHistory();
    expect(await db.references.where("kind").equals("recent").count()).toBe(0);
  });
  it("migrates legacy card tag names into stable tag records without losing the cards", async () => {
    db.close();
    await db.delete();
    const legacy = new Dexie("omnivault");
    legacy.version(1).stores({ projects: "id, order", sections: "id, projectId, order", attachments: "id", templates: "id, level" });
    legacy.version(2).stores({
      projects: "id, order", sections: "id, projectId, order", attachments: "id", templates: "id, level",
      inbox: "id, createdAt", references: "id, kind, targetId, accessedAt", trash: "id, deletedAt",
    });
    await legacy.open();
    await legacy.table("projects").put({ id: "legacy-project", name: "Legacy", category: "general", order: 0, archived: false, createdAt: 1, updatedAt: 1 });
    await legacy.table("sections").put({
      id: "legacy-section", projectId: "legacy-project", title: "Existing", description: "", order: 0,
      cards: [{ id: "legacy-card", type: "richtext", title: "Tagged", tags: [" Blue   Label "], doc: { type: "doc", content: [] } }],
    });
    legacy.close();

    await db.open();
    const migrated = await db.sections.get("legacy-section");
    const tag = await db.tags.where("normalized").equals("blue label").first();
    expect(migrated?.cards[0]?.id).toBe("legacy-card");
    expect(migrated?.cards[0]?.tagIds).toEqual([tag?.id]);
    expect(tag?.name).toBe("Blue Label");
  });
});