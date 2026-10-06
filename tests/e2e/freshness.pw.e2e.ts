import { expect, test } from "@playwright/test";

async function triggerVisibleRecovery(page: import("@playwright/test").Page) {
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("pageshow"));
  });
}

test("page freshness recovers on resume, coalesces lifecycle events and separates server from query failures", async ({ page }) => {
  await page.clock.install();
  let healthCalls = 0;
  let graphQLCalls = 0;
  let failHealth = false;
  let failGraphQL = false;
  await page.route("**/api/health", async (route) => {
    healthCalls++;
    await route.fulfill({ status: failHealth ? 503 : 200, contentType: "application/json", body: JSON.stringify({ status: failHealth ? "unavailable" : "ok", serverTime: new Date().toISOString() }) });
  });
  await page.route("**/api/graphql", async (route) => {
    graphQLCalls++;
    if (failGraphQL) await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "query failed" }) });
    else await route.continue();
  });

  await page.goto("/login?from=%2Fapp-store");
  await page.getByRole("textbox", { name: "Username" }).fill("admin");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/app-store$/);
  await expect(page.getByRole("heading", { name: "App Store Analytics", level: 1 })).toBeVisible();
  await expect(page.getByRole("status", { name: /Dashboard server freshness: Updated/ })).toBeVisible();
  const freshnessStatus = page.getByRole("status", { name: /Dashboard server freshness:/ });
  await expect(freshnessStatus).toHaveAttribute("title", /Server checked .*; Data refreshed (?!—).+/);
  const initialDataTime = (await freshnessStatus.getAttribute("title"))?.match(/Data refreshed (.+)$/)?.[1];
  const beforeHeartbeatHealth = healthCalls;
  const beforeHeartbeatGraphQL = graphQLCalls;
  await page.clock.fastForward(60_000);
  await expect.poll(() => healthCalls).toBeGreaterThan(beforeHeartbeatHealth);
  expect(graphQLCalls).toBe(beforeHeartbeatGraphQL);
  await expect.poll(async () => (await freshnessStatus.getAttribute("title"))?.match(/Data refreshed (.+)$/)?.[1]).toBe(initialDataTime);

  const beforeHealth = healthCalls;
  const beforeGraphQL = graphQLCalls;
  await triggerVisibleRecovery(page);
  await expect.poll(() => healthCalls).toBeGreaterThan(beforeHealth);
  await expect.poll(() => graphQLCalls).toBeGreaterThan(beforeGraphQL);
  await expect.poll(() => healthCalls - beforeHealth).toBe(1);
  await expect(page.getByRole("status", { name: /Dashboard server freshness: Updated/ })).toBeVisible();
  await expect.poll(async () => (await freshnessStatus.getAttribute("title"))?.match(/Data refreshed (.+)$/)?.[1]).not.toBe(initialDataTime);

  failHealth = true;
  const freshBeforeHealthFailure = (await freshnessStatus.getAttribute("title"))?.match(/Data refreshed (.+)$/)?.[1];
  await page.clock.fastForward(1600);
  await triggerVisibleRecovery(page);
  await expect(page.getByRole("status", { name: /Dashboard server freshness: Server unavailable/ })).toBeVisible();
  await expect.poll(async () => (await freshnessStatus.getAttribute("title"))?.match(/Data refreshed (.+)$/)?.[1]).toBe(freshBeforeHealthFailure);

  failHealth = false;
  failGraphQL = true;
  await page.clock.fastForward(1600);
  await triggerVisibleRecovery(page);
  await expect(page.getByRole("status", { name: /Dashboard server freshness: Refresh failed/ })).toBeVisible();
  await expect(page.getByRole("status", { name: /Dashboard server freshness: Refresh failed/ })).toHaveAttribute("aria-label", /Dashboard server freshness: Refresh failed/);
  await expect.poll(async () => (await freshnessStatus.getAttribute("title"))?.match(/Data refreshed (.+)$/)?.[1]).toBe(freshBeforeHealthFailure);

  failGraphQL = false;
  await page.evaluate(() => {
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    window.dispatchEvent(new Event("offline"));
  });
  await expect(page.getByRole("status", { name: /Dashboard server freshness: Offline/ })).toBeVisible();
  await page.evaluate(() => {
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    window.dispatchEvent(new Event("online"));
  });
  await expect(page.getByRole("status", { name: /Dashboard server freshness: Updated/ })).toBeVisible();
});
