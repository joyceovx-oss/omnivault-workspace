import "fake-indexeddb/auto";
import { webcrypto } from "node:crypto";
import JSZip from "jszip";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { exportBackup } from "@/lib/ov/backup";
import {
  createVault,
  deleteCredential,
  hasVault,
  isVaultUnlocked,
  listCredentials,
  lockVault,
  saveCredential,
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
});
