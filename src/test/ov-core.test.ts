import { describe, expect, it } from "vitest";
import { cloneCard, newCard, stitch, ungroup } from "@/lib/ov/cards";
import { safeUrl, sanitizeDoc, youtubeEmbed } from "@/lib/ov/url";
import { scrubCards, validateManifest } from "@/lib/ov/backup";
import type { Card, ChecklistCard, ChoiceCard, CompositeCard } from "@/lib/ov/types";

const checklist = (): ChecklistCard => ({ id: "c1", type: "checklist", title: "L", items: [{ id: "i1", text: "a", done: true }] });

describe("templates and cloning", () => {
  it("resets checklist completion when inserting from a template", () => {
    const c = cloneCard(checklist(), { resetChecklist: true }) as ChecklistCard;
    expect(c.items[0]!.done).toBe(false);
  });
  it("gives fresh ids and independent data", () => {
    const src = checklist();
    const c = cloneCard(src) as ChecklistCard;
    expect(c.id).not.toBe(src.id);
    expect(c.items[0]!.id).not.toBe("i1");
    c.items[0]!.text = "changed";
    expect(src.items[0]!.text).toBe("a");
  });
  it("keeps the chosen option when options get new ids", () => {
    const r = newCard("radio") as ChoiceCard;
    r.selected = r.options[1]!.id;
    const c = cloneCard(r) as ChoiceCard;
    expect(c.selected).toBe(c.options[1]!.id);
  });
  it("remaps attachments to copied records", () => {
    const img: Card = { id: "x", type: "image", title: "", attachmentId: "old", mode: "fit" };
    expect((cloneCard(img, { attachmentMap: { old: "new" } }) as { attachmentId: string }).attachmentId).toBe("new");
  });
});

describe("card stitch", () => {
  const cards = (): Card[] => [newCard("richtext"), checklist(), newCard("dropdown"), newCard("link")];
  it("preserves child types, content and order, and ungroup restores them", () => {
    const orig = cards();
    const stitched = stitch(orig, [orig[3]!.id, orig[1]!.id]);
    expect(stitched.map((c) => c.type)).toEqual(["richtext", "composite", "dropdown"]);
    const comp = stitched[1] as CompositeCard;
    expect(comp.children).toEqual([orig[1], orig[3]]);
    expect(ungroup(stitched, comp.id).map((c) => c.id)).toEqual([0, 1, 3, 2].map((i) => orig[i]!.id));
  });
  it("rejects fewer than two cards and nested composites", () => {
    const orig = cards();
    expect(() => stitch(orig, [orig[0]!.id])).toThrow();
    const s = stitch(orig, [orig[0]!.id, orig[1]!.id]);
    expect(() => stitch(s, [s[0]!.id, s[1]!.id])).toThrow(/nested/);
  });
});

describe("url safety", () => {
  it("rejects javascript: and data: links", () => {
    expect(safeUrl("javascript:alert(1)")).toBeNull();
    expect(safeUrl("data:text/html,x")).toBeNull();
    expect(safeUrl("example.com")).toBe("https://example.com/");
  });
  it("only embeds recognised YouTube links", () => {
    expect(youtubeEmbed("https://youtu.be/dQw4w9WgXcQ")).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(youtubeEmbed("https://evil.com/watch?v=dQw4w9WgXcQ")).toBeNull();
  });
  it("strips unsafe links from imported rich text", () => {
    const doc = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "x", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }] }] }] };
    const out = JSON.stringify(sanitizeDoc(doc));
    expect(out).not.toContain("javascript");
  });
});

describe("backup", () => {
  it("exports visible Secret-card metadata but excludes secret payload fields", () => {
    const leak = { id: "v", type: "vaultref", title: "S", collection: "Prod", identifier: "account", note: "safe note", secret: "hunter2" } as unknown as Card;
    const scrubbed = JSON.stringify(scrubCards([leak]));
    expect(scrubbed).not.toContain("hunter2");
    expect(scrubbed).toContain("account");
    expect(scrubbed).toContain("safe note");
  });
  it("rejects files that aren't OmniVault backups", () => {
    expect(() => validateManifest({ app: "other" })).toThrow();
    expect(() => validateManifest({ app: "omnivault", schemaVersion: 999, projects: [], sections: [], templates: [], attachments: [] })).toThrow(/newer/);
  });
});
