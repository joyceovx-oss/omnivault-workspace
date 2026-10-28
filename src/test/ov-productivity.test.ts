import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/ov/db";
import { createProject, deleteProject, deleteSection, deleteCard, restoreTrash, permanentlyDelete, saveCapture, moveCapture, toggleFavorite, recordRecent, updateSection, addAttachment } from "@/lib/ov/repo";
import { searchIndex, filterSearch, resolveReferences } from "@/lib/ov/search";
import { newCard } from "@/lib/ov/cards";

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
});