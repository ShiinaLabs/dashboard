import { describe, it, expect } from "vitest";
import { validateUpstreamUrl } from "../lib/ssrf-guard";
import { assertSafeInstanceUrl } from "../lib/services/accounts";

describe("SSRF guard", () => {
  it("accepts a public https URL", () => {
    expect(validateUpstreamUrl("https://gitlab.com").ok).toBe(true);
    expect(() => assertSafeInstanceUrl("https://gitlab.com")).not.toThrow();
  });

  it("rejects loopback addresses", () => {
    expect(validateUpstreamUrl("http://127.0.0.1:8000").ok).toBe(false);
    expect(() => assertSafeInstanceUrl("http://127.0.0.1:8000")).toThrow();
  });

  it("rejects cloud metadata addresses", () => {
    expect(validateUpstreamUrl("http://169.254.169.254/latest/meta-data").ok).toBe(false);
    expect(() => assertSafeInstanceUrl("http://169.254.169.254/")).toThrow();
  });

  it("rejects internal private ranges", () => {
    expect(validateUpstreamUrl("http://192.168.1.10").ok).toBe(false);
    expect(validateUpstreamUrl("http://10.0.0.5").ok).toBe(false);
    expect(validateUpstreamUrl("http://172.16.0.1").ok).toBe(false);
  });

  it("rejects internal hostnames", () => {
    expect(validateUpstreamUrl("http://localhost:8080").ok).toBe(false);
    expect(validateUpstreamUrl("http://metadata.google.internal").ok).toBe(false);
  });

  it("rejects private, link-local, shared, reserved, and documentation IPv4 ranges", () => {
    for (const address of ["100.64.0.1", "169.254.1.1", "192.0.2.12", "198.18.0.1", "198.51.100.2", "203.0.113.3", "224.0.0.1", "240.0.0.1"]) {
      expect(validateUpstreamUrl(`https://${address}`).ok, address).toBe(false);
    }
  });

  it("rejects unsafe IPv6 and IPv4-mapped IPv6 addresses", () => {
    for (const address of ["[::1]", "[::]", "[fc00::1]", "[fe80::1]", "[2001:db8::1]", "[::ffff:127.0.0.1]"]) {
      expect(validateUpstreamUrl(`https://${address}`).ok, address).toBe(false);
    }
    expect(validateUpstreamUrl("https://[2606:4700:4700::1111]").ok).toBe(true);
  });

  it("rejects credentials and non-canonical numeric hostnames", () => {
    expect(validateUpstreamUrl("https://user:pass@gitlab.com").ok).toBe(false);
    expect(validateUpstreamUrl("http://2130706433").ok).toBe(false);
    expect(validateUpstreamUrl("http://127.0.0.999").ok).toBe(false);
  });

  it("continues to allow public custom GitLab domains", () => {
    expect(validateUpstreamUrl("https://gitlab.company.com").ok).toBe(true);
  });

  it("rejects non-http protocols", () => {
    expect(validateUpstreamUrl("file:///etc/passwd").ok).toBe(false);
    expect(validateUpstreamUrl("ftp://example.com").ok).toBe(false);
  });
});
