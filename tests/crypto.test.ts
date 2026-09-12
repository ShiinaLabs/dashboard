import { describe, it, expect, beforeAll } from "vitest";
import {
  encrypt,
  decrypt,
  isEncryptedCredential,
  sign,
  verifySignature,
  initCrypto,
  getJwtSecret,
} from "../lib/crypto";

beforeAll(() => {
  initCrypto("a".repeat(64)); // deterministic key for testing
});

describe("crypto", () => {
  it("encrypts and decrypts", () => {
    const plain = "hello world";
    const encrypted = encrypt(plain);
    expect(encrypted).toMatch(/^v1:/);
    expect(isEncryptedCredential(encrypted)).toBe(true);
    expect(encrypted).not.toBe(plain);
    expect(decrypt(encrypted)).toBe(plain);
  });

  it("recognizes legacy ciphertext without treating ordinary tokens as encrypted", () => {
    const encrypted = encrypt("legacy token");
    const legacyCiphertext = encrypted.slice("v1:".length);

    expect(isEncryptedCredential(legacyCiphertext)).toBe(true);
    expect(isEncryptedCredential("ghp_plaintext-token")).toBe(false);
    expect(decrypt(legacyCiphertext)).toBe("legacy token");
  });

  it("produces different ciphertexts each time (IV randomisation)", () => {
    const a = encrypt("same");
    const b = encrypt("same");
    expect(a).not.toBe(b);
    expect(decrypt(a)).toBe("same");
    expect(decrypt(b)).toBe("same");
  });

  it("throws on corrupted ciphertext", () => {
    const encrypted = encrypt("test");
    const corrupted = encrypted.slice(0, -2) + "00";
    expect(() => decrypt(corrupted)).toThrow();
  });

  it("throws on truncated ciphertext", () => {
    expect(() => decrypt("aabb")).toThrow();
  });
});

describe("sign / verifySignature", () => {
  it("signs and verifies a payload", () => {
    const payload = "admin:admin:1234567890";
    const sig = sign(payload);
    expect(sig).toBeTruthy();
    expect(verifySignature(payload, sig)).toBe(true);
  });

  it("rejects forged signature", () => {
    const payload = "admin:admin:1234567890";
    const sig = sign(payload);
    const forged = sig.replace(/^.{4}/, "dead");
    expect(verifySignature(payload, forged)).toBe(false);
  });

  it("rejects wrong payload for given signature", () => {
    const sig = sign("real:payload:123");
    expect(verifySignature("fake:payload:123", sig)).toBe(false);
  });

  it("rejects malformed signature input", () => {
    expect(verifySignature("payload", "not-hex")).toBe(false);
  });
});

describe("getJwtSecret", () => {
  it("returns a Uint8Array of 32 bytes", () => {
    const secret = getJwtSecret();
    expect(secret).toBeInstanceOf(Uint8Array);
    expect(secret.byteLength).toBe(32);
  });
});
