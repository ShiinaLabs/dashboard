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

test("Web Analytics adds and selects sites before showing 7-day metrics", async ({ page }) => {
  await logIn(page);
  await page.getByRole("link", { name: "Web Analytics" }).click();
  await expect(page).toHaveURL(/\/analytics$/);
  await expect(page.getByRole("heading", { name: "Web Analytics", level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "Add Site" }).click();
  await page.getByLabel("Name").fill("Playwright Site");
  await page.getByLabel("Host").fill("playwright.example");
  await expect(page.getByLabel("Site ID")).toHaveCount(0);
  const createResponse = page.waitForResponse((response) => response.url().endsWith("/api/analytics/sites") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Save Site" }).click();
  const createdResponse = await createResponse;
  expect(createdResponse.status()).toBe(201);
  const createdSite = await createdResponse.json();
  expect(createdSite.site_key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  await expect(page.getByText("Playwright Site", { exact: false })).toBeVisible();
  const selector = page.getByRole("combobox", { name: "Select a website" });
  await expect(selector).toBeVisible();
  await selector.click();
  await page.getByRole("option", { name: /Example Site/ }).click();
  await expect(page.getByText("Last 7 days")).toBeVisible();
  await expect(page.getByText("Views")).toBeVisible();
  await expect(page.getByText("Visitors")).toBeVisible();
  await expect(page.getByText("Visits")).toBeVisible();
  await expect(page.getByText("12,842")).toBeVisible();
  await expect(page.getByText("2,931")).toBeVisible();
  await expect(page.getByText("4,102")).toBeVisible();
});

test("dashboard routes render without horizontal overflow at desktop and tablet widths", async ({ page }) => {
  await logIn(page);
  const routes = [
    "/overview", "/accounts", "/x", "/x/1", "/github", "/github/2",
    "/github/2/repos/1001", "/gitlab", "/gitlab/3", "/gitlab/3/projects/2001",
    "/reddit", "/reddit/4", "/analytics", "/ai", "/settings", "/admin",
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

test("account form exposes selected platform and Reddit access mode", async ({ page }) => {
  await logIn(page);
  await page.goto("/accounts");
  await page.getByRole("button", { name: "Add Account", exact: true }).click();

  const platformButton = (name: string) => page.getByRole("button", { name, exact: true });
  await expect(platformButton("X")).toHaveAttribute("aria-pressed", "true");
  await expect(platformButton("GitHub")).toHaveAttribute("aria-pressed", "false");
  await expect(platformButton("GitLab")).toHaveAttribute("aria-pressed", "false");
  await expect(platformButton("Reddit")).toHaveAttribute("aria-pressed", "false");

  await platformButton("GitHub").click();
  await expect(platformButton("GitHub")).toHaveAttribute("aria-pressed", "true");
  await expect(platformButton("X")).toHaveAttribute("aria-pressed", "false");
  await expect(platformButton("GitLab")).toHaveAttribute("aria-pressed", "false");
  await expect(platformButton("Reddit")).toHaveAttribute("aria-pressed", "false");

  await platformButton("Reddit").click();
  await expect(platformButton("Reddit")).toHaveAttribute("aria-pressed", "true");
  await expect(platformButton("X")).toHaveAttribute("aria-pressed", "false");
  await expect(platformButton("GitHub")).toHaveAttribute("aria-pressed", "false");
  await expect(platformButton("GitLab")).toHaveAttribute("aria-pressed", "false");

  const oauthButton = platformButton("OAuth");
  const publicButton = platformButton("Browser Cookies");
  await expect(oauthButton).toHaveAttribute("aria-pressed", "true");
  await expect(publicButton).toHaveAttribute("aria-pressed", "false");

  await publicButton.click();
  await expect(publicButton).toHaveAttribute("aria-pressed", "true");
  await expect(oauthButton).toHaveAttribute("aria-pressed", "false");

  await oauthButton.click();
  await expect(oauthButton).toHaveAttribute("aria-pressed", "true");
  await expect(publicButton).toHaveAttribute("aria-pressed", "false");
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

test("timezone selector filters and selects options with the keyboard", async ({ page }) => {
  await logIn(page);
  await page.goto("/settings");

  const timezone = page.getByRole("combobox", { name: "Timezone" });
  await timezone.click();
  const search = page.getByPlaceholder("Search timezones...");
  await search.fill("Tokyo");
  await expect(page.getByRole("option", { name: /Asia\/Tokyo/ })).toBeVisible();
  await expect(page.getByRole("option", { name: /Asia\/Shanghai/ })).toHaveCount(0);
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("option", { name: /Asia\/Tokyo/ })).toHaveAttribute("data-selected", "true");
  await page.keyboard.press("Enter");
  await expect(timezone).toContainText("Asia/Tokyo");
  await expect(search).toBeHidden();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("timezone"))).toBe("Asia/Tokyo");
});

test("admin role selection is sent from controlled state, not FormData", async ({ page }) => {
  await logIn(page);
  let createPayload: { username?: string; password?: string; role?: string } | undefined;
  await page.route("**/api/users", async (route) => {
    if (route.request().method() === "POST") {
      createPayload = route.request().postDataJSON();
      await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ ok: true }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ users: [] }) });
  });
  await page.goto("/admin");
  await page.getByLabel("Username").fill("new-member");
  await page.getByLabel("Password", { exact: true }).fill("ValidPassphrase!2026");
  await page.getByLabel("Confirm password").fill("ValidPassphrase!2026");
  const role = page.getByRole("combobox");
  await role.click();
  await page.getByRole("option", { name: "User" }).click();
  await page.getByRole("button", { name: "Create user" }).click();
  await expect.poll(() => createPayload).toMatchObject({ username: "new-member", role: "user" });
});

test("password visibility can be toggled through keyboard focus", async ({ page }) => {
  await page.goto("/login");
  const password = page.getByLabel("Password", { exact: true });
  await password.focus();
  await page.keyboard.press("Tab");
  const showButton = page.getByRole("button", { name: "Show password" });
  await expect(showButton).toBeFocused();
  await expect(showButton).toHaveAccessibleName("Show password");
  await page.keyboard.press("Enter");
  await expect(password).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "Hide password" }).focus();
  await page.keyboard.press("Space");
  await expect(password).toHaveAttribute("type", "password");
});

test("theme tokens remain applied across the requested light and dark themes", async ({ page }) => {
  await logIn(page);
  await page.goto("/settings");
  const cases = [
    { mode: "Light", theme: "Default Light", id: "default-light" },
    { mode: "Dark", theme: "Default Dark", id: "default-dark" },
    { mode: "Light", theme: "Sepia Light", id: "sepia-light" },
    { mode: "Dark", theme: "Sepia Dark", id: "sepia-dark" },
    { mode: "Dark", theme: "Cyber Dark", id: "cyber-dark" },
    { mode: "Dark", theme: "Forest Dark", id: "forest-dark" },
    { mode: "Light", theme: "Sky Light", id: "sky-light" },
    { mode: "Dark", theme: "Rose Dark", id: "rose-dark" },
  ];

  for (const item of cases) {
    await page.getByRole("button", { name: item.mode, exact: true }).click();
    await page.getByRole("combobox", { name: "Theme" }).click();
    await page.getByRole("option", { name: item.theme, exact: true }).click();
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe(item.id);
    await page.goto("/overview");
    const surfaces = await page.evaluate(() => {
      const card = document.querySelector<HTMLElement>("[data-slot=card]");
      const sidebar = document.querySelector<HTMLElement>("[data-sidebar=sidebar]");
      return {
        cardBackground: card ? getComputedStyle(card).backgroundColor : "",
        sidebarBackground: sidebar ? getComputedStyle(sidebar).backgroundColor : "",
        border: getComputedStyle(document.documentElement).getPropertyValue("--border").trim(),
      };
    });
    expect(surfaces.cardBackground, item.id).not.toBe("");
    expect(surfaces.sidebarBackground, item.id).not.toBe("");
    expect(surfaces.border, item.id).not.toBe("");
    await page.goto("/settings");
  }
});
