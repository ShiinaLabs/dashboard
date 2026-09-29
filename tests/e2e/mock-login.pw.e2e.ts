import { expect, test } from "@playwright/test";

async function logIn(page: import("@playwright/test").Page) {
  await page.goto("/login?from=%2Foverview");
  await page.getByRole("textbox", { name: "Username" }).fill("admin");
  const loginResponse = page.waitForResponse((response) => response.url().includes("/api/auth/login"));
  await page.getByRole("button", { name: "Log in" }).click();
  expect((await loginResponse).ok()).toBeTruthy();
  await expect(page).toHaveURL(/\/overview$/);
}

test("mock login keeps its session and opens the requested route", async ({ page }) => {
  await logIn(page);
  await expect(page.getByRole("link", { name: "Overview" })).toBeVisible();

  const sessionCookie = (await page.context().cookies()).find((cookie) => cookie.name === "dash_session");
  expect(sessionCookie).toMatchObject({ httpOnly: true, secure: false, path: "/" });

  const authResponse = await page.request.get("/api/auth/me");
  expect(authResponse.ok()).toBeTruthy();
  await expect(authResponse.json()).resolves.toMatchObject({
    authenticated: true,
    username: "admin",
    role: "admin",
  });
});

test("dashboard routes render without horizontal overflow at desktop and tablet widths", async ({ page }) => {
  await logIn(page);
  const routes = [
    "/overview", "/accounts", "/x", "/x/1", "/github", "/github/1",
    "/github/1/repos/1", "/gitlab", "/gitlab/1", "/gitlab/1/projects/1",
    "/reddit", "/reddit/1", "/ai", "/settings", "/admin",
  ];

  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of routes) {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await expect(page.locator("main"), `${route} at ${width}px`).toBeVisible();
      const dimensions = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        content: document.documentElement.scrollWidth,
      }));
      expect(dimensions.content, `${route} at ${width}px`).toBeLessThanOrEqual(dimensions.viewport);
    }
  }
});

test("mobile navigation opens, closes, and logout returns to login", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await logIn(page);

  const sidebarToggle = page.getByRole("button", { name: "Expand sidebar" });
  await expect(sidebarToggle).toBeVisible();
  await sidebarToggle.click();
  await expect(page.getByRole("link", { name: "Overview" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Expand sidebar" })).toBeVisible();

  await page.getByRole("button", { name: "Expand sidebar" }).click();
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("button", { name: "Log in" })).toBeVisible();
});
