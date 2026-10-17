import { isIP } from "node:net";

export interface SsrfValidationResult {
  ok: boolean;
  error?: string;
}

function inV4Range(value: number, network: number, prefix: number): boolean {
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (value & mask) === (network & mask);
}

function parseV4(value: string): number | null {
  if (isIP(value) !== 4) return null;
  return value.split(".").reduce((acc, octet) => ((acc << 8) | Number(octet)) >>> 0, 0);
}

function parseV6(value: string): bigint | null {
  if (isIP(value) !== 6) return null;
  let input = value.toLowerCase();
  const embeddedV4 = input.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (embeddedV4) {
    const v4 = parseV4(embeddedV4[1]);
    if (v4 === null) return null;
    input = input.slice(0, -embeddedV4[1].length) + `${(v4 >>> 16).toString(16)}:${(v4 & 0xffff).toString(16)}`;
  }
  const halves = input.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves[1] ? halves[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || (halves.length === 2 && missing < 1)) return null;
  const groups = [...left, ...Array(halves.length === 2 ? missing : 0).fill("0"), ...right];
  if (groups.length !== 8 || groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) return null;
  return groups.reduce((acc, group) => (acc << 16n) | BigInt(`0x${group}`), 0n);
}

function inV6Range(value: bigint, network: bigint, prefix: number): boolean {
  const shift = 128n - BigInt(prefix);
  return (value >> shift) === (network >> shift);
}

export function validatePublicAddress(address: string): SsrfValidationResult {
  const family = isIP(address);
  if (family === 4) {
    const value = parseV4(address);
    if (value === null) return { ok: false, error: "Invalid IP address" };
    const blocked: Array<[string, number]> = [
      ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
      ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24],
      ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
      ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
    ];
    if (blocked.some(([network, prefix]) => inV4Range(value, parseV4(network)!, prefix))) {
      return { ok: false, error: "Access to private or special-use addresses is not allowed" };
    }
    return { ok: true };
  }

  if (family === 6) {
    const value = parseV6(address);
    if (value === null) return { ok: false, error: "Invalid IP address" };
    // IPv4-mapped IPv6 inherits the IPv4 address policy.
    if ((value >> 32n) === 0xffffn) {
      const v4 = Number(value & 0xffffffffn);
      return validatePublicAddress(`${v4 >>> 24}.${(v4 >>> 16) & 255}.${(v4 >>> 8) & 255}.${v4 & 255}`);
    }
    const globalUnicast = inV6Range(value, 0x20000000000000000000000000000000n, 3);
    const special = [
      [0x20010000000000000000000000000000n, 23], // IETF special-purpose block
      [0x20010db8000000000000000000000000n, 32], // documentation
      [0x20020000000000000000000000000000n, 16], // 6to4
    ] as const;
    if (!globalUnicast || special.some(([network, prefix]) => inV6Range(value, network, prefix))) {
      return { ok: false, error: "Access to private or special-use addresses is not allowed" };
    }
    return { ok: true };
  }

  return { ok: false, error: "Invalid IP address" };
}

/** Validate a user-supplied URL before making a server-side request. */
export function validateUpstreamUrl(urlString: string): SsrfValidationResult {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    return { ok: false, error: "Invalid URL" };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, error: `Unsupported protocol: ${url.protocol}` };
  }
  if (url.username || url.password) return { ok: false, error: "URL credentials are not allowed" };

  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!hostname || ["localhost", "metadata.google.internal"].includes(hostname) ||
      [".localhost", ".local", ".internal", ".test", ".example", ".invalid"].some((suffix) => hostname.endsWith(suffix))) {
    return { ok: false, error: "Access to internal addresses is not allowed" };
  }

  if (isIP(hostname)) return validatePublicAddress(hostname);
  // Reject non-canonical numeric host forms that URL/network stacks may interpret as IP literals.
  if (/^[\d.]+$/.test(hostname)) return { ok: false, error: "Invalid IP address" };
  return { ok: true };
}
