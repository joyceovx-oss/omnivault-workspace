import "fake-indexeddb/auto";
import Dexie from "dexie";
import { webcrypto } from "node:crypto";
import JSZip from "jszip";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { exportBackup } from "@/lib/ov/backup";
import { db } from "@/lib/ov/db";
import { createProject, deleteCard, permanentlyDelete, updateSection } from "@/lib/ov/repo";
import { newCard } from "@/lib/ov/cards";
import {
  createVault,
  deleteCredential,
  hasVault,
  hasCardSecret,
  isVaultUnlocked,
  listCredentials,
  lockVault,
  saveCredential,
  saveCardSecret,
  readCardSecret,
  secretsDb,
  unlockVault,
} from "@/lib/ov/vault";

Object.defineProperty(globalThis, "crypto", { configurable: true, value: webcrypto });

const credential = {
  collection: "Production",
  name: "Database",
  username: "operator",
  secret: "private-value-7bf1",
  url: "https://example.test",
  notes: "rotates monthly",
  tags: ["database", "production"],
};

describe("local encrypted secrets vault", () => {
  beforeEach(async () => {
    lockVault();
    await Promise.all(db.tables.map((table) => table.clear()));
    await secretsDb.delete();
    await secretsDb.open();
  });

  afterEach(() => lockVault());

  it("requires a strong master password and creates a local vault", async () => {
    await expect(createVault("short")).rejects.toThrow(/at least 12/);
    await createVault("correct horse battery staple");
    expect(await hasVault()).toBe(true);
    expect(isVaultUnlocked()).toBe(true);
  });

  it("stores encrypted payloads and decrypts them only after a correct unlock", async () => {
    await createVault("correct horse battery staple");
    const saved = await saveCredential({ ...credential });
    const stored = await secretsDb.credentials.get(saved.id);
    expect(stored).toBeDefined();
    expect(JSON.stringify(stored)).not.toContain(credential.name);
    expect(JSON.stringify(stored)).not.toContain(credential.secret);

    lockVault();
    await expect(listCredentials()).rejects.toThrow(/Unlock the vault/);
    await unlockVault("correct horse battery staple");
    expect(await listCredentials()).toEqual([
      { ...credential, id: saved.id, createdAt: saved.createdAt, updatedAt: saved.updatedAt },
    ]);
  });

  it("rejects an incorrect password and stays locked", async () => {
    await createVault("correct horse battery staple");
    lockVault();
    await expect(unlockVault("incorrect password")).rejects.toThrow(
      /incorrect or the vault data is damaged/,
    );
    expect(isVaultUnlocked()).toBe(false);
  });

  it("fails closed when encrypted credential data is tampered with", async () => {
    await createVault("correct horse battery staple");
    const saved = await saveCredential({ ...credential });
    await secretsDb.credentials.update(saved.id, { iv: "AAAAAAAAAAAAAAAA" });
    await expect(listCredentials()).rejects.toThrow();
    expect(isVaultUnlocked()).toBe(false);
  });

  it("persists ciphertext across a database reopen and requires the password again", async () => {
    await createVault("correct horse battery staple");
    const saved = await saveCredential({ ...credential });
    lockVault();
    secretsDb.close();
    await secretsDb.open();
    expect(isVaultUnlocked()).toBe(false);
    await unlockVault("correct horse battery staple");
    expect((await listCredentials())[0]?.id).toBe(saved.id);
  });

  it("excludes vault data from ordinary workspace backups", async () => {
    await createVault("correct horse battery staple");
    await saveCredential({ ...credential });
    const backup = await exportBackup();
    const zip = await JSZip.loadAsync(backup);
    const manifest = await zip.file("manifest.json")!.async("string");
    expect(manifest).not.toContain(credential.secret);
    expect(manifest).not.toContain(credential.name);
  });

  it("deletes credentials only while unlocked", async () => {
    await createVault("correct horse battery staple");
    const saved = await saveCredential({ ...credential });
    lockVault();
    await expect(deleteCredential(saved.id)).rejects.toThrow(/Unlock the vault/);
    await unlockVault("correct horse battery staple");
    await deleteCredential(saved.id);
    expect(await listCredentials()).toEqual([]);
  });

  it("uses the shared key to encrypt card secrets independently and authenticates each record", async () => {
    await createVault("correct horse battery staple");
    const secret = "card-secret-value";
    await saveCardSecret("secret-card-1", secret);
    await saveCardSecret("secret-card-2", "another-value");
    expect(await hasCardSecret("secret-card-1")).toBe(true);
    const stored = await secretsDb.cardSecrets.get("secret-card-1");
    expect(stored).toBeDefined();
    expect(JSON.stringify(stored)).not.toContain(secret);
    expect(stored?.ciphertext).not.toBe(secret);

    lockVault();
    await expect(unlockVault("wrong password")).rejects.toThrow(/incorrect or the vault data is damaged/);
    await unlockVault("correct horse battery staple");
    expect(await readCardSecret("secret-card-1")).toBe(secret);
    expect(await readCardSecret("secret-card-2")).toBe("another-value");

    lockVault();
    await unlockVault("correct horse battery staple");
    await secretsDb.cardSecrets.update("secret-card-1", { ciphertext: "AAAAAAAAAAAAAAAA" });
    await expect(readCardSecret("secret-card-1")).rejects.toThrow(/failed authentication/);
    expect(isVaultUnlocked()).toBe(false);
  });

  it("adds the card-secret store without discarding existing vault records", async () => {
    lockVault();
    secretsDb.close();
    await secretsDb.delete();
    const legacy = new Dexie("omnivault-secrets");
    legacy.version(1).stores({ config: "id", credentials: "id, updatedAt" });
    await legacy.open();
    await legacy.table("credentials").put({ id: "legacy-entry", iv: "iv", ciphertext: "ciphertext", createdAt: 1, updatedAt: 1 });
    legacy.close();

    await secretsDb.open();
    expect(await secretsDb.credentials.get("legacy-entry")).toMatchObject({ ciphertext: "ciphertext" });
    expect(await secretsDb.cardSecrets.toArray()).toEqual([]);
  });

  it("keeps card secrets out of ordinary workspace records and backups", async () => {
    await createVault("correct horse battery staple");
    const project = await createProject("Private card", "general");
    const card = newCard("vaultref");
    if (card.type !== "vaultref") throw new Error("Expected a Secret card.");
    card.identifier = "visible account";
    card.note = "visible note";
    await updateSection(project.sectionId, { cards: [card] });
    await saveCardSecret(card.id, "not-in-workspace-or-backup");

    const storedCard = (await db.sections.get(project.sectionId))?.cards[0];
    expect(JSON.stringify(storedCard)).not.toContain("not-in-workspace-or-backup");
    const zip = await JSZip.loadAsync(await exportBackup());
    const manifest = await zip.file("manifest.json")!.async("string");
    expect(manifest).not.toContain("not-in-workspace-or-backup");
    expect(manifest).toContain("visible account");
    expect(manifest).toContain("visible note");
  });

  it("deletes encrypted card payloads only when their trashed cards are permanently removed", async () => {
    await createVault("correct horse battery staple");
    const project = await createProject("Trash secrets", "general");
    const card = newCard("vaultref");
    await updateSection(project.sectionId, { cards: [card] });
    await saveCardSecret(card.id, "trash-sensitive-secret");
    await deleteCard(project.sectionId, card.id);
    expect(await secretsDb.cardSecrets.get(card.id)).toBeDefined();
    const trashed = await db.trash.toCollection().first();
    if (!trashed) throw new Error("Missing trashed Secret card.");
    await permanentlyDelete(trashed.id);
    expect(await secretsDb.cardSecrets.get(card.id)).toBeUndefined();
  });
});
