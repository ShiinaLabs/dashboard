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
  await app.click();
  await expect(app).toBeChecked();

  await page.getByRole("button", { name: "Edit Connection" }).click();
  await page.getByLabel("Vendor Number (Optional)").fill("12345678");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("12345678", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Disable", exact: true }).click();
  await expect(page.getByRole("button", { name: "Refresh Apps" })).toBeDisabled();
  await page.getByRole("button", { name: "Enable", exact: true }).click();
  await page.getByRole("button", { name: "Refresh Apps" }).click();
  await expect(page.getByText("Success", { exact: true })).toBeVisible();
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
