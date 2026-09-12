import { createCipheriv, createDecipheriv, randomBytes, createHmac, timingSafeEqual } from "crypto";
import { isMockMode } from "./config";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;
const ENCRYPTED_PREFIX = "v1:";
const MIN_CIPHERTEXT_BYTES = IV_LEN + TAG_LEN + 1;

const g = globalThis as unknown as { __cryptoKey?: Buffer };

export function initCrypto(keyHex?: string): string {
  if (keyHex) {
    if (keyHex.length !== 64) throw new Error("Encryption key must be 64 hex chars (32 bytes)");
    g.__cryptoKey = Buffer.from(keyHex, "hex");
    return keyHex;
  }
  g.__cryptoKey = randomBytes(32);
  return g.__cryptoKey.toString("hex");
}

function getKey(): Buffer {
  if (!g.__cryptoKey) throw new Error("Crypto not initialised — call initCrypto() first");
  return g.__cryptoKey;
}

function toU8(buf: Buffer): Uint8Array {
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

function concatToU8(...bufs: (Buffer | Uint8Array)[]): Uint8Array {
  const total = bufs.reduce((acc, b) => acc + b.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const buf of bufs) {
    result.set(buf instanceof Uint8Array ? buf : toU8(buf), offset);
    offset += buf.length;
  }
  return result;
}

export function encrypt(plaintext: string): string {
  // In mock/debug mode there is no crypto key — pass through so the service
  // layer (which round-trips tokens) works without a backend.
  if (isMockMode()) return plaintext;
  const key = getKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, toU8(key), toU8(iv), { authTagLength: TAG_LEN });
  const encrypted = concatToU8(cipher.update(plaintext, "utf8"), cipher.final());
  const tag = toU8(cipher.getAuthTag());
  return `${ENCRYPTED_PREFIX}${Buffer.from(concatToU8(iv, tag, Buffer.from(encrypted))).toString("hex")}`;
}

export function decrypt(ciphertext: string): string {
  if (isMockMode()) return ciphertext;
  const key = getKey();
  const encoded = ciphertext.startsWith(ENCRYPTED_PREFIX)
    ? ciphertext.slice(ENCRYPTED_PREFIX.length)
    : ciphertext;
  if (!/^[0-9a-f]+$/i.test(encoded) || encoded.length % 2 !== 0) {
    throw new Error("Invalid ciphertext encoding");
  }
  const buf = Buffer.from(encoded, "hex");
  if (buf.length < MIN_CIPHERTEXT_BYTES) throw new Error("Ciphertext too short");
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const encrypted = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALGO, toU8(key), toU8(iv), { authTagLength: TAG_LEN });
  decipher.setAuthTag(tag);
  const decrypted = concatToU8(decipher.update(toU8(encrypted)), decipher.final());
  return Buffer.from(decrypted).toString("utf8");
}

/**
 * Identify values that have the shape of an encrypted credential.
 *
 * The prefix covers all newly-written values. The legacy hex check is kept so
 * key rotation never mistakes an old ciphertext for plaintext and overwrites
 * it with a ciphertext encrypted by the wrong key.
 */
export function isEncryptedCredential(value: string): boolean {
  if (value.startsWith(ENCRYPTED_PREFIX)) return true;
  const encoded = value;
  return /^[0-9a-f]+$/i.test(encoded)
    && encoded.length % 2 === 0
    && Buffer.byteLength(encoded, "hex") >= MIN_CIPHERTEXT_BYTES;
}

export function sign(payload: string): string {
  if (isMockMode()) return "mock-signature";
  return createHmac("sha256", toU8(getKey())).update(payload).digest("hex");
}

export function verifySignature(payload: string, signature: string): boolean {
  if (isMockMode()) return true;
  try {
    const expected = Buffer.from(sign(payload), "hex");
    const actual = Buffer.from(signature, "hex");
    if (expected.length !== actual.length) return false;
    return timingSafeEqual(expected, actual);
  } catch { return false; }
}

/** Return the 32-byte key as Uint8Array for use with jose JWT */
export function getJwtSecret(): Uint8Array {
  if (isMockMode()) return new Uint8Array(32);
  return toU8(getKey());
}
