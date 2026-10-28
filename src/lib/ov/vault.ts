import Dexie, { type Table } from "dexie";

const VAULT_VERSION = 1;
const KDF_ITERATIONS = 600_000;
const MIN_PASSPHRASE_LENGTH = 12;
const KEY_WRAP_AAD = new TextEncoder().encode("omnivault-vault-key-v1");
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export interface VaultCredential {
  id: string;
  collection: string;
  name: string;
  username: string;
  secret: string;
  url: string;
  notes: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

interface VaultConfig {
  id: "config";
  version: 1;
  kdf: "PBKDF2-HMAC-SHA-256";
  iterations: number;
  salt: string;
  wrapIv: string;
  wrappedKey: string;
  createdAt: number;
}

interface EncryptedCredential {
  id: string;
  iv: string;
  ciphertext: string;
  createdAt: number;
  updatedAt: number;
}

interface EncryptedCardSecret {
  id: string;
  version: 1;
  iv: string;
  ciphertext: string;
  updatedAt: number;
}

class SecretsDatabase extends Dexie {
  config!: Table<VaultConfig, string>;
  credentials!: Table<EncryptedCredential, string>;
  cardSecrets!: Table<EncryptedCardSecret, string>;

  constructor() {
    super("omnivault-secrets");
    this.version(1).stores({ config: "id", credentials: "id, updatedAt" });
    this.version(2).stores({ config: "id", credentials: "id, updatedAt", cardSecrets: "id, updatedAt" });
  }
}

export const secretsDb = new SecretsDatabase();
let unlockedKey: CryptoKey | null = null;

const cryptoApi = () => {
  if (!globalThis.crypto?.subtle)
    throw new Error("Secure cryptography is unavailable in this environment.");
  return globalThis.crypto;
};

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function deriveWrappingKey(passphrase: string, salt: Uint8Array<ArrayBuffer>) {
  const crypto = cryptoApi();
  const material = await crypto.subtle.importKey(
    "raw",
    encoder.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: KDF_ITERATIONS, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

function randomBytes(length: number) {
  return cryptoApi().getRandomValues(new Uint8Array(length));
}

export async function hasVault(): Promise<boolean> {
  return !!(await secretsDb.config.get("config"));
}

export function isVaultUnlocked(): boolean {
  return unlockedKey !== null;
}

export function lockVault(): void {
  unlockedKey = null;
}

export async function createVault(passphrase: string): Promise<void> {
  if (passphrase.length < MIN_PASSPHRASE_LENGTH) {
    throw new Error(`Use a master password with at least ${MIN_PASSPHRASE_LENGTH} characters.`);
  }
  if (await hasVault()) throw new Error("A vault already exists on this device.");

  const crypto = cryptoApi();
  const salt = randomBytes(16);
  const wrapIv = randomBytes(12);
  const rawDataKey = randomBytes(32);
  try {
    const wrappingKey = await deriveWrappingKey(passphrase, salt);
    const wrappedKey = new Uint8Array(
      await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: wrapIv, additionalData: KEY_WRAP_AAD },
        wrappingKey,
        rawDataKey,
      ),
    );
    const dataKey = await crypto.subtle.importKey("raw", rawDataKey, { name: "AES-GCM" }, false, [
      "encrypt",
      "decrypt",
    ]);
    await secretsDb.config.add({
      id: "config",
      version: VAULT_VERSION,
      kdf: "PBKDF2-HMAC-SHA-256",
      iterations: KDF_ITERATIONS,
      salt: toBase64(salt),
      wrapIv: toBase64(wrapIv),
      wrappedKey: toBase64(wrappedKey),
      createdAt: Date.now(),
    });
    unlockedKey = dataKey;
  } finally {
    rawDataKey.fill(0);
  }
}

export async function unlockVault(passphrase: string): Promise<void> {
  const config = await secretsDb.config.get("config");
  if (
    !config ||
    config.version !== VAULT_VERSION ||
    config.kdf !== "PBKDF2-HMAC-SHA-256" ||
    config.iterations !== KDF_ITERATIONS
  ) {
    throw new Error("The local vault configuration is missing or unsupported.");
  }

  try {
    const crypto = cryptoApi();
    const wrappingKey = await deriveWrappingKey(passphrase, fromBase64(config.salt));
    const rawDataKey = new Uint8Array(
      await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: fromBase64(config.wrapIv), additionalData: KEY_WRAP_AAD },
        wrappingKey,
        fromBase64(config.wrappedKey),
      ),
    );
    try {
      unlockedKey = await crypto.subtle.importKey("raw", rawDataKey, { name: "AES-GCM" }, false, [
        "encrypt",
        "decrypt",
      ]);
    } finally {
      rawDataKey.fill(0);
    }
  } catch {
    lockVault();
    throw new Error("The master password is incorrect or the vault data is damaged.");
  }
}

function requireKey(): CryptoKey {
  if (!unlockedKey) throw new Error("Unlock the vault before accessing credentials.");
  return unlockedKey;
}

export async function listCredentials(): Promise<VaultCredential[]> {
  const key = requireKey();
  const crypto = cryptoApi();
  const rows = await secretsDb.credentials.toArray();
  try {
    return await Promise.all(
      rows.map(async (row) => {
        const plaintext = new Uint8Array(
          await crypto.subtle.decrypt(
            {
              name: "AES-GCM",
              iv: fromBase64(row.iv),
              additionalData: encoder.encode(`${row.id}:v${VAULT_VERSION}`),
            },
            key,
            fromBase64(row.ciphertext),
          ),
        );
        try {
          const payload = JSON.parse(decoder.decode(plaintext)) as Omit<
            VaultCredential,
            "id" | "createdAt" | "updatedAt"
          >;
          return { ...payload, id: row.id, createdAt: row.createdAt, updatedAt: row.updatedAt };
        } finally {
          plaintext.fill(0);
        }
      }),
    );
  } catch {
    lockVault();
    throw new Error("A credential failed authentication and could not be decrypted.");
  }
}

export async function saveCredential(
  input: Omit<VaultCredential, "id" | "createdAt" | "updatedAt"> & { id?: string },
): Promise<VaultCredential> {
  const key = requireKey();
  if (!input.name.trim() || !input.secret) throw new Error("Name and secret are required.");
  const now = Date.now();
  const id = input.id ?? cryptoApi().randomUUID();
  const existing = await secretsDb.credentials.get(id);
  const payload = {
    collection: input.collection.trim() || "General",
    name: input.name.trim(),
    username: input.username,
    secret: input.secret,
    url: input.url,
    notes: input.notes,
    tags: input.tags,
  };
  const plaintext = encoder.encode(JSON.stringify(payload));
  try {
    const iv = randomBytes(12);
    const ciphertext = new Uint8Array(
      await cryptoApi().subtle.encrypt(
        { name: "AES-GCM", iv, additionalData: encoder.encode(`${id}:v${VAULT_VERSION}`) },
        key,
        plaintext,
      ),
    );
    const row: EncryptedCredential = {
      id,
      iv: toBase64(iv),
      ciphertext: toBase64(ciphertext),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await secretsDb.credentials.put(row);
    return { ...payload, id, createdAt: row.createdAt, updatedAt: row.updatedAt };
  } finally {
    plaintext.fill(0);
  }
}

export async function deleteCredential(id: string): Promise<void> {
  requireKey();
  await secretsDb.credentials.delete(id);
}

export async function hasCardSecret(id: string): Promise<boolean> {
  return !!(await secretsDb.cardSecrets.get(id));
}

export async function saveCardSecret(id: string, secret: string): Promise<void> {
  const key = requireKey();
  if (!secret) throw new Error("Secret cannot be empty.");
  const iv = randomBytes(12);
  const plaintext = encoder.encode(secret);
  try {
    const ciphertext = new Uint8Array(
      await cryptoApi().subtle.encrypt(
        { name: "AES-GCM", iv, additionalData: encoder.encode(`${id}:card-secret:v1`) },
        key,
        plaintext,
      ),
    );
    await secretsDb.cardSecrets.put({
      id,
      version: 1,
      iv: toBase64(iv),
      ciphertext: toBase64(ciphertext),
      updatedAt: Date.now(),
    });
  } finally {
    plaintext.fill(0);
  }
}

export async function readCardSecret(id: string): Promise<string> {
  const key = requireKey();
  const row = await secretsDb.cardSecrets.get(id);
  if (!row || row.version !== 1) throw new Error("Secret data is missing or unsupported.");
  try {
    const plaintext = new Uint8Array(
      await cryptoApi().subtle.decrypt(
        { name: "AES-GCM", iv: fromBase64(row.iv), additionalData: encoder.encode(`${id}:card-secret:v1`) },
        key,
        fromBase64(row.ciphertext),
      ),
    );
    try {
      return decoder.decode(plaintext);
    } finally {
      plaintext.fill(0);
    }
  } catch {
    lockVault();
    throw new Error("This secret failed authentication and could not be decrypted.");
  }
}

export async function deleteCardSecret(id: string): Promise<void> {
  await secretsDb.cardSecrets.delete(id);
}
