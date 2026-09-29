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

test("Overview shows portfolio analytics from one ranged GraphQL request", async ({ page }) => {
  const portfolioRanges: string[] = [];
  page.on("request", (request) => {
    if (!request.url().endsWith("/api/graphql") || request.method() !== "POST") return;
    const body = request.postDataJSON() as { query?: string; variables?: { range?: string } };
    if (body.query?.includes("query AnalyticsPortfolio(")) portfolioRanges.push(body.variables?.range ?? "");
  });
  await logIn(page);

  const section = page.getByRole("region", { name: "Web Analytics" });
  await expect(section).toBeVisible();
  const metric = (label: string) => section.getByText(label, { exact: true }).locator("xpath=../..");
  await expect(metric("Tracked Sites").getByText("3", { exact: true })).toBeVisible();
  await expect(metric("Active Sites").getByText("3", { exact: true })).toBeVisible();
  await expect(metric("Views").getByText("12,842", { exact: true })).toBeVisible();
  await expect(metric("Visits").getByText("4,102", { exact: true })).toBeVisible();
  await expect(section.getByText("Top Sites", { exact: true })).toBeVisible();
  for (const [name, host, views, visits] of [
    ["WiFi Lens", "wifi-lens.app", "7,200", "2,300"],
    ["Tazuki", "tazuki.dev", "3,800", "1,200"],
    ["ShiinaPlay", "shiina.play", "1,842", "602"],
  ]) {
    const row = section.getByRole("listitem").filter({ hasText: name });
    await expect(row.getByText(name, { exact: true })).toBeVisible();
    await expect(row.getByText(host, { exact: true })).toBeVisible();
    await expect(row).toContainText(views);
    await expect(row).toContainText(visits);
  }
  await expect(section.getByRole("link", { name: "Open Analytics" })).toHaveAttribute("href", "/analytics");
  await expect(section.getByText(/Visitors|Unique Visitors|Average Daily Visitors/)).toHaveCount(0);
  const sectionOrder = await page.evaluate(() => {
    const globalMetrics = document.querySelector('section[aria-label="Overview"]');
    const analytics = document.querySelector('section[aria-label="Web Analytics"]');
    const pulse = document.querySelector('section[aria-label="Business Pulse"]');
    const follows = (before: Element | null, after: Element | null) =>
      Boolean(before && after && (before.compareDocumentPosition(after) & Node.DOCUMENT_POSITION_FOLLOWING));
    return { metricsBeforeAnalytics: follows(globalMetrics, analytics), analyticsBeforePulse: follows(analytics, pulse) };
  });
  expect(sectionOrder).toEqual({ metricsBeforeAnalytics: true, analyticsBeforePulse: true });
  expect(portfolioRanges).toEqual(["DAYS_7"]);

  for (const [buttonName, range] of [["30D", "DAYS_30"], ["90D", "DAYS_90"]]) {
    const response = page.waitForResponse((candidate) => {
      if (!candidate.url().endsWith("/api/graphql") || candidate.request().method() !== "POST") return false;
      const body = candidate.request().postDataJSON() as { query?: string; variables?: { range?: string } };
      return body.query?.includes("query AnalyticsPortfolio(") === true && body.variables?.range === range;
    });
    await section.getByRole("button", { name: buttonName, exact: true }).click();
    expect((await response).ok()).toBeTruthy();
    await expect(section).toBeVisible();
  }
  expect(portfolioRanges).toEqual(["DAYS_7", "DAYS_30", "DAYS_90"]);
});

test("Portfolio errors stay inside Web Analytics while other overview sections load", async ({ page }) => {
  await logIn(page);
  await page.route("**/api/graphql", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ errors: [{ message: "Internal server error" }] }),
  }));
  await page.goto("/overview");
  await expect(page.getByText("Web Analytics unavailable", { exact: true })).toBeVisible();
  const overviewHealth = page.getByRole("region", { name: "Business Pulse" });
  await expect(overviewHealth.getByText("Business Pulse", { exact: true })).toBeVisible();
  await expect(overviewHealth.getByText("Fetch health", { exact: true })).toBeVisible();
});

test("Portfolio empty and no-traffic states keep setup and site summaries useful", async ({ page }) => {
  await logIn(page);
  await page.route("**/api/graphql", async (route) => {
    const response = await route.fetch();
    const payload = await response.json();
    const portfolio = payload.data?.analytics?.portfolio;
    if (portfolio) {
      portfolio.summary = { trackedSites: 0, activeSites: 0, views: 0, visits: 0 };
      portfolio.previousSummary = { views: 0, visits: 0 };
      portfolio.sites = [];
    }
    await route.fulfill({ response, body: JSON.stringify(payload) });
  });
  await page.goto("/overview");
  const section = page.getByRole("region", { name: "Web Analytics" });
  await expect(section.getByText("No websites are being tracked yet.")).toBeVisible();
  await expect(section.getByRole("link", { name: "Set up Web Analytics" })).toHaveAttribute("href", "/analytics");
  await expect(section.getByText("Tracked Sites", { exact: true })).toHaveCount(0);

  await page.unroute("**/api/graphql");
  await page.route("**/api/graphql", async (route) => {
    const response = await route.fetch();
    const payload = await response.json();
    const portfolio = payload.data?.analytics?.portfolio;
    if (portfolio) {
      portfolio.summary = { trackedSites: 1, activeSites: 0, views: 0, visits: 0 };
      portfolio.previousSummary = { views: 0, visits: 0 };
      portfolio.sites = [{ id: 9, name: "Quiet Site", host: "quiet.example", views: 0, visits: 0 }];
    }
    await route.fulfill({ response, body: JSON.stringify(payload) });
  });
  await page.reload();
  await expect(section.getByText("No traffic recorded in this period.")).toBeVisible();
  await expect(section.getByText("Quiet Site", { exact: true })).toBeVisible();
  await expect(section.getByText("quiet.example", { exact: true })).toBeVisible();
});

test("Portfolio rows remain responsive without horizontal overflow", async ({ page }) => {
  await logIn(page);
  const section = page.getByRole("region", { name: "Web Analytics" });
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(section.getByText("Top Sites", { exact: true })).toBeVisible();
    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth,
    }));
    expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport);
  }
});

test("Top Sites limits rows to five and reports the remaining site count", async ({ page }) => {
  await logIn(page);
  await page.route("**/api/graphql", async (route) => {
    const response = await route.fetch();
    const payload = await response.json();
    const portfolio = payload.data?.analytics?.portfolio;
    if (portfolio) {
      portfolio.summary = { trackedSites: 7, activeSites: 7, views: 28, visits: 14 };
      portfolio.previousSummary = { views: 24, visits: 12 };
      portfolio.sites = Array.from({ length: 7 }, (_, index) => ({
        id: index + 1,
        name: `Site ${index + 1}`,
        host: `site-${index + 1}.example`,
        views: 4,
        visits: 2,
      }));
    }
    await route.fulfill({ response, body: JSON.stringify(payload) });
  });
  await page.goto("/overview");
  const section = page.getByRole("region", { name: "Web Analytics" });
  await expect(section.getByRole("listitem")).toHaveCount(5);
  await expect(section.getByText("+ 2 more sites", { exact: true })).toBeVisible();
  await expect(section.getByText("Site 6", { exact: true })).toHaveCount(0);
});

test("Web Analytics adds and selects sites, then switches the complete dashboard across ranges", async ({ page }) => {
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
  await expect(page.getByRole("heading", { name: "Tracking Setup" })).toBeVisible();
  const code = page.getByRole("region", { name: "Tracking Setup" }).locator("code");
  await expect(code).toContainText(createdSite.site_key);
  await expect(code).toContainText("https://dashboard.example/a/t.js");
  await expect(page.getByText("Receiving data")).toBeVisible();
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByRole("button", { name: "Copy tracking code" }).click();
  await expect(page.getByText("Tracking code copied", { exact: true })).toBeVisible();
  const selector = page.getByRole("combobox", { name: "Select a website" });
  await expect(selector).toBeVisible();
  await selector.click();
  await page.getByRole("option", { name: /Example Site/ }).click();
  await expect(page.getByText("Last 7 days")).toBeVisible();
  await expect(page.getByText("Views").first()).toBeVisible();
  await expect(page.getByText("Average Daily Visitors").first()).toBeVisible();
  await expect(page.getByText("Visits").first()).toBeVisible();
  await expect(page.getByText("12,842")).toBeVisible();
  await expect(page.getByText("419")).toBeVisible();
  await expect(page.getByText("4,102")).toBeVisible();
  await expect(page.getByText("+12.5% vs previous period")).toBeVisible();
  await expect(page.getByText("+4.5% vs previous period")).toBeVisible();
  await expect(page.getByText("+6.0% vs previous period")).toBeVisible();
  await expect(page.getByText(/Infinity/)).toHaveCount(0);
  const glanceHeading = page.getByRole("heading", { name: "At a glance", level: 2 });
  await expect(glanceHeading).toBeVisible();
  const glanceCard = glanceHeading.locator("xpath=../..");
  await expect(glanceCard.getByText("Top Page", { exact: true })).toBeVisible();
  await expect(glanceCard.getByText("/", { exact: true })).toBeVisible();
  await expect(glanceCard.getByText("42 Views", { exact: true })).toBeVisible();
  await expect(glanceCard.getByText("Top Source", { exact: true })).toBeVisible();
  await expect(glanceCard.getByText("Direct", { exact: true })).toBeVisible();
  await expect(glanceCard.getByText("2,100 Visits", { exact: true })).toBeVisible();
  await expect(glanceCard.getByText("Japan (JP)", { exact: true })).toBeVisible();
  await expect(glanceCard.getByText("4,280 Views", { exact: true })).toBeVisible();
  await expect(glanceCard.getByText("launch", { exact: true })).toBeVisible();
  await expect(glanceCard.getByText("newsletter / email · 420 Visits", { exact: true })).toBeVisible();
  const pageOrder = await page.evaluate(() => {
    const metricGrid = document.querySelector('[data-slot="metric-grid"]');
    const glance = document.querySelector('section[aria-labelledby="analytics-at-a-glance-heading"]');
    const trafficCard = document.querySelector('[data-slot="chart-card-title"]')?.closest('[data-slot="card"]');
    const follows = (before: Element | null | undefined, after: Element | null | undefined) =>
      Boolean(before && after && (before.compareDocumentPosition(after) & Node.DOCUMENT_POSITION_FOLLOWING));
    return { metricsBeforeGlance: follows(metricGrid, glance), glanceBeforeTraffic: follows(glance, trafficCard) };
  });
  expect(pageOrder).toEqual({ metricsBeforeGlance: true, glanceBeforeTraffic: true });
  await expect(page.getByText("Traffic over time", { exact: true })).toBeVisible();
  await expect(page.getByRole("img", { name: "Traffic over time" })).toBeVisible();
  await expect(page.getByRole("group", { name: "Visitor geography" })).toBeVisible();
  const japanShape = page.locator('[data-country-code="JP"]');
  await expect(japanShape).toHaveAttribute("data-active", "true");
  await expect(page.locator('[data-country-code="US"]')).toHaveAttribute("data-active", "true");
  await expect(page.locator('[data-country-code="DE"]')).toHaveAttribute("data-active", "true");
  const map = page.locator('[data-testid="analytics-world-map"] svg[role="group"]');
  const worldView = await map.getAttribute("viewBox");
  await expect(map).toHaveCSS("overflow", "hidden");
  await expect(map).toHaveAttribute("data-zoom-level", "1.00");
  await page.getByRole("button", { name: "Zoom in" }).click();
  await expect(map).not.toHaveAttribute("viewBox", worldView!);
  await expect(map).toHaveAttribute("data-zoom-level", "1.50");

  const zoomedView = await map.getAttribute("viewBox");
  await map.scrollIntoViewIfNeeded();
  const mapBounds = await map.boundingBox();
  expect(mapBounds).not.toBeNull();
  await page.mouse.move(mapBounds!.x + mapBounds!.width * 0.6, mapBounds!.y + mapBounds!.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(mapBounds!.x + mapBounds!.width * 0.65, mapBounds!.y + mapBounds!.height * 0.5);
  await page.mouse.up();
  await expect(map).not.toHaveAttribute("viewBox", zoomedView!);

  await page.getByRole("button", { name: "Reset map" }).click();
  await expect(map).toHaveAttribute("viewBox", worldView!);
  await map.press("+");
  await expect(map).toHaveAttribute("data-zoom-level", "1.25");
  for (let step = 0; step < 10; step++) await map.press("+");
  await expect(map).toHaveAttribute("data-zoom-level", "8.00");
  await expect(page.getByRole("button", { name: "Zoom in" })).toBeDisabled();
  for (let step = 0; step < 20; step++) await map.press("ArrowUp");
  for (let step = 0; step < 3; step++) await map.press("ArrowRight");
  await page.locator('[data-country-code="DE"]').focus();
  await expect(page.getByRole("tooltip")).toContainText("Germany");
  await page.getByRole("button", { name: "Reset map" }).click();
  await expect(map).toHaveAttribute("data-zoom-level", "1.00");
  await japanShape.focus();
  await expect(page.getByRole("tooltip")).toContainText("Japan");
  await expect(page.getByRole("tooltip")).toContainText(/views/i);
  for (const title of ["Top Pages", "Referrers", "Countries", "Browsers", "Operating Systems", "Devices"]) {
    await expect(page.getByRole("heading", { name: title, level: 2 })).toBeVisible();
  }
  await expect(page.getByRole("heading", { name: "Acquisition", level: 2 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Entry Pages", level: 2 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Campaigns", level: 2 })).toBeVisible();
  const referrerCard = page.getByRole("heading", { name: "Referrers", level: 2 }).locator("xpath=../..");
  const entryPageCard = page.getByRole("heading", { name: "Entry Pages", level: 2 }).locator("xpath=../..");
  await expect(referrerCard.getByText("Visits", { exact: true })).toBeVisible();
  await expect(referrerCard.getByText("Views", { exact: true })).toHaveCount(0);
  await expect(entryPageCard.getByText("Visits", { exact: true })).toBeVisible();
  await expect(entryPageCard.getByTitle("/", { exact: true })).toBeVisible();
  await expect(entryPageCard.getByTitle("/pricing", { exact: true })).toBeVisible();
  await expect(entryPageCard.getByTitle("/docs", { exact: true })).toBeVisible();
  const campaignCard = page.getByRole("heading", { name: "Campaigns", level: 2 }).locator("xpath=../..");
  await expect(campaignCard.getByText("Visits", { exact: true })).toBeVisible();
  await expect(campaignCard.getByTitle("launch · newsletter / email", { exact: true })).toBeVisible();
  await expect(campaignCard.getByTitle("wifi-tool · google / cpc", { exact: true })).toBeVisible();
  await expect(campaignCard.getByText("10.2%", { exact: true })).toBeVisible();
  await expect(referrerCard.getByText("Direct", { exact: true })).toBeVisible();
  await expect(referrerCard.getByText("google.com", { exact: true })).toBeVisible();
  const countryCard = page.getByRole("heading", { name: "Countries", level: 2 }).locator("xpath=../..");
  await expect(countryCard.getByText("Japan (JP)", { exact: true })).toBeVisible();
  await expect(page.getByText("Safari", { exact: true })).toBeVisible();
  await expect(page.getByText("macOS", { exact: true })).toBeVisible();
  await expect(page.getByText("Desktop", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Tracking Setup" })).toBeVisible();

  const thirtyDayResponse = page.waitForResponse((response) => {
    if (!response.url().endsWith("/api/graphql") || response.request().method() !== "POST") return false;
    return JSON.parse(response.request().postData() ?? "{}").variables?.range === "DAYS_30";
  });
  await page.getByRole("button", { name: "30D" }).click();
  const thirtyDayData = await thirtyDayResponse;
  const thirtyDayDashboard = (await thirtyDayData.json()).data.analytics.dashboard;
  expect(thirtyDayDashboard.timeline).toHaveLength(30);
  expect(thirtyDayDashboard.acquisition.campaigns).toHaveLength(2);
  await expect(page.getByText("Last 30 days")).toBeVisible();
  await expect(glanceHeading).toBeVisible();
  await expect(page.getByRole("button", { name: "30D" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Average Daily Visitors").first()).toBeVisible();

  const ninetyDayResponse = page.waitForResponse((response) => {
    if (!response.url().endsWith("/api/graphql") || response.request().method() !== "POST") return false;
    return JSON.parse(response.request().postData() ?? "{}").variables?.range === "DAYS_90";
  });
  await page.getByRole("button", { name: "90D" }).click();
  const ninetyDayData = await ninetyDayResponse;
  const ninetyDayDashboard = (await ninetyDayData.json()).data.analytics.dashboard;
  expect(ninetyDayDashboard.timeline).toHaveLength(90);
  expect(ninetyDayDashboard.acquisition.campaigns).toHaveLength(2);
  await expect(page.getByText("Last 90 days")).toBeVisible();
  await expect(glanceHeading).toBeVisible();
  await expect(page.getByRole("button", { name: "90D" })).toHaveAttribute("aria-pressed", "true");
});

test("Analytics card headers have the shared vertical inset", async ({ page }) => {
  await logIn(page);
  await page.goto("/analytics");
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const title of ["Traffic over time", "Visitor geography", "Top Pages", "Countries", "Browsers", "Operating Systems", "Devices", "Referrers", "Entry Pages", "Campaigns"]) {
    const heading = page.locator('[data-slot="card-title"]').filter({ hasText: title }).first();
    const card = heading.locator("xpath=ancestor::*[@data-slot='card'][1]");
    const cardBounds = await card.boundingBox();
    const headingBounds = await heading.boundingBox();
    expect(cardBounds, `${title} card should be rendered`).not.toBeNull();
    expect(headingBounds, `${title} heading should be rendered`).not.toBeNull();
    expect(headingBounds!.y - cardBounds!.y, `${title} heading inset from card top`).toBeGreaterThanOrEqual(16);
  }
});

test("dashboard failures are reported while tracking setup remains available", async ({ page }) => {
  await logIn(page);
  await page.route("**/api/graphql", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ errors: [{ message: "Internal server error", extensions: { code: "INTERNAL_SERVER_ERROR" } }] }),
  }));
  await page.goto("/analytics");
  await expect(page.getByText("Analytics data unavailable")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Tracking Setup" })).toBeVisible();
});

test("dashboard shows separate acquisition empty states when the selected site has no visits", async ({ page }) => {
  await logIn(page);
  await page.route("**/api/graphql", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ data: { analytics: { dashboard: {
      period: { days: 7, timezone: "UTC", startDate: "2026-09-23", endDate: "2026-09-29" },
      previousPeriod: { days: 7, timezone: "UTC", startDate: "2026-09-16", endDate: "2026-09-22" },
      overview: { views: 0, visits: 0, visitorDays: 0 },
      previousOverview: { views: 0, visits: 0, visitorDays: 0 },
      timeline: Array.from({ length: 7 }, (_, i) => ({ date: `2026-09-${String(i + 23).padStart(2, "0")}`, views: 0, visitors: 0, visits: 0 })),
      topPages: [],
      dimensions: { countries: [], browsers: [], operatingSystems: [], devices: [] },
      acquisition: { totalVisits: 0, referrers: [], entryPages: [], campaigns: [] },
    } } } }),
  }));
  await page.goto("/analytics");
  await expect(page.getByText("No acquisition referrer data in this period")).toBeVisible();
  await expect(page.getByText("No entry page data in this period")).toBeVisible();
  await expect(page.getByText("No campaign data in this period")).toBeVisible();
  await expect(page.getByText("No analytics data in this period")).toBeVisible();
  await expect(page.getByRole("heading", { name: "At a glance", level: 2 })).toBeVisible();
  await expect(page.getByRole("img", { name: "Traffic over time" })).toBeVisible();
});

test("At a glance keeps its campaign cell when campaign data is empty", async ({ page }) => {
  await logIn(page);
  await page.route("**/api/graphql", async (route) => {
    const response = await route.fetch();
    const payload = await response.json();
    if (payload.data?.analytics?.dashboard) payload.data.analytics.dashboard.acquisition.campaigns = [];
    await route.fulfill({ response, body: JSON.stringify(payload) });
  });
  await page.goto("/analytics");
  const glance = page.getByRole("heading", { name: "At a glance", level: 2 }).locator("xpath=../..");
  await expect(glance.getByText("Top Campaign", { exact: true })).toBeVisible();
  await expect(glance.getByText("—", { exact: true })).toBeVisible();
  await expect(glance.getByText("No campaign data", { exact: true })).toBeVisible();
  await expect(glance.getByText("Top Page", { exact: true })).toBeVisible();
});

test("At a glance truncates long summary values without mobile overflow", async ({ page }) => {
  await logIn(page);
  await page.route("**/api/graphql", async (route) => {
    const response = await route.fetch();
    const payload = await response.json();
    const dashboard = payload.data?.analytics?.dashboard;
    if (dashboard) {
      dashboard.topPages[0] = { path: "/this/is/a/very/long/page/path/that/should/truncate", views: 42 };
      dashboard.acquisition.referrers[0] = { referrer: "a-very-long-source-hostname.example", visits: 7 };
    }
    await route.fulfill({ response, body: JSON.stringify(payload) });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/analytics");
  const glance = page.getByRole("heading", { name: "At a glance", level: 2 }).locator("xpath=../..");
  await expect(glance.getByTitle("/this/is/a/very/long/page/path/that/should/truncate")).toBeVisible();
  await expect(glance.getByTitle("a-very-long-source-hostname.example")).toBeVisible();
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport);
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
