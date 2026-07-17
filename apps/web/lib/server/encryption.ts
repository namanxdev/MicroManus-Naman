import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { requiredEnv } from "./env";

export interface EncryptedSecret {
  ciphertext: string;
  iv: string;
  authTag: string;
  keyVersion: number;
}

function currentKeyVersion(): number {
  const value = Number(process.env.KEY_ENCRYPTION_KEY_VERSION || "1");
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error("KEY_ENCRYPTION_KEY_VERSION must be a positive integer");
  }
  return value;
}

function encryptionKey(version: number): Buffer {
  const encoded = process.env[`KEY_ENCRYPTION_SECRET_V${version}`]?.trim()
    || (version === currentKeyVersion() ? requiredEnv("KEY_ENCRYPTION_SECRET") : "");
  if (!encoded) throw new Error(`Missing encryption key version ${version}`);

  const key = /^[0-9a-f]{64}$/i.test(encoded)
    ? Buffer.from(encoded, "hex")
    : Buffer.from(encoded, "base64");
  if (key.length !== 32) {
    throw new Error("KEY_ENCRYPTION_SECRET must encode exactly 32 bytes");
  }
  return key;
}

function additionalData(userId: string, provider: string, version: number): Buffer {
  return Buffer.from(`micromanus:${userId}:${provider}:v${version}`, "utf8");
}

export function encryptSecret(secret: string, userId: string, provider: string): EncryptedSecret {
  const keyVersion = currentKeyVersion();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(keyVersion), iv);
  cipher.setAAD(additionalData(userId, provider, keyVersion));
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);

  return {
    ciphertext: ciphertext.toString("base64url"),
    iv: iv.toString("base64url"),
    authTag: cipher.getAuthTag().toString("base64url"),
    keyVersion,
  };
}

export function decryptSecret(
  encrypted: Pick<EncryptedSecret, "ciphertext" | "iv" | "authTag" | "keyVersion">,
  userId: string,
  provider: string,
): string {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(encrypted.keyVersion),
    Buffer.from(encrypted.iv, "base64url"),
  );
  decipher.setAAD(additionalData(userId, provider, encrypted.keyVersion));
  decipher.setAuthTag(Buffer.from(encrypted.authTag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted.ciphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function secretHint(secret: string): string {
  const suffix = secret.slice(-4);
  return `••••${suffix}`;
}
