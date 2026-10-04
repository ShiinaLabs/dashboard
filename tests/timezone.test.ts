import { afterEach, describe, expect, it, vi } from "vitest";
import { getRequestTimezone } from "@/lib/timezone.server";
import { isValidTimezone } from "@/lib/timezone";
import { getTimezone, setTimezone, syncTimezoneCookie } from "@/lib/client/datetime";

const originalWindow = globalThis.window;
const originalDocument = globalThis.document;
const originalLocalStorage = globalThis.localStorage;

function installBrowser({ storageValue = null, cookie = "" }: { storageValue?: string | null; cookie?: string } = {}) {
  const storage = new Map<string, string>();
  if (storageValue !== null) storage.set("timezone", storageValue);
  Object.defineProperty(globalThis, "window", { configurable: true, value: {} });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    },
  });
  let cookieValue = cookie;
  const writes: string[] = [];
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      get cookie() { return cookieValue; },
      set cookie(value: string) {
        writes.push(value);
        const [pair] = value.split(";");
        const [name, content] = pair.split("=", 2);
        const entries = new Map(cookieValue.split(";").filter(Boolean).map((part) => part.trim().split("=", 2) as [string, string]));
        entries.set(name, content);
        cookieValue = [...entries].map(([key, item]) => `${key}=${item}`).join("; ");
      },
    },
  });
  return { storage, writes };
}

afterEach(() => {
  Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
  Object.defineProperty(globalThis, "document", { configurable: true, value: originalDocument });
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: originalLocalStorage });
  vi.restoreAllMocks();
});

describe("timezone request context", () => {
  it("validates IANA timezone identifiers", () => {
    expect(isValidTimezone("Asia/Tokyo")).toBe(true);
    expect(isValidTimezone("UTC")).toBe(true);
    expect(isValidTimezone("Not/AZone")).toBe(false);
    expect(isValidTimezone("x".repeat(101))).toBe(false);
    expect(isValidTimezone(null)).toBe(false);
  });

  it.each([
    ["Asia/Tokyo", "Asia/Tokyo"],
    ["Not/AZone", "UTC"],
    ["x".repeat(101), "UTC"],
    [null, "UTC"],
  ])("uses a validated request cookie (%s)", (cookie, expected) => {
    const headers = cookie === null ? undefined : { cookie: `dash_timezone=${encodeURIComponent(cookie)}` };
    const request = new Request("http://localhost/overview", { headers });
    expect(getRequestTimezone(request)).toBe(expected);
  });

  it("synchronizes a legacy timezone into a one-year browser cookie without a request", () => {
    const { writes } = installBrowser({ storageValue: "Asia/Tokyo" });
    const timezone = syncTimezoneCookie();
    expect(timezone).toBe("Asia/Tokyo");
    expect(document.cookie).toContain("dash_timezone=Asia%2FTokyo");
    expect(writes[0]).toContain("Path=/");
    expect(writes[0]).toContain("SameSite=Lax");
    expect(writes[0]).toContain("Max-Age=31536000");
    expect(writes[0]).not.toContain("HttpOnly");
  });

  it("repairs missing or mismatched cookies and rejects invalid stored timezone values", () => {
    installBrowser({ storageValue: "Not/AZone", cookie: "dash_timezone=Europe%2FParis" });
    expect(syncTimezoneCookie()).toBe("Europe/Paris");
    expect(document.cookie).toContain("dash_timezone=Europe%2FParis");
    expect(getTimezone()).toBe("Europe/Paris");
  });

  it("writes valid settings to localStorage and cookie, ignoring invalid values", () => {
    const { storage } = installBrowser();
    setTimezone("Asia/Tokyo");
    expect(storage.get("timezone")).toBe("Asia/Tokyo");
    expect(document.cookie).toContain("dash_timezone=Asia%2FTokyo");
    setTimezone("Not/AZone");
    expect(storage.get("timezone")).toBe("Asia/Tokyo");
    expect(document.cookie).toContain("dash_timezone=Asia%2FTokyo");
  });
});
