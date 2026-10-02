import { expect, test } from "@playwright/test";

async function openConnections(page: import("@playwright/test").Page) {
  await page.goto("/login?from=%2Faccounts");
  await page.getByRole("textbox", { name: "Username" }).fill("admin");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/accounts$/);
  await expect(page.getByRole("heading", { name: "Connections", level: 1 })).toBeVisible();
  await page.getByRole("tab", { name: "App Store Connect" }).click();
}

test("ASC connection management, app selection, vendor setup, refresh and soft delete", async ({ page }) => {
  await openConnections(page);
  await page.getByRole("button", { name: "Manage", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Demo Team" })).toBeVisible();
  await expect(page.getByText("Configured", { exact: true })).toBeVisible();
  const app = page.getByRole("checkbox", { name: /Demo App/ });
  if (!(await app.isChecked())) await app.click();
  await expect(app).toBeChecked();
  await expect(page.getByText("Not configured", { exact: true }).last()).toBeVisible();
  await page.getByRole("button", { name: "Set up Analytics", exact: true }).click();
  await expect(page.getByText("Waiting for Apple report data", { exact: true })).toBeVisible();
  await expect(page.getByText("Ready", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Sync Analytics", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sync Analytics", exact: true })).toBeEnabled();
  await expect(page.getByText("Waiting for Apple report data", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/no_reports_generated/).first()).toBeVisible();
  await page.reload();
  await page.getByRole("tab", { name: "App Store Connect" }).click();
  await page.getByRole("button", { name: "Manage", exact: true }).click();
  await expect(page.getByText("Waiting for Apple report data", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/no_reports_generated/).first()).toBeVisible();
  await page.getByRole("button", { name: "Sync Revenue", exact: true }).click();
  await expect(page.getByText("Error", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/vendor_required/).first()).toBeVisible();
  await page.getByRole("button", { name: "Edit Connection" }).click();
  await page.getByLabel("Vendor Number (Optional)").fill("12345678");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("12345678", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Disable", exact: true }).click();
  await expect(page.getByRole("button", { name: "Refresh Apps" })).toBeDisabled();
  await page.getByRole("button", { name: "Enable", exact: true }).click();
  await page.getByRole("button", { name: "Refresh Apps" }).click();
  await expect(page.getByText("Success", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("App metadata", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Revenue Analytics", { exact: true }).first()).toBeVisible();
  await expect(app).toBeChecked();
  await page.screenshot({ path: "/tmp/dashboard-asc-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("heading", { name: "Demo Team" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  await page.screenshot({ path: "/tmp/dashboard-asc-mobile.png", fullPage: true });

  const metadata = await (await page.request.get("/api/app-store/connections/1")).json();
  expect(metadata.connection).not.toHaveProperty("private_key_encrypted");
  expect(metadata.connection).not.toHaveProperty("privateKey");
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  const dialog = page.getByRole("alertdialog");
  const token = await dialog.locator("code").innerText();
  await dialog.getByLabel("Enter the code above", { exact: true }).fill(token);
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByText("No App Store Connect connections yet.")).toBeVisible();
  expect((await page.request.get("/api/app-store/connections/1")).status()).toBe(404);
});

test("ASC form extracts Key ID, allows correction and exposes Apple permission errors", async ({ page }) => {
  await openConnections(page);
  await page.getByRole("button", { name: "Add Connection", exact: true }).first().click();
  await page.getByLabel("Name", { exact: true }).fill("My Team");
  await page.getByLabel("Private Key (.p8)").setInputFiles({ name: "AuthKey_ABC1234567.p8", mimeType: "application/octet-stream", buffer: Buffer.from("test-fixture-private-key") });
  await expect(page.getByLabel("Key ID", { exact: true })).toHaveValue("ABC1234567");
  await page.getByLabel("Key ID", { exact: true }).fill("NEW1234567");
  await page.getByLabel("Issuer ID").fill("00000000-0000-4000-8000-000000000001");
  let payload: Record<string, unknown> | undefined;
  await page.route("**/api/app-store/connections", async (route) => {
    if (route.request().method() !== "POST") { await route.continue(); return; }
    payload = route.request().postDataJSON();
    await route.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ error: "Apple API (403): Insufficient app access", code: "FORBIDDEN_ERROR", upstreamStatus: 403 }) });
  });
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Insufficient app access");
  expect(payload).toMatchObject({ keyId: "NEW1234567", issuerId: "00000000-0000-4000-8000-000000000001", vendorNumber: null });
  expect(await page.evaluate(() => Object.values(localStorage).some((value) => String(value).includes("test-fixture-private-key")))).toBeFalsy();
});

test("Business groups Web Analytics and the header resolves the existing route", async ({ page }) => {
  await openConnections(page);
  await page.getByRole("button", { name: "Business", exact: true }).click();
  await page.getByRole("link", { name: "Web Analytics", exact: true }).click();
  await expect(page).toHaveURL(/\/analytics$/, { timeout: 15_000 });
  await expect(page.locator("header nav")).toContainText("Web Analytics");
  await expect(page.getByRole("button", { name: "Business", exact: true })).toHaveAttribute("aria-expanded", "true");
});

test("App Store Analytics tabs, app/date/territory filters and missing campaign data", async ({ page }) => {
  const filters: URLSearchParams[] = [];
  await page.route("**/api/app-store/analytics/apps", (route) => route.fulfill({ json: { apps: [{ id: 1, name: "Sample App" }, { id: 2, name: "Second App" }] } }));
  await page.route(/\/api\/app-store\/analytics\?/, (route) => {
    const query = new URL(route.request().url()).searchParams;
    filters.push(query);
    const metrics = { impressions: 100, views: 30, firstTimeDownloads: 0, downloads: 10, conversion: null };
    return route.fulfill({ json: {
      overview: metrics, updatedAt: "2026-10-02T00:00:00Z", completeThrough: "2026-09-29", trend: [{ date: query.get("to"), ...metrics }],
      acquisition: [{ source: "App Store Search", ...metrics }, { source: "Web Referrer", impressions: null, views: null, firstTimeDownloads: null, downloads: null, conversion: null }],
      campaigns: [], territories: ["USA", "JPN"],
    } });
  });
  await openConnections(page);
  await page.getByRole("button", { name: "Business", exact: true }).click();
  await expect(page.getByRole("link", { name: "Web Analytics", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "App Store Analytics", exact: true }).click();
  await expect(page).toHaveURL(/\/app-store$/);
  await expect(page.getByRole("heading", { name: "App Store Analytics", level: 1 })).toBeVisible();
  await expect(page.locator("header nav")).toContainText("App Store Analytics");
  await expect(page).toHaveTitle("App Store Analytics · Data Hub");
  await expect(page.getByRole("combobox", { name: "App", exact: true })).toContainText("All Apps");
  await expect(page.getByText("First-Time Downloads", { exact: true })).toBeVisible();
  await expect(page.getByText("Updated", { exact: true })).toBeVisible();
  await expect(page.getByText("Complete through", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Acquisition", exact: true }).click();
  await expect(page.getByRole("row", { name: /Web Referrer/ })).toContainText("—");
  await page.getByRole("combobox", { name: "App", exact: true }).click();
  await page.getByRole("option", { name: "Sample App", exact: true }).click();
  await expect.poll(() => filters.at(-1)?.get("appId")).toBe("1");
  await page.getByRole("button", { name: "30D", exact: true }).click();
  await expect.poll(() => {
    const query = filters.at(-1)!;
    return (Date.parse(query.get("to")!) - Date.parse(query.get("from")!)) / 86400000 + 1;
  }).toBe(30);
  await page.getByRole("button", { name: "90D", exact: true }).click();
  await expect(page.getByRole("button", { name: "90D", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("combobox", { name: "Territory", exact: true }).click();
  await page.getByRole("option", { name: "JPN", exact: true }).click();
  await expect.poll(() => filters.at(-1)?.get("territory")).toBe("JPN");
  await page.getByRole("tab", { name: "Campaigns", exact: true }).click();
  await expect(page.getByText("Campaign data is not included in Standard reports.", { exact: true })).toBeVisible();
  await page.getByRole("combobox", { name: "App", exact: true }).click();
  await page.getByRole("option", { name: "All Apps", exact: true }).click();
  await expect.poll(() => filters.at(-1)?.has("appId")).toBe(false);
  await expect.poll(() => filters.at(-1)?.has("territory")).toBe(false);
  await page.getByRole("tab", { name: "Overview", exact: true }).click();
  await page.screenshot({ path: "/tmp/dashboard-app-store-analytics-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  await page.screenshot({ path: "/tmp/dashboard-app-store-analytics-mobile.png", fullPage: true });
});


test("Business Revenue has four tabs and retains separate currencies, nulls and final fiscal periods", async ({ page }) => {
  await page.route("**/api/app-store/analytics/apps", (route) => route.fulfill({ json: { apps: [{ id: 1, name: "Synthetic App" }] } }));
  const amounts = [{ currency: "USD", proceeds: "1.4", sales: "2" }, { currency: "JPY", proceeds: "100", sales: "200" }];
  await page.route(/\/api\/app-store\/revenue\?/, (route) => route.fulfill({ json: {
    updatedAt: "2026-09-29", completeThrough: "2026-09-27", overview: { amounts, units: "2", payingUsers: null },
    trend: amounts.map((a) => ({ ...a, date: "2026-09-29" })), byApp: amounts.map((a) => ({ ...a, app: "Synthetic App" })), byTerritory: [],
    sales: { rows: [], amounts, units: "2", trend: [], byApp: [], byTerritory: [] },
    subscriptions: { active: null, starts: null, conversions: null, renewals: null, voluntaryChurn: null, involuntaryChurn: null, trend: [], bySubscription: [] },
    settlements: [{ fiscalMonth: "2026-09", region: "ZZ", currency: "USD", startDate: "2026-08-30", endDate: "2026-09-26", earned: "1.4", units: "2" }], territories: ["USA", "JP"],
  } }));
  await openConnections(page);
  await page.getByRole("button", { name: "Business", exact: true }).click();
  for (const name of ["Web Analytics", "App Store Analytics", "Revenue"]) await expect(page.getByRole("link", { name, exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Revenue", exact: true }).click();
  await expect(page).toHaveURL(/\/revenue$/);
  await expect(page).toHaveTitle("Revenue · Data Hub");
  await expect(page.getByRole("heading", { name: "Revenue", exact: true })).toBeVisible();
  for (const name of ["Overview", "Sales", "Subscriptions", "Settlements"]) await expect(page.getByRole("tab", { name, exact: true })).toBeVisible();
  await expect(page.getByText("Paying Users", { exact: true }).locator("..")).toContainText("—");
  await expect(page.getByText("USD", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("JPY", { exact: true }).first()).toBeVisible();
  await page.getByRole("tab", { name: "Subscriptions", exact: true }).click();
  await expect(page.getByText("No subscription report data for this selection.")).toBeVisible();
  await page.getByRole("tab", { name: "Settlements", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Final · Financial reports" })).toBeVisible();
  await expect(page.getByRole("row", { name: /2026-09 ZZ/ })).toContainText("2026-08-30 – 2026-09-26");
  await page.getByLabel("Apple fiscal month", { exact: true }).fill("2026-09");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  await page.screenshot({ path: "/tmp/dashboard-revenue-mobile.png", fullPage: true });
});
