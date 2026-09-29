import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../analytics/collector/public/tracker.js", import.meta.url), "utf8");
const site = "123e4567-e89b-42d3-a456-426614174000";

function runTracker(options: { siteId?: string; siteHost?: string; locationHost?: string; path?: string; referrer?: string; storage?: Map<string, string>; now?: number } = {}) {
  const storage = options.storage ?? new Map<string, string>();
  const requests: Array<{ url: string; init: RequestInit }> = [];
  const document = {
    currentScript: { src: "https://collector.example/tracker.js", dataset: { siteId: options.siteId ?? site, siteHost: options.siteHost ?? "wifi-lens.app" } },
    referrer: options.referrer ?? "",
  };
  const location = { host: options.locationHost ?? "wifi-lens.app", pathname: options.path ?? "/pricing/", href: `https://${options.locationHost ?? "wifi-lens.app"}/pricing/?private=1#hash` };
  const localStorage = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, value); },
  };
  const now = options.now ?? 1_782_000_000_000;
  class FixedDate extends Date { static now() { return now; } }
  vm.runInNewContext(source, {
    document,
    location,
    localStorage,
    URL,
    Date: FixedDate,
    fetch: (url: string, init: RequestInit) => { requests.push({ url, init }); return Promise.resolve({ ok: true }); },
  });
  return { requests, storage };
}

describe("analytics tracker", () => {
  it("does not send without a site ID or when the current host differs", () => {
    expect(runTracker({ siteId: "" }).requests).toHaveLength(0);
    expect(runTracker({ locationHost: "evil.example" }).requests).toHaveLength(0);
  });

  it("posts a privacy-safe page load to the collector with daily visitor and 30-minute visit flags", () => {
    const first = runTracker({ referrer: "https://source.example/path?secret=1" });
    expect(first.requests).toHaveLength(1);
    expect(first.requests[0].url).toBe("https://collector.example/collect");
    expect(first.requests[0].init).toMatchObject({ method: "POST", keepalive: true, credentials: "omit" });
    expect(JSON.parse(String(first.requests[0].init.body))).toEqual({
      site,
      host: "wifi-lens.app",
      path: "/pricing",
      referrer: "https://source.example/path?secret=1",
      visitor: true,
      visit: true,
    });

    const sameSession = runTracker({ storage: first.storage, now: 1_782_000_000_000 + 10 * 60 * 1000 });
    expect(JSON.parse(String(sameSession.requests[0].init.body))).toMatchObject({ visitor: false, visit: false });
    const nextVisit = runTracker({ storage: first.storage, now: 1_782_000_000_000 + 41 * 60 * 1000 });
    expect(JSON.parse(String(nextVisit.requests[0].init.body))).toMatchObject({ visitor: false, visit: true });
    const nextDay = runTracker({ storage: first.storage, now: 1_782_000_000_000 + 24 * 60 * 60 * 1000 });
    expect(JSON.parse(String(nextDay.requests[0].init.body))).toMatchObject({ visitor: true, visit: true });
    const otherSite = runTracker({ storage: first.storage, siteId: "223e4567-e89b-42d3-a456-426614174000", now: 1_782_000_000_000 + 10 * 60 * 1000 });
    expect(JSON.parse(String(otherSite.requests[0].init.body))).toMatchObject({ visitor: true, visit: true });
  });

  it("continues pageview delivery when localStorage throws", () => {
    const requests: unknown[] = [];
    class FixedDate extends Date { static now() { return 1_782_000_000_000; } }
    vm.runInNewContext(source, {
      document: { currentScript: { src: "https://collector.example/tracker.js", dataset: { siteId: site, siteHost: "wifi-lens.app" } }, referrer: "" },
      location: { host: "wifi-lens.app", pathname: "/", href: "https://wifi-lens.app/" },
      localStorage: { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } },
      URL,
      Date: FixedDate,
      fetch: (url: string, init: RequestInit) => { requests.push(JSON.parse(String(init.body))); return Promise.resolve({}); },
    });
    expect(requests).toEqual([{ site, host: "wifi-lens.app", path: "/", referrer: "", visitor: true, visit: true }]);
  });
});
