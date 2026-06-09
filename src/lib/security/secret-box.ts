import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const KEY_LENGTH = 32;

export function encryptSecretPayload(payload: unknown): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const plaintext = JSON.stringify(payload);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    "v1",
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

export function decryptSecretPayload<T>(value: string | null): T | null {
  if (!value) {
    return null;
  }

  const [version, ivValue, tagValue, encryptedValue] = value.split(".");

  if (
    version !== "v1" ||
    !ivValue ||
    !tagValue ||
    !encryptedValue
  ) {
    return null;
  }

  const key = getEncryptionKey();
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(ivValue, "base64url"),
  );

  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, "base64url")),
    decipher.final(),
  ]);

  return JSON.parse(decrypted.toString("utf8")) as T;
}

function getEncryptionKey(): Buffer {
  const value = process.env.INTEGRATION_ENCRYPTION_KEY;

  if (!value?.trim()) {
    throw new Error("INTEGRATION_ENCRYPTION_KEY is not configured.");
  }

  const raw = value.trim();
  const decoded = raw.startsWith("base64:")
    ? Buffer.from(raw.slice("base64:".length), "base64")
    : Buffer.from(raw);

  if (decoded.length === KEY_LENGTH) {
    return decoded;
  }

  return crypto.createHash("sha256").update(decoded).digest();
}
