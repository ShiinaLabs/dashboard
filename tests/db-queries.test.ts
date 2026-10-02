import { gzipSync, gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import * as ascFacts from "../lib/repositories/app-store-facts";
import { mapAnalyticsReport, analyticsReportDefinitions, type AnalyticsReportKind } from "../lib/infra/app-store/report-mapping";
import { parseAnalyticsTsv } from "../lib/infra/app-store/analytics-tsv";
import { syncAppStoreAnalytics, syncAppStoreRevenue } from "../lib/services/app-store-sync";
import { getAppStoreRevenueDashboard } from "../lib/services/app-store-revenue";
import { getLogger } from "../lib/logger";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { exportPKCS8, generateKeyPair } from "jose";
import * as appStoreService from "../lib/services/app-store";
import * as appStoreRepo from "../lib/repositories/app-store";
import * as appStoreAnalyticsRepo from "../lib/repositories/app-store-analytics";
import { getAppStoreAnalyticsStatus, setupAppStoreAnalytics } from "../lib/services/app-store-analytics";
import { getAppStoreAnalyticsDashboard, listEnabledAnalyticsApps } from "../lib/services/app-store-analytics-reporting";
import { AppStoreConnectClient, AppStoreApiError } from "../lib/infra/app-store/AppStoreConnectClient";
import { initCrypto, decrypt } from "../lib/crypto";
import { getTestDatabaseConfig, resetTestDb, getTestPool, closeTestPool } from "./setup";
import { closeDb, getDb, initPgPool } from "../lib/db/connection";
import { github_repos } from "@/db/schema";
import { hasGithubTrackingRelation, getGithubOverview } from "../lib/repositories/github";
import {
  listGithubWatchlist,
  listGithubWatchedRepoIds,
  setGithubWatchlist,
  githubWatchedReposFilter,
} from "../lib/repositories/github-watchlist";
import {
  listGithubSourceRows,
  setGithubSources,
  upsertGithubSource,
  markGithubTrackingError,
} from "../lib/repositories/github-sources";
import * as usersQ from "../lib/repositories/users";
import * as accountsQ from "../lib/repositories/accounts";
import * as twitterQ from "../lib/repositories/twitter";
import * as redditQ from "../lib/repositories/reddit";
import * as githubQ from "../lib/repositories/github";
import * as gitlabQ from "../lib/repositories/gitlab";
import {
  finishFetchRun,
  getFailureStreaks,
  getRecentRuns,
  startFetchRun,
} from "../lib/repositories/fetch-runs";
import { getTopContent } from "../lib/services/top-content";
import { SyncTelemetry } from "../lib/application/usecases/SyncTelemetry";
import { createUser } from "../lib/services/users";
import { createAnalyticsSite, getAnalyticsSiteById, getAnalyticsSiteByKey, getAnalyticsSites, renameAnalyticsSite as renameAnalyticsSiteRecord } from "../lib/repositories/analytics-sites";
import { getAnalyticsAcquisitionReport, getAnalyticsDashboardReport, getAnalyticsGlobalDashboardReport, getAnalyticsPortfolioReport, getAnalyticsTrafficReport, insertAnalyticsEvent } from "../lib/repositories/analytics-events";
import { ensureAnalyticsSiteConstraints, ensureSchemaColumns } from "../lib/setup";
import { collectAnalyticsEvent } from "../lib/services/analytics-collector";

beforeAll(async () => {
  const databaseConfig = getTestDatabaseConfig();
  await resetTestDb();
  await initPgPool(databaseConfig);
});

describe("fetch run queries", () => {
  let accountId: number;

  beforeAll(async () => {
    const user = await usersQ.insertUser({
      username: `fetch_runs_${Date.now()}`,
      password_hash: "hash",
      role: "user",
    });
    const pool = getTestPool();
    const { rows } = await pool.query(
      `INSERT INTO accounts (owner_id, screen_name, platform, auth_token, fetch_interval)
       VALUES ($1, 'fetch_runs_user', 'github', 'token', 30) RETURNING id`,
      [user.id],
    );
    accountId = rows[0].id;
  });

  it("records outcomes, capability gaps, ordering, and failure streaks", async () => {
    const success = await startFetchRun(accountId, "scheduler");
    await finishFetchRun({
      id: success.id,
      status: "success",
      capabilityGaps: [{ capability: "github_traffic", message: "PAT needs repo scope" }],
    });

    const failure = await startFetchRun(accountId, "manual");
    await finishFetchRun({ id: failure.id, status: "failed", errorMessage: "API failed" });

    const partial = await startFetchRun(accountId, "manual");
    await finishFetchRun({ id: partial.id, status: "partial", errorMessage: "Content partially refreshed" });

    const runs = (await getRecentRuns([accountId])).get(accountId);
    expect(runs?.map((run) => run.status)).toEqual(["partial", "failed", "success"]);
    expect(runs?.[2].capability_gaps).toEqual([
      { capability: "github_traffic", message: "PAT needs repo scope" },
    ]);
    expect(runs?.every((run) => typeof run.duration_ms === "number")).toBe(true);

    const streaks = await getFailureStreaks([accountId]);
    expect(streaks.has(accountId)).toBe(false);
  });
});

afterAll(async () => {
  await closeDb();
  await closeTestPool();
});

describe("users queries", () => {
  const testUsername = `testuser_${Date.now()}`;

  it("creates a user", async () => {
    const user = await usersQ.insertUser({ username: testUsername, password_hash: "hash123", role: "user" });
    expect(user).toBeDefined();
    expect(user.username).toBe(testUsername);
    expect(user.role).toBe("user");
    expect(user.id).toBeGreaterThan(0);
  });

  it("finds user by username", async () => {
    const user = await usersQ.getUserByUsername(testUsername);
    expect(user).toBeDefined();
    expect(user!.username).toBe(testUsername);
  });

  it("lists all users", async () => {
    const list = await usersQ.getUsers();
    expect(list.length).toBeGreaterThanOrEqual(1);
    expect(list.some(u => u.username === testUsername)).toBe(true);
  });

  it("soft-deletes a user", async () => {
    const user = (await usersQ.getUserByUsername(testUsername))!;
    await usersQ.deleteUser(user.id);
    const deleted = await usersQ.getUserByUsername(testUsername);
    expect(deleted).toBeUndefined();
  });

  it("revives soft-deleted user on re-creation", async () => {
    const revived = await createUser(testUsername, "a-longer-test-password", "user");
    expect(revived).toBeDefined();
    expect(revived.username).toBe(testUsername);
  });
});

describe("analytics site queries", () => {
  it("updates only site name and updated_at when renaming", async () => {
    const suffix = Date.now();
    const owner = await usersQ.insertUser({ username: `analytics_rename_${suffix}`, password_hash: "hash", role: "user" });
    const site = await createAnalyticsSite({ owner_id: owner.id, name: "Before", site_key: `rename-${suffix}`, host: "fixed.example" });
    const renamed = await renameAnalyticsSiteRecord(site.id, "After");
    expect(renamed).toMatchObject({ id: site.id, name: "After", site_key: site.site_key, host: site.host });
    expect(renamed?.updated_at).not.toBe(site.updated_at);
  });

  it("scopes by owner, enforces global keys, and excludes soft-deleted sites", async () => {
    const suffix = Date.now();
    const ownerA = await usersQ.insertUser({ username: `analytics_a_${suffix}`, password_hash: "hash", role: "user" });
    const ownerB = await usersQ.insertUser({ username: `analytics_b_${suffix}`, password_hash: "hash", role: "user" });
    const siteA = await createAnalyticsSite({ owner_id: ownerA.id, name: "Site A", site_key: `same-${suffix}`, host: "a.example" });
    const siteB = await createAnalyticsSite({ owner_id: ownerB.id, name: "Site B", site_key: `other-${suffix}`, host: "b.example" });
    await expect(createAnalyticsSite({ owner_id: ownerB.id, name: "Duplicate", site_key: siteA.site_key, host: "duplicate.example" }))
      .rejects.toMatchObject({ cause: { code: "23505" } });

    expect((await getAnalyticsSites(ownerA.id)).map((site) => site.id)).toEqual([siteA.id]);
    expect((await getAnalyticsSites(ownerB.id)).map((site) => site.id)).toEqual([siteB.id]);
    expect(await getAnalyticsSites()).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: siteA.id }), expect.objectContaining({ id: siteB.id }),
    ]));

    await getTestPool().query("UPDATE analytics_sites SET deleted_at = NOW() WHERE id = $1", [siteA.id]);
    expect((await getAnalyticsSites(ownerA.id)).map((site) => site.id)).toEqual([]);
    await expect(getAnalyticsSiteById(siteA.id)).resolves.toBeUndefined();
  });

  it("upgrades the legacy owner-scoped index and fails closed on existing duplicates", async () => {
    const suffix = Date.now();
    const ownerA = await usersQ.insertUser({ username: `analytics_upgrade_a_${suffix}`, password_hash: "hash", role: "user" });
    const ownerB = await usersQ.insertUser({ username: `analytics_upgrade_b_${suffix}`, password_hash: "hash", role: "user" });
    const pool = getTestPool();

    await pool.query("DROP INDEX IF EXISTS idx_analytics_sites_site_key");
    await pool.query("CREATE UNIQUE INDEX idx_analytics_sites_owner_site_key ON analytics_sites(owner_id, site_key)");
    const legacyKey = `legacy-duplicate-${suffix}`;
    await pool.query(
      "INSERT INTO analytics_sites(owner_id, name, site_key, host) VALUES ($1, 'Legacy A', $3, 'a.example'), ($2, 'Legacy B', $3, 'b.example')",
      [ownerA.id, ownerB.id, legacyKey],
    );

    await expect(ensureAnalyticsSiteConstraints(pool)).rejects.toThrow(
      "Duplicate analytics site keys detected; resolve them before startup can continue safely.",
    );
    const legacyRows = await pool.query("SELECT owner_id, site_key FROM analytics_sites WHERE site_key = $1 ORDER BY owner_id", [legacyKey]);
    expect(legacyRows.rows).toEqual([{ owner_id: ownerA.id, site_key: legacyKey }, { owner_id: ownerB.id, site_key: legacyKey }]);
    const indexesAfterFailure = await pool.query("SELECT indexname FROM pg_indexes WHERE tablename = 'analytics_sites'");
    expect(indexesAfterFailure.rows.map((row: { indexname: string }) => row.indexname)).toContain("idx_analytics_sites_owner_site_key");
    expect(indexesAfterFailure.rows.map((row: { indexname: string }) => row.indexname)).not.toContain("idx_analytics_sites_site_key");

    await pool.query("DELETE FROM analytics_sites WHERE owner_id = $1 AND site_key = $2", [ownerB.id, legacyKey]);
    await ensureAnalyticsSiteConstraints(pool);
    const indexesAfterUpgrade = await pool.query("SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'analytics_sites'");
    expect(indexesAfterUpgrade.rows).toContainEqual(expect.objectContaining({
      indexname: "idx_analytics_sites_site_key",
      indexdef: expect.stringContaining("CREATE UNIQUE INDEX idx_analytics_sites_site_key ON public.analytics_sites USING btree (site_key)"),
    }));
    expect(indexesAfterUpgrade.rows.map((row: { indexname: string }) => row.indexname)).not.toContain("idx_analytics_sites_owner_site_key");
    await expect(getAnalyticsSiteById((await getAnalyticsSites(ownerA.id)).find((site) => site.site_key === legacyKey)!.id))
      .resolves.toMatchObject({ site_key: legacyKey });
  });
});

describe("analytics portfolio queries", () => {
  const event = (site_id: number, visit: boolean) => insertAnalyticsEvent({
    site_id,
    path: "/",
    referrer_host: "",
    os: "Other",
    browser: "Other",
    country: "Unknown",
    device_type: "Desktop",
    visitor: false,
    visit,
    utm_source: "",
    utm_medium: "",
    utm_campaign: "",
  });

  it("isolates owner scope, excludes soft-deleted sites, includes zero-traffic sites, and keeps portfolio sums invariant", async () => {
    const suffix = Date.now();
    const owner = await usersQ.insertUser({ username: `analytics_portfolio_owner_${suffix}`, password_hash: "hash", role: "user" });
    const otherOwner = await usersQ.insertUser({ username: `analytics_portfolio_other_${suffix}`, password_hash: "hash", role: "user" });
    const makeSite = (name: string, owner_id = owner.id) => createAnalyticsSite({
      owner_id, name, site_key: `portfolio-${suffix}-${name}-${Math.random()}`, host: `${name.toLowerCase()}.portfolio.example`,
    });
    const cedar = await makeSite("Cedar");
    const alpha = await makeSite("Alpha");
    const beta = await makeSite("Beta");
    const alder = await makeSite("Alder");
    const sameFirst = await makeSite("Same");
    const sameSecond = await makeSite("Same");
    const zero = await makeSite("Zero");
    const deleted = await makeSite("Deleted");
    const foreign = await makeSite("Foreign", otherOwner.id);
    for (let index = 0; index < 3; index += 1) await event(alpha.id, index < 2);
    for (let index = 0; index < 3; index += 1) await event(beta.id, index < 1);
    for (const site of [cedar, alder]) for (let index = 0; index < 2; index += 1) await event(site.id, index < 1);
    await event(sameFirst.id, true);
    await event(sameSecond.id, true);
    for (let index = 0; index < 20; index += 1) await event(deleted.id, true);
    for (let index = 0; index < 50; index += 1) await event(foreign.id, index < 30);
    await getTestPool().query("UPDATE analytics_sites SET deleted_at = NOW() WHERE id = $1", [deleted.id]);

    const report = await getAnalyticsPortfolioReport(owner.id, "UTC", 7);
    expect(report.summary).toEqual({ trackedSites: 7, activeSites: 6, views: 12, visits: 7 });
    expect(report.sites.map((site) => site.name)).toEqual(["Alpha", "Beta", "Alder", "Cedar", "Same", "Same", "Zero"]);
    expect(report.sites.filter((site) => site.name === "Same").map((site) => site.id)).toEqual([sameFirst.id, sameSecond.id]);
    expect(report.sites.at(-1)).toMatchObject({ id: zero.id, views: 0, visits: 0 });
    expect(report.sites.some((site) => [deleted.id, foreign.id].includes(site.id))).toBe(false);
    expect(report.sites.reduce((sum, site) => sum + site.views, 0)).toBe(report.summary.views);
    expect(report.sites.reduce((sum, site) => sum + site.visits, 0)).toBe(report.summary.visits);

    const adminReport = await getAnalyticsPortfolioReport(undefined, "UTC", 7);
    const adminSiteIds = adminReport.sites.map((site) => site.id);
    expect(adminSiteIds).toEqual(expect.arrayContaining([
      cedar.id, alpha.id, beta.id, alder.id, sameFirst.id, sameSecond.id, zero.id, foreign.id,
    ]));
    expect(adminSiteIds).not.toContain(deleted.id);
    expect(adminReport.summary.trackedSites).toBe(adminReport.sites.length);
    expect(adminReport.summary.activeSites).toBe(adminReport.sites.filter((site) => site.views > 0).length);
    expect(adminReport.sites.reduce((sum, site) => sum + site.views, 0)).toBe(adminReport.summary.views);
    expect(adminReport.sites.reduce((sum, site) => sum + site.visits, 0)).toBe(adminReport.summary.visits);
  });

  it("returns a valid empty portfolio", async () => {
    const owner = await usersQ.insertUser({ username: `analytics_portfolio_empty_${Date.now()}`, password_hash: "hash", role: "user" });
    const report = await getAnalyticsPortfolioReport(owner.id, "UTC", 7);
    expect(report.summary).toEqual({ trackedSites: 0, activeSites: 0, views: 0, visits: 0 });
    expect(report.previousSummary).toEqual({ views: 0, visits: 0 });
    expect(report.sites).toEqual([]);
  });

  it.each([7, 30, 90])("uses equal %i-day viewer-local calendar periods and excludes both outside boundaries", async (days) => {
    const suffix = `${Date.now()}_${days}`;
    const owner = await usersQ.insertUser({ username: `analytics_portfolio_bounds_${suffix}`, password_hash: "hash", role: "user" });
    const site = await createAnalyticsSite({ owner_id: owner.id, name: "Bounds", site_key: `portfolio-bounds-${suffix}`, host: `portfolio-bounds-${suffix}.example` });
    const insertRelative = async (daysAgo: number, visit: boolean, atMidnight = false) => getTestPool().query(`
      INSERT INTO analytics_events(site_id, path, referrer_host, os, browser, country, device_type, visitor, visit, recorded_at)
      SELECT $1, '/', '', 'Other', 'Other', 'Unknown', 'Desktop', FALSE, $3,
        ((((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo')::date - $2::integer)::timestamp AT TIME ZONE 'Asia/Tokyo')
          + CASE WHEN $4 THEN INTERVAL '0 hours' ELSE INTERVAL '12 hours' END)
    `, [site.id, daysAgo, visit, atMidnight]);
    await insertRelative(0, true);
    await insertRelative(days - 1, false, true);
    await insertRelative(days, true);
    await insertRelative(days * 2 - 1, false, true);
    await insertRelative(days * 2, true, true);
    await insertRelative(-1, true, true);

    const report = await getAnalyticsPortfolioReport(owner.id, "Asia/Tokyo", days);
    const shiftDate = (dateText: string, offset: number) => {
      const date = new Date(`${dateText}T00:00:00.000Z`);
      date.setUTCDate(date.getUTCDate() + offset);
      return date.toISOString().slice(0, 10);
    };
    expect(report.period.days).toBe(days);
    expect(shiftDate(report.period.startDate, days - 1)).toBe(report.period.endDate);
    expect(shiftDate(report.previousPeriod.startDate, days - 1)).toBe(report.previousPeriod.endDate);
    expect(shiftDate(report.previousPeriod.endDate, 1)).toBe(report.period.startDate);
    expect(report.summary).toEqual({ trackedSites: 1, activeSites: 1, views: 2, visits: 1 });
    expect(report.previousSummary).toEqual({ views: 2, visits: 1 });
  });
});

describe("analytics global dashboard queries", () => {
  const insertVisit = (siteId: number, options: { referrer?: string; source?: string; medium?: string; campaign?: string } = {}) => getTestPool().query(`
    INSERT INTO analytics_events(site_id, path, referrer_host, os, browser, country, device_type, visitor, visit, utm_source, utm_medium, utm_campaign)
    VALUES ($1, '/', $2, 'macOS', 'Safari', 'JP', 'Desktop', FALSE, TRUE, $3, $4, $5)
  `, [siteId, options.referrer ?? "google.com", options.source ?? "newsletter", options.medium ?? "email", options.campaign ?? "launch"]);

  const makeSite = (ownerId: number, name: string, suffix: string) => createAnalyticsSite({
    owner_id: ownerId, name, site_key: `global-${suffix}-${Math.random()}`, host: `${suffix}.global.example`,
  });

  it("enforces owner/admin scope and preserves cross-site referrers, site-aware campaigns, and zero-traffic sites", async () => {
    const suffix = Date.now();
    const owner = await usersQ.insertUser({ username: `analytics_global_owner_${suffix}`, password_hash: "hash", role: "user" });
    const otherOwner = await usersQ.insertUser({ username: `analytics_global_other_${suffix}`, password_hash: "hash", role: "user" });
    const alpha = await makeSite(owner.id, "Alpha", `alpha-${suffix}`);
    const beta = await makeSite(owner.id, "Beta", `beta-${suffix}`);
    const viewOnly = await makeSite(owner.id, "View Only", `view-only-${suffix}`);
    const zero = await makeSite(owner.id, "Zero", `zero-${suffix}`);
    const deleted = await makeSite(owner.id, "Deleted", `deleted-${suffix}`);
    const foreign = await makeSite(otherOwner.id, "Foreign", `foreign-${suffix}`);
    for (let index = 0; index < 3; index += 1) await insertVisit(alpha.id);
    for (let index = 0; index < 2; index += 1) await insertVisit(beta.id);
    await getTestPool().query(`
      INSERT INTO analytics_events(site_id, path, referrer_host, os, browser, country, device_type, visitor, visit, utm_source, utm_medium, utm_campaign)
      VALUES ($1, '/', 'excluded.example', 'Linux', 'Firefox', 'DE', 'Mobile', FALSE, FALSE, 'not', 'a-visit', 'ignored')
    `, [viewOnly.id]);
    for (let index = 0; index < 4; index += 1) await insertVisit(deleted.id, { source: "deleted", medium: "email", campaign: "deleted" });
    for (let index = 0; index < 5; index += 1) await insertVisit(foreign.id, { source: "foreign", medium: "email", campaign: "foreign" });
    await getTestPool().query("UPDATE analytics_sites SET deleted_at = NOW() WHERE id = $1", [deleted.id]);

    const report = await getAnalyticsGlobalDashboardReport(owner.id, "UTC", 7);
    expect(report.overview).toEqual({ trackedSites: 4, activeSites: 3, views: 6, visits: 5 });
    expect(report.sites.map(({ id }) => id)).toEqual([alpha.id, beta.id, viewOnly.id, zero.id]);
    expect(report.sites.at(-1)).toMatchObject({ id: zero.id, views: 0, visits: 0 });
    expect(report.sites.reduce((sum, site) => sum + site.views, 0)).toBe(report.overview.views);
    expect(report.sites.reduce((sum, site) => sum + site.visits, 0)).toBe(report.overview.visits);
    expect(report.overview.activeSites).toBe(report.sites.filter((site) => site.views > 0).length);
    expect(report.acquisition.totalVisits).toBe(report.overview.visits);
    expect(report.acquisition.referrers).toContainEqual({ referrer: "google.com", visits: 5 });
    expect(report.acquisition.campaigns).toEqual([
      expect.objectContaining({ siteId: alpha.id, siteName: "Alpha", source: "newsletter", medium: "email", campaign: "launch", visits: 3 }),
      expect.objectContaining({ siteId: beta.id, siteName: "Beta", source: "newsletter", medium: "email", campaign: "launch", visits: 2 }),
    ]);
    expect(report.dimensions.countries).toEqual([{ country: "JP", views: 5 }, { country: "DE", views: 1 }]);
    expect(report.timeline).toHaveLength(7);
    expect(report).not.toHaveProperty("topPages");
    expect(report.acquisition).not.toHaveProperty("entryPages");

    const adminReport = await getAnalyticsGlobalDashboardReport(undefined, "UTC", 7);
    expect(adminReport.sites.map(({ id }) => id)).toContain(foreign.id);
    expect(adminReport.sites.map(({ id }) => id)).not.toContain(deleted.id);
    expect(adminReport.acquisition.campaigns).toEqual(expect.arrayContaining([
      expect.objectContaining({ siteId: alpha.id, visits: 3 }),
      expect.objectContaining({ siteId: beta.id, visits: 2 }),
      expect.objectContaining({ siteId: foreign.id, visits: 5 }),
    ]));
  });

  it.each([7, 30, 90])("uses the viewer-local %i-day current and previous bounds and zero-fills its timeline", async (days) => {
    const suffix = `${Date.now()}_${days}`;
    const owner = await usersQ.insertUser({ username: `analytics_global_bounds_${suffix}`, password_hash: "hash", role: "user" });
    const site = await makeSite(owner.id, "Bounds", `bounds-${suffix}`);
    const insertAtOffset = (offset: number, visit: boolean) => getTestPool().query(`
      INSERT INTO analytics_events(site_id, path, referrer_host, os, browser, country, device_type, visitor, visit, recorded_at)
      SELECT $1, '/', '', 'Other', 'Other', 'Unknown', 'Desktop', FALSE, $3,
        (((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo')::date + $2::int)::timestamp AT TIME ZONE 'Asia/Tokyo')
    `, [site.id, offset, visit]);
    const currentStartOffset = 1 - days;
    const previousStartOffset = 1 - days * 2;
    await insertAtOffset(currentStartOffset, true);
    await insertAtOffset(0, false);
    await insertAtOffset(previousStartOffset, true);
    await insertAtOffset(previousStartOffset - 1, true);
    await insertAtOffset(1, true);

    const report = await getAnalyticsGlobalDashboardReport(owner.id, "Asia/Tokyo", days);
    const shiftDate = (dateText: string, offset: number) => {
      const date = new Date(`${dateText}T00:00:00.000Z`);
      date.setUTCDate(date.getUTCDate() + offset);
      return date.toISOString().slice(0, 10);
    };
    expect(report.period.days).toBe(days);
    expect(shiftDate(report.period.startDate, days - 1)).toBe(report.period.endDate);
    expect(shiftDate(report.previousPeriod.startDate, days - 1)).toBe(report.previousPeriod.endDate);
    expect(shiftDate(report.previousPeriod.endDate, 1)).toBe(report.period.startDate);
    expect(report.overview.views).toBe(2);
    expect(report.previousOverview.views).toBe(1);
    expect(report.timeline).toHaveLength(days);
    expect(report.timeline[0]).toMatchObject({ date: report.period.startDate, views: 1, visits: 1 });
    expect(report.timeline.at(-1)).toMatchObject({ date: report.period.endDate, views: 1, visits: 0 });
  });
});

describe("analytics event queries", () => {
  it("upgrades legacy analytics events with defaulted UTM columns", async () => {
    await getTestPool().query("ALTER TABLE analytics_events DROP COLUMN utm_source, DROP COLUMN utm_medium, DROP COLUMN utm_campaign");
    const suffix = Date.now();
    const owner = await usersQ.insertUser({ username: `analytics_legacy_utm_${suffix}`, password_hash: "hash", role: "user" });
    const site = await createAnalyticsSite({ owner_id: owner.id, name: "Legacy UTM", site_key: `legacy-utm-${suffix}`, host: "legacy-utm.example" });
    await getTestPool().query(`
      INSERT INTO analytics_events(site_id, path, referrer_host, os, browser, country, device_type, visitor, visit)
      VALUES ($1, '/', '', 'Other', 'Other', 'Unknown', 'Desktop', FALSE, TRUE)
    `, [site.id]);
    await ensureSchemaColumns(getTestPool());
    const { rows } = await getTestPool().query(`
      SELECT column_name, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'analytics_events'
        AND column_name IN ('utm_source', 'utm_medium', 'utm_campaign')
      ORDER BY column_name
    `);
    expect(rows).toEqual([
      { column_name: "utm_campaign", is_nullable: "NO", column_default: "''::text" },
      { column_name: "utm_medium", is_nullable: "NO", column_default: "''::text" },
      { column_name: "utm_source", is_nullable: "NO", column_default: "''::text" },
    ]);
    const { rows: [legacyEvent] } = await getTestPool().query(
      "SELECT utm_source, utm_medium, utm_campaign FROM analytics_events WHERE site_id = $1",
      [site.id],
    );
    expect(legacyEvent).toEqual({ utm_source: "", utm_medium: "", utm_campaign: "" });
  });

  it("persists collector UTM values only for normalized visit entries", async () => {
    const suffix = Date.now();
    const owner = await usersQ.insertUser({ username: `analytics_collector_db_${suffix}`, password_hash: "hash", role: "user" });
    const siteKey = `123e4567-e89b-42d3-a456-${String(suffix).slice(-12).padStart(12, "0")}`;
    const site = await createAnalyticsSite({ owner_id: owner.id, name: "Collector DB", site_key: siteKey, host: "collector-db.example" });
    const collect = (path: string, visit: boolean, utm: Record<string, string> = {}) => collectAnalyticsEvent({
      payload: { site: site.site_key, host: site.host, path, referrer: "", visitor: true, visit, ...utm },
      origin: `https://${site.host}`,
      userAgent: "Mozilla/5.0 (X11; Linux x86_64) Gecko/20100101 Firefox/126.0",
    });

    await expect(collect("/legacy", true)).resolves.toBe("recorded");
    await expect(collect("/campaign", true, { utmSource: " newsletter ", utmMedium: "email", utmCampaign: "launch" })).resolves.toBe("recorded");
    await expect(collect("/page-view", false, { utmSource: "google", utmMedium: "cpc", utmCampaign: "launch" })).resolves.toBe("recorded");
    await expect(collect("/malformed", true, { utmSource: "bad\u0001source", utmMedium: "m".repeat(205), utmCampaign: "c".repeat(201) })).resolves.toBe("recorded");

    const { rows } = await getTestPool().query(`
      SELECT path, visit, utm_source, utm_medium, utm_campaign
      FROM analytics_events WHERE site_id = $1 ORDER BY id
    `, [site.id]);
    expect(rows).toEqual([
      { path: "/legacy", visit: true, utm_source: "", utm_medium: "", utm_campaign: "" },
      { path: "/campaign", visit: true, utm_source: "newsletter", utm_medium: "email", utm_campaign: "launch" },
      { path: "/page-view", visit: false, utm_source: "", utm_medium: "", utm_campaign: "" },
      { path: "/malformed", visit: true, utm_source: "", utm_medium: "m".repeat(200), utm_campaign: "c".repeat(200) },
    ]);
  });

  it("builds timezone-aware summaries, zero-filled timelines, and deterministic top pages per site", async () => {
    const suffix = Date.now();
    const owner = await usersQ.insertUser({ username: `analytics_events_${suffix}`, password_hash: "hash", role: "user" });
    const otherOwner = await usersQ.insertUser({ username: `analytics_events_other_${suffix}`, password_hash: "hash", role: "user" });
    const site = await createAnalyticsSite({ owner_id: owner.id, name: "Event Site", site_key: `123e4567-e89b-42d3-a456-${String(suffix).slice(-12).padStart(12, "0")}`, host: "events.example" });
    const otherSite = await createAnalyticsSite({ owner_id: otherOwner.id, name: "Other Site", site_key: `223e4567-e89b-42d3-a456-${String(suffix).slice(-12).padStart(12, "0")}`, host: "other.example" });
    const reportSite = await createAnalyticsSite({ owner_id: owner.id, name: "Report Site", site_key: `323e4567-e89b-42d3-a456-${String(suffix + 1).slice(-12).padStart(12, "0")}`, host: "report.example" });
    const dimensionSite = await createAnalyticsSite({ owner_id: owner.id, name: "Dimension Site", site_key: `423e4567-e89b-42d3-a456-${String(suffix + 2).slice(-12).padStart(12, "0")}`, host: "dimensions.example" });
    const limitSite = await createAnalyticsSite({ owner_id: owner.id, name: "Limit Site", site_key: `523e4567-e89b-42d3-a456-${String(suffix + 3).slice(-12).padStart(12, "0")}`, host: "limit.example" });
    const emptySite = await createAnalyticsSite({ owner_id: owner.id, name: "Empty Site", site_key: `623e4567-e89b-42d3-a456-${String(suffix + 4).slice(-12).padStart(12, "0")}`, host: "empty.example" });
    const countrySite = await createAnalyticsSite({ owner_id: owner.id, name: "Country Site", site_key: `723e4567-e89b-42d3-a456-${String(suffix + 5).slice(-12).padStart(12, "0")}`, host: "countries.example" });
    expect(await getAnalyticsSiteByKey(site.site_key)).toMatchObject({ id: site.id });
    const event = { site_id: site.id, path: "/", referrer_host: "", os: "Other", browser: "Other", country: "Unknown", device_type: "Desktop", visitor: false, visit: false, utm_source: "", utm_medium: "", utm_campaign: "" };
    await insertAnalyticsEvent({ ...event, visitor: true, visit: true });
    await insertAnalyticsEvent({ ...event, visitor: false, visit: false });
    await insertAnalyticsEvent({ ...event, visitor: false, visit: true });
    const summary = await getAnalyticsTrafficReport(site.id, "UTC");
    expect(summary.overview).toEqual({ views: 3, visitors: 1, visits: 2 });
    expect(summary.period).toEqual({ days: 7, timezone: "UTC" });
    expect(summary.timeline).toHaveLength(7);
    expect(summary.timeline.map((point) => point.date)).toEqual([...summary.timeline.map((point) => point.date)].sort());
    expect(summary.timeline.reduce((total, point) => total + point.views, 0)).toBe(summary.overview.views);
    expect(summary.timeline.reduce((total, point) => total + point.visitors, 0)).toBe(summary.overview.visitors);
    expect(summary.timeline.reduce((total, point) => total + point.visits, 0)).toBe(summary.overview.visits);
    expect(summary.topPages).toEqual([{ path: "/", views: 3 }]);
    expect(Object.keys(summary.topPages[0]).sort()).toEqual(["path", "views"]);
    expect(summary.dimensions).toEqual({
      referrers: [{ referrer: "", views: 3 }],
      countries: [{ country: "Unknown", views: 3 }],
      browsers: [{ browser: "Other", views: 3 }],
      operatingSystems: [{ os: "Other", views: 3 }],
      devices: [{ device: "Desktop", views: 3 }],
    });

    const insertAtTokyoDay = async (siteId: number, path: string, daysAgo: number, visitor = false, visit = false) => {
      await getTestPool().query(`
        INSERT INTO analytics_events(site_id, path, referrer_host, os, browser, country, device_type, visitor, visit, recorded_at)
        SELECT $1, $2, '', 'Other', 'Other', 'Unknown', 'Desktop', $4, $5,
          ((((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo')::date - $3::integer)::timestamp) AT TIME ZONE 'Asia/Tokyo') + INTERVAL '12 hours'
      `, [siteId, path, daysAgo, visitor, visit]);
    };
    const reportEvents = { site_id: reportSite.id, path: "/a", referrer_host: "", os: "Other", browser: "Other", country: "Unknown", device_type: "Desktop", visitor: false, visit: false, utm_source: "", utm_medium: "", utm_campaign: "" };
    for (let index = 0; index < 10; index += 1) await insertAnalyticsEvent(reportEvents);
    for (let index = 0; index < 5; index += 1) await insertAnalyticsEvent({ ...reportEvents, path: "/b", visitor: index === 0, visit: index === 0 });
    for (let index = 0; index < 5; index += 1) await insertAnalyticsEvent({ ...reportEvents, path: "/c" });
    for (const path of ["/d", "/e", "/f", "/g", "/h", "/i", "/j", "/k", "/l"]) {
      await insertAnalyticsEvent({ ...reportEvents, path });
    }
    await insertAtTokyoDay(reportSite.id, "/two-days-ago", 2);
    await insertAtTokyoDay(reportSite.id, "/eight-days-ago", 8, true, true);
    const otherEvents = { site_id: otherSite.id, path: "/path-b", referrer_host: "bing.com", os: "Windows", browser: "Chrome", country: "US", device_type: "Desktop", visitor: false, visit: false, utm_source: "", utm_medium: "", utm_campaign: "" };
    for (let index = 0; index < 20; index += 1) await insertAnalyticsEvent(otherEvents);

    const dimensionEvent = { site_id: dimensionSite.id, path: "/dimensions", referrer_host: "", os: "macOS", browser: "Safari", country: "JP", device_type: "Desktop", visitor: false, visit: false, utm_source: "", utm_medium: "", utm_campaign: "" };
    const insertDimensionGroup = async (count: number, fields: Partial<typeof dimensionEvent>) => {
      for (let index = 0; index < count; index += 1) await insertAnalyticsEvent({ ...dimensionEvent, ...fields });
    };
    await insertDimensionGroup(10, {});
    await insertDimensionGroup(5, { referrer_host: "google.com", country: "US", browser: "Chrome", os: "iOS", device_type: "Mobile" });
    await insertDimensionGroup(2, { referrer_host: "github.com", country: "Unknown", browser: "Firefox", os: "Windows", device_type: "Tablet" });
    await insertDimensionGroup(1, { referrer_host: "github.com", country: "DE", browser: "Other", os: "Other", device_type: "Other" });
    await getTestPool().query(`
      INSERT INTO analytics_events(site_id, path, referrer_host, os, browser, country, device_type, visitor, visit, recorded_at)
      SELECT $1, '/old', 'old.example', 'Legacy OS', 'Legacy browser', 'CN', 'Legacy device', FALSE, FALSE,
        ((((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo')::date - 8)::timestamp) AT TIME ZONE 'Asia/Tokyo') + INTERVAL '12 hours'
    `, [dimensionSite.id]);

    const insertCountForLimit = async (referrer: string, count: number) => {
      for (let index = 0; index < count; index += 1) {
        await insertAnalyticsEvent({ site_id: limitSite.id, path: "/limit", referrer_host: referrer, os: "Other", browser: "Other", country: "Unknown", device_type: "Other", visitor: false, visit: false, utm_source: "", utm_medium: "", utm_campaign: "" });
      }
    };
    await insertCountForLimit("a.example", 5);
    await insertCountForLimit("b.example", 5);
    for (const letter of "cdefghijkl") await insertCountForLimit(`${letter}.example`, 1);

    const countryCounts = [["JP", 20], ["US", 10], ["DE", 5], ...["AU", "BR", "CA", "CN", "ES", "FR", "GB", "IN", "IT"].map((country) => [country, 1] as const)] as const;
    for (const [country, count] of countryCounts) {
      for (let index = 0; index < count; index += 1) {
        await insertAnalyticsEvent({ site_id: countrySite.id, path: `/country/${country}`, referrer_host: "geo.example", os: `OS ${country}`, browser: `Browser ${country}`, country, device_type: `Device ${country}`, visitor: false, visit: false, utm_source: "", utm_medium: "", utm_campaign: "" });
      }
    }

    const { rows: [clock] } = await getTestPool().query(`
      SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo')::date::text AS tokyo_today,
        (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date::text AS utc_today
    `);
    const tokyoReport = await getAnalyticsTrafficReport(reportSite.id, "Asia/Tokyo");
    expect(tokyoReport.period).toEqual({ days: 7, timezone: "Asia/Tokyo" });
    expect(tokyoReport.timeline).toHaveLength(7);
    expect(tokyoReport.timeline.at(-1)?.date).toBe(clock.tokyo_today);
    expect(tokyoReport.timeline.filter((point) => point.views === 0)).toHaveLength(5);
    expect(tokyoReport.timeline.find((point) => point.date === tokyoReport.timeline.at(-3)?.date)?.views).toBe(1);
    expect(tokyoReport.overview.views).toBe(30);
    expect(tokyoReport.topPages).toHaveLength(10);
    expect(tokyoReport.topPages.slice(0, 3)).toEqual([
      { path: "/a", views: 10 }, { path: "/b", views: 5 }, { path: "/c", views: 5 },
    ]);
    expect(tokyoReport.topPages.map((page) => page.path)).toEqual([
      "/a", "/b", "/c", "/d", "/e", "/f", "/g", "/h", "/i", "/j",
    ]);
    expect(tokyoReport.timeline.reduce((total, point) => total + point.views, 0)).toBe(tokyoReport.overview.views);
    expect(tokyoReport.timeline.reduce((total, point) => total + point.visitors, 0)).toBe(tokyoReport.overview.visitors);
    expect(tokyoReport.timeline.reduce((total, point) => total + point.visits, 0)).toBe(tokyoReport.overview.visits);
    expect(tokyoReport.topPages.map((page) => page.path)).not.toContain("/eight-days-ago");
    expect(tokyoReport.topPages.map((page) => page.path)).not.toContain("/path-b");
    expect(tokyoReport.topPages.every((page) => Object.keys(page).sort().join(",") === "path,views")).toBe(true);
    const utcReport = await getAnalyticsTrafficReport(reportSite.id, "UTC");
    expect(utcReport.timeline.at(-1)?.date).toBe(clock.utc_today);
    expect(utcReport.overview.views).toBe(30);
    const otherReport = await getAnalyticsTrafficReport(otherSite.id, "Asia/Tokyo");
    expect(otherReport.overview.views).toBe(20);
    expect(otherReport.timeline.reduce((total, point) => total + point.views, 0)).toBe(20);
    expect(otherReport.topPages).toEqual([{ path: "/path-b", views: 20 }]);
    expect(otherReport.dimensions.referrers).toEqual([{ referrer: "bing.com", views: 20 }]);
    expect(otherReport.dimensions.countries).toEqual([{ country: "US", views: 20 }]);
    expect(otherReport.dimensions.browsers).toEqual([{ browser: "Chrome", views: 20 }]);

    const dimensionReport = await getAnalyticsTrafficReport(dimensionSite.id, "Asia/Tokyo");
    expect(dimensionReport.overview.views).toBe(18);
    expect(dimensionReport.dimensions.referrers).toEqual([
      { referrer: "", views: 10 }, { referrer: "google.com", views: 5 }, { referrer: "github.com", views: 3 },
    ]);
    expect(dimensionReport.dimensions.countries).toEqual([
      { country: "JP", views: 10 }, { country: "US", views: 5 }, { country: "Unknown", views: 2 }, { country: "DE", views: 1 },
    ]);
    expect(dimensionReport.dimensions.browsers).toEqual([
      { browser: "Safari", views: 10 }, { browser: "Chrome", views: 5 }, { browser: "Firefox", views: 2 }, { browser: "Other", views: 1 },
    ]);
    expect(dimensionReport.dimensions.operatingSystems).toEqual([
      { os: "macOS", views: 10 }, { os: "iOS", views: 5 }, { os: "Windows", views: 2 }, { os: "Other", views: 1 },
    ]);
    expect(dimensionReport.dimensions.devices).toEqual([
      { device: "Desktop", views: 10 }, { device: "Mobile", views: 5 }, { device: "Tablet", views: 2 }, { device: "Other", views: 1 },
    ]);
    expect(dimensionReport.dimensions.referrers.every((item) => Object.keys(item).sort().join(",") === "referrer,views")).toBe(true);
    expect(dimensionReport.dimensions.countries.every((item) => Object.keys(item).sort().join(",") === "country,views")).toBe(true);
    expect(dimensionReport.dimensions.browsers.every((item) => Object.keys(item).sort().join(",") === "browser,views")).toBe(true);
    expect(dimensionReport.dimensions.operatingSystems.every((item) => Object.keys(item).sort().join(",") === "os,views")).toBe(true);
    expect(dimensionReport.dimensions.devices.every((item) => Object.keys(item).sort().join(",") === "device,views")).toBe(true);
    expect(dimensionReport.dimensions.referrers.map((item) => item.referrer)).not.toContain("old.example");
    expect(dimensionReport.dimensions.countries.map((item) => item.country)).not.toContain("CN");
    expect(dimensionReport.dimensions.browsers.map((item) => item.browser)).not.toContain("Legacy browser");
    expect(dimensionReport.dimensions.operatingSystems.map((item) => item.os)).not.toContain("Legacy OS");
    expect(dimensionReport.dimensions.devices.map((item) => item.device)).not.toContain("Legacy device");

    const limitedReport = await getAnalyticsTrafficReport(limitSite.id, "UTC");
    expect(limitedReport.dimensions.referrers).toHaveLength(10);
    expect(limitedReport.dimensions.referrers.map((item) => item.referrer)).toEqual([
      "a.example", "b.example", "c.example", "d.example", "e.example", "f.example", "g.example", "h.example", "i.example", "j.example",
    ]);
    expect(limitedReport.dimensions.browsers).toHaveLength(1);
    expect(limitedReport.dimensions.operatingSystems).toHaveLength(1);
    expect(limitedReport.dimensions.devices).toHaveLength(1);
    const countryReport = await getAnalyticsTrafficReport(countrySite.id, "UTC");
    expect(countryReport.dimensions.countries).toHaveLength(12);
    expect(countryReport.dimensions.countries).toEqual([
      { country: "JP", views: 20 }, { country: "US", views: 10 }, { country: "DE", views: 5 },
      ...["AU", "BR", "CA", "CN", "ES", "FR", "GB", "IN", "IT"].map((country) => ({ country, views: 1 })),
    ]);
    expect(countryReport.topPages).toHaveLength(10);
    expect(countryReport.dimensions.referrers).toHaveLength(1);
    expect(countryReport.dimensions.browsers).toHaveLength(10);
    expect(countryReport.dimensions.operatingSystems).toHaveLength(10);
    expect(countryReport.dimensions.devices).toHaveLength(10);
    const emptyReport = await getAnalyticsTrafficReport(emptySite.id, "UTC");
    expect(emptyReport.overview.views).toBe(0);
    expect(emptyReport.dimensions).toEqual({ referrers: [], countries: [], browsers: [], operatingSystems: [], devices: [] });

    const acquisitionSite = await createAnalyticsSite({ owner_id: owner.id, name: "Acquisition Site", site_key: `acq-${suffix}`, host: "acquisition.example" });
    const acquisitionEvent = {
      site_id: acquisitionSite.id,
      referrer_host: "",
      os: "Other",
      browser: "Other",
      country: "Unknown",
      device_type: "Desktop",
      visitor: false,
      utm_source: "",
      utm_medium: "",
      utm_campaign: "",
    };
    await insertAnalyticsEvent({ ...acquisitionEvent, path: "/landing", referrer_host: "google.com", visit: true });
    await insertAnalyticsEvent({ ...acquisitionEvent, path: "/campaign", referrer_host: "google.com", visit: true });
    await insertAnalyticsEvent({ ...acquisitionEvent, path: "/github", referrer_host: "github.com", visit: true });
    await insertAnalyticsEvent({ ...acquisitionEvent, path: "/github", referrer_host: "github.com", visit: true });
    await insertAnalyticsEvent({ ...acquisitionEvent, path: "/", visit: true });
    await insertAnalyticsEvent({ ...acquisitionEvent, path: "/pricing", visit: false });
    await insertAnalyticsEvent({ ...acquisitionEvent, path: "/docs", visit: false });
    await getTestPool().query(`
      INSERT INTO analytics_events(site_id, path, referrer_host, os, browser, country, device_type, visitor, visit, recorded_at)
      SELECT $1::int, '/start', 'start.example', 'Other', 'Other', 'Unknown', 'Desktop', FALSE, TRUE,
        ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo')::date - 6)::timestamp AT TIME ZONE 'Asia/Tokyo'
      UNION ALL
      SELECT $1::int, '/future', 'future.example', 'Other', 'Other', 'Unknown', 'Desktop', FALSE, TRUE,
        ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo')::date + 1)::timestamp AT TIME ZONE 'Asia/Tokyo'
    `, [acquisitionSite.id]);
    const acquisitionOtherSite = await createAnalyticsSite({ owner_id: otherOwner.id, name: "Other Acquisition Site", site_key: `acq-other-${suffix}`, host: "other-acquisition.example" });
    await insertAnalyticsEvent({ ...acquisitionEvent, site_id: acquisitionOtherSite.id, path: "/other", referrer_host: "bing.com", visit: true });
    await getTestPool().query(`
      INSERT INTO analytics_events(site_id, path, referrer_host, os, browser, country, device_type, visitor, visit, recorded_at)
      SELECT $1, '/old-entry', 'old.example', 'Other', 'Other', 'Unknown', 'Desktop', FALSE, TRUE,
        ((((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo')::date - 8)::timestamp) AT TIME ZONE 'Asia/Tokyo') + INTERVAL '12 hours'
    `, [acquisitionSite.id]);

    const acquisition = await getAnalyticsAcquisitionReport(acquisitionSite.id, "Asia/Tokyo");
    expect(acquisition.period).toEqual({ days: 7, timezone: "Asia/Tokyo" });
    expect(acquisition.totalVisits).toBe(6);
    expect(acquisition.referrers).toEqual([
      { referrer: "github.com", visits: 2 },
      { referrer: "google.com", visits: 2 },
      { referrer: "", visits: 1 },
      { referrer: "start.example", visits: 1 },
    ]);
    expect(acquisition.entryPages).toEqual([
      { path: "/github", visits: 2 },
      { path: "/", visits: 1 },
      { path: "/campaign", visits: 1 },
      { path: "/landing", visits: 1 },
      { path: "/start", visits: 1 },
    ]);
    expect(acquisition.referrers.reduce((sum, item) => sum + item.visits, 0)).toBe(acquisition.totalVisits);
    expect(acquisition.entryPages.reduce((sum, item) => sum + item.visits, 0)).toBe(acquisition.totalVisits);
    expect(acquisition.referrers.map((item) => item.referrer)).not.toContain("old.example");
    expect(acquisition.entryPages.map((item) => item.path)).not.toContain("/old-entry");
    expect(acquisition.referrers.map((item) => item.referrer)).not.toContain("future.example");
    expect(acquisition.entryPages.map((item) => item.path)).not.toContain("/future");
    expect(acquisition.referrers.map((item) => item.referrer)).not.toContain("bing.com");
    expect(acquisition.entryPages.map((item) => item.path)).not.toContain("/other");
    expect((await getAnalyticsAcquisitionReport(acquisitionSite.id, "UTC")).period).toEqual({ days: 7, timezone: "UTC" });

    const utcBoundarySite = await createAnalyticsSite({ owner_id: owner.id, name: "UTC Boundary", site_key: `acq-utc-${suffix}`, host: "acquisition-utc.example" });
    await getTestPool().query(`
      INSERT INTO analytics_events(site_id, path, referrer_host, os, browser, country, device_type, visitor, visit, recorded_at)
      SELECT $1::int, '/utc-start', 'utc-start.example', 'Other', 'Other', 'Unknown', 'Desktop', FALSE, TRUE,
        ((CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date - 6)::timestamp AT TIME ZONE 'UTC'
      UNION ALL
      SELECT $1::int, '/utc-future', 'utc-future.example', 'Other', 'Other', 'Unknown', 'Desktop', FALSE, TRUE,
        ((CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date + 1)::timestamp AT TIME ZONE 'UTC'
    `, [utcBoundarySite.id]);
    const utcBoundaryReport = await getAnalyticsAcquisitionReport(utcBoundarySite.id, "UTC");
    expect(utcBoundaryReport.totalVisits).toBe(1);
    expect(utcBoundaryReport.entryPages).toEqual([{ path: "/utc-start", visits: 1 }]);

    const acquisitionLimitSite = await createAnalyticsSite({ owner_id: owner.id, name: "Acquisition Limit", site_key: `acq-limit-${suffix}`, host: "acquisition-limit.example" });
    for (const source of "abcdefghijkl") {
      await insertAnalyticsEvent({ ...acquisitionEvent, site_id: acquisitionLimitSite.id, path: `/page-${source}`, referrer_host: `${source}.example`, visit: true });
    }
    const limitedAcquisition = await getAnalyticsAcquisitionReport(acquisitionLimitSite.id, "UTC");
    expect(limitedAcquisition.totalVisits).toBe(12);
    expect(limitedAcquisition.referrers).toHaveLength(10);
    expect(limitedAcquisition.referrers).toEqual(
      "abcdefghij".split("").map((source) => ({ referrer: `${source}.example`, visits: 1 })),
    );
    expect(limitedAcquisition.entryPages).toHaveLength(10);
    expect(limitedAcquisition.entryPages).toEqual(
      "abcdefghij".split("").map((source) => ({ path: `/page-${source}`, visits: 1 })),
    );

    const indexes = await getTestPool().query("SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'analytics_events'");
    expect(indexes.rows.filter((row: { indexname: string }) => row.indexname !== "analytics_events_pkey")).toEqual([expect.objectContaining({
      indexname: "idx_analytics_events_site_recorded",
      indexdef: expect.stringMatching(/\(site_id, recorded_at DESC\)/),
    })]);
  });

  it.each([7, 30, 90])("builds a %i-day dashboard with an equal previous period and one consistent current read", async (days) => {
    const suffix = `${Date.now()}_${days}`;
    const owner = await usersQ.insertUser({ username: `analytics_dashboard_${suffix}`, password_hash: "hash", role: "user" });
    const site = await createAnalyticsSite({ owner_id: owner.id, name: "Dashboard", site_key: `dashboard-${suffix}`, host: `dashboard-${days}.example` });
    const insertAtTokyoDay = async (path: string, daysAgo: number, visitor: boolean, visit: boolean, country: string) => {
      await getTestPool().query(`
        INSERT INTO analytics_events(site_id, path, referrer_host, os, browser, country, device_type, visitor, visit, recorded_at)
        SELECT $1, $2, 'source.example', 'Other', 'Other', $5, 'Desktop', $3, $4,
          ((((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo')::date - $6::integer)::timestamp) AT TIME ZONE 'Asia/Tokyo') + INTERVAL '12 hours'
      `, [site.id, path, visitor, visit, country, daysAgo]);
    };
    await insertAtTokyoDay("/current-today", 0, true, true, "JP");
    await insertAtTokyoDay("/current-start", days - 1, true, false, "US");
    await insertAtTokyoDay("/previous-end", days, true, true, "DE");
    await insertAtTokyoDay("/previous-start", days * 2 - 1, false, false, "FR");
    await insertAtTokyoDay("/outside", days * 2, true, true, "CN");
    await getTestPool().query(`
      INSERT INTO analytics_events(site_id, path, referrer_host, os, browser, country, device_type, visitor, visit, recorded_at)
      SELECT $1::int, '/current-start-boundary', 'source.example', 'Other', 'Other', 'JP', 'Desktop', FALSE, FALSE,
        (((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo')::date - ($2::integer - 1))::timestamp AT TIME ZONE 'Asia/Tokyo')
      UNION ALL
      SELECT $1, '/previous-start-boundary', 'source.example', 'Other', 'Other', 'FR', 'Desktop', FALSE, FALSE,
        (((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo')::date - ($2::integer * 2 - 1))::timestamp AT TIME ZONE 'Asia/Tokyo')
      UNION ALL
      SELECT $1, '/current-end-exclusive', 'source.example', 'Other', 'Other', 'CN', 'Desktop', TRUE, TRUE,
        ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo')::date + 1)::timestamp AT TIME ZONE 'Asia/Tokyo'
    `, [site.id, days]);

    const report = await getAnalyticsDashboardReport(site.id, "Asia/Tokyo", days);
    expect(report.period).toEqual({ days, timezone: "Asia/Tokyo", startDate: report.timeline[0].date, endDate: report.timeline.at(-1)?.date });
    expect(report.previousPeriod.days).toBe(days);
    expect(report.previousPeriod.timezone).toBe("Asia/Tokyo");
    const shiftDate = (dateText: string, offset: number) => {
      const date = new Date(`${dateText}T00:00:00.000Z`);
      date.setUTCDate(date.getUTCDate() + offset);
      return date.toISOString().slice(0, 10);
    };
    expect(shiftDate(report.period.startDate, days - 1)).toBe(report.period.endDate);
    expect(shiftDate(report.previousPeriod.startDate, days - 1)).toBe(report.previousPeriod.endDate);
    expect(shiftDate(report.previousPeriod.endDate, 1)).toBe(report.period.startDate);
    expect(report.timeline).toHaveLength(days);
    expect(report.timeline.map(({ date }) => date)).toEqual([...report.timeline.map(({ date }) => date)].sort());
    expect(report.timeline.filter(({ views }) => views === 0)).toHaveLength(days - 2);
    expect(report.overview).toEqual({ views: 3, visits: 1, visitorDays: 2 });
    expect(report.previousOverview).toEqual({ views: 3, visits: 1, visitorDays: 1 });
    expect(report.timeline.reduce((sum, point) => sum + point.visitors, 0)).toBe(2);
    expect(report.topPages.map(({ path }) => path)).toEqual(["/current-start", "/current-start-boundary", "/current-today"]);
    expect(report.dimensions.countries.map(({ country }) => country)).toEqual(["JP", "US"]);
    expect(report.acquisition.totalVisits).toBe(report.overview.visits);
    expect(report.acquisition.referrers).toEqual([{ referrer: "source.example", visits: 1 }]);
    expect(report.acquisition.entryPages).toEqual([{ path: "/current-today", visits: 1 }]);
  });

  it("uses viewer-local inclusive dates for UTC and Tokyo reports", async () => {
    const suffix = Date.now();
    const owner = await usersQ.insertUser({ username: `analytics_timezone_${suffix}`, password_hash: "hash", role: "user" });
    const site = await createAnalyticsSite({ owner_id: owner.id, name: "Timezone", site_key: `timezone-${suffix}`, host: "timezone.example" });
    const { rows: [today] } = await getTestPool().query(`
      SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date::text AS utc_today,
        (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo')::date::text AS tokyo_today
    `);
    for (const timezone of ["UTC", "Asia/Tokyo"]) {
      const report = await getAnalyticsDashboardReport(site.id, timezone, 30);
      const expectedToday = timezone === "UTC" ? today.utc_today : today.tokyo_today;
      expect(report.period.endDate).toBe(expectedToday);
      expect(report.timeline.at(-1)?.date).toBe(expectedToday);
      expect(report.timeline).toHaveLength(30);
      expect(report.timeline.every((point) => point.views === 0 && point.visitors === 0 && point.visits === 0)).toBe(true);
    }
  });

  it("groups current visit-entry campaigns by the full UTM tuple and isolates sites", async () => {
    const suffix = Date.now();
    const owner = await usersQ.insertUser({ username: `analytics_campaigns_${suffix}`, password_hash: "hash", role: "user" });
    const otherOwner = await usersQ.insertUser({ username: `analytics_campaigns_other_${suffix}`, password_hash: "hash", role: "user" });
    const site = await createAnalyticsSite({ owner_id: owner.id, name: "Campaigns", site_key: `campaigns-${suffix}`, host: "campaigns.example" });
    const otherSite = await createAnalyticsSite({ owner_id: otherOwner.id, name: "Other Campaigns", site_key: `campaigns-other-${suffix}`, host: "other-campaigns.example" });
    const event = {
      site_id: site.id,
      path: "/landing",
      referrer_host: "",
      os: "Other",
      browser: "Other",
      country: "Unknown",
      device_type: "Desktop",
      visitor: false,
      visit: true,
      utm_source: "google",
      utm_medium: "cpc",
      utm_campaign: "launch",
    };
    await insertAnalyticsEvent(event);
    for (let index = 0; index < 5; index += 1) {
      await insertAnalyticsEvent({ ...event, path: `/follow-up-${index}`, visit: false });
    }
    await insertAnalyticsEvent({ ...event, utm_source: "newsletter", utm_medium: "email" });
    await insertAnalyticsEvent({ ...event, utm_source: "", utm_medium: "", utm_campaign: "" });
    await insertAnalyticsEvent({ ...event, site_id: otherSite.id, utm_source: "other-site", utm_campaign: "private" });
    await getTestPool().query(`
      INSERT INTO analytics_events(site_id, path, referrer_host, os, browser, country, device_type, visitor, visit,
        utm_source, utm_medium, utm_campaign, recorded_at)
      SELECT $1, '/previous-campaign', '', 'Other', 'Other', 'Unknown', 'Desktop', FALSE, TRUE,
        'old-source', 'social', 'previous-only',
        ((((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo')::date - 8)::timestamp) AT TIME ZONE 'Asia/Tokyo') + INTERVAL '12 hours'
    `, [site.id]);

    const report = await getAnalyticsDashboardReport(site.id, "Asia/Tokyo", 7);
    expect(report.overview.visits).toBe(3);
    expect(report.acquisition.totalVisits).toBe(report.overview.visits);
    expect(report.acquisition.campaigns).toEqual([
      { campaign: "launch", source: "google", medium: "cpc", visits: 1 },
      { campaign: "launch", source: "newsletter", medium: "email", visits: 1 },
    ]);
    expect(report.acquisition.campaigns).not.toContainEqual(expect.objectContaining({ campaign: "previous-only" }));
    expect(report.acquisition.campaigns).not.toContainEqual(expect.objectContaining({ campaign: "private" }));
  });

  it("limits campaigns to ten rows with deterministic tuple tie ordering", async () => {
    const suffix = Date.now();
    const owner = await usersQ.insertUser({ username: `analytics_campaign_limit_${suffix}`, password_hash: "hash", role: "user" });
    const site = await createAnalyticsSite({ owner_id: owner.id, name: "Campaign Limit", site_key: `campaign-limit-${suffix}`, host: "campaign-limit.example" });
    const common = { site_id: site.id, path: "/", referrer_host: "", os: "Other", browser: "Other", country: "Unknown", device_type: "Desktop", visitor: false, visit: true };
    for (const campaign of "abcdefg") {
      await insertAnalyticsEvent({ ...common, utm_source: "source", utm_medium: "email", utm_campaign: campaign });
    }
    for (const [source, medium] of [["beta", "z"], ["alpha", "z"], ["zeta", "a"], ["alpha", "a"], ["beta", "a"]]) {
      await insertAnalyticsEvent({ ...common, utm_source: source, utm_medium: medium, utm_campaign: "same" });
    }
    const report = await getAnalyticsDashboardReport(site.id, "UTC", 7);
    expect(report.acquisition.campaigns).toHaveLength(10);
    expect(report.acquisition.campaigns.map(({ campaign, source, medium }) => `${campaign}:${source}/${medium}`)).toEqual([
      "a:source/email", "b:source/email", "c:source/email", "d:source/email", "e:source/email", "f:source/email", "g:source/email",
      "same:alpha/a", "same:alpha/z", "same:beta/a",
    ]);
  });
});

describe("accounts queries", () => {
  let userId: number;
  let accountId: number;

  beforeAll(async () => {
    const u = await usersQ.insertUser({ username: `acct_owner_${Date.now()}`, password_hash: "pass", role: "user" });
    userId = u.id;
  });

  it("creates an account", async () => {
    const pool = getTestPool();
    const { rows } = await pool.query(
      "INSERT INTO accounts (owner_id, screen_name, platform, auth_token, fetch_interval) VALUES ($1, $2, $3, $4, $5) RETURNING *",
      [userId, "test_twitter", "twitter", "token123", 30]
    );
    expect(rows[0].screen_name).toBe("test_twitter");
    accountId = rows[0].id;
  });

  it("lists accounts for owner", async () => {
    const accounts = await accountsQ.getAccounts(userId);
    expect(accounts.length).toBeGreaterThanOrEqual(1);
  });

  it("gets account by id", async () => {
    const account = await accountsQ.getAccountById(accountId);
    expect(account).toBeDefined();
  });

  it("soft-deletes an account", async () => {
    await accountsQ.deleteAccount(accountId);
    const account = await accountsQ.getAccountById(accountId);
    expect(account).toBeUndefined();
  });
});

describe("twitter queries", () => {
  let acctId: number;

  beforeAll(async () => {
    const u = await usersQ.insertUser({ username: `twitter_user_${Date.now()}`, password_hash: "pass", role: "user" });
    const pool = getTestPool();
    const { rows } = await pool.query(
      "INSERT INTO accounts (owner_id, screen_name, platform, auth_token) VALUES ($1, $2, $3, $4) RETURNING *",
      [u.id, "tweet_test", "twitter", "tok"]
    );
    acctId = rows[0].id;
  });

  it("inserts user stats", async () => {
    await twitterQ.insertUserStats({ account_id: acctId, followers_count: 100, following_count: 50, tweet_count: 200 });
    const latest = await twitterQ.getLatestUserStats(acctId);
    expect(latest).toBeDefined();
    expect(latest!.followers_count).toBe(100);
  });

  it("returns only the latest user stats snapshot per date in the timeline", async () => {
    const pool = getTestPool();
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString().slice(0, 10);

    await pool.query(
      `INSERT INTO user_stats (account_id, followers_count, following_count, tweet_count, recorded_at) VALUES
       ($1, 100, 50, 200, $2), ($1, 95, 52, 205, $3),
       ($1, 110, 55, 210, $4), ($1, 108, 56, 212, $5)`,
      [
        acctId,
        `${twoDaysAgo}T08:00:00.000Z`,
        `${twoDaysAgo}T20:00:00.000Z`,
        `${dayAgo}T08:00:00.000Z`,
        `${dayAgo}T20:00:00.000Z`,
      ]
    );

    const timeline = await twitterQ.getTimeline(30, [acctId]);
    const growth = timeline.followerGrowth.filter(
      (r) => r.date === twoDaysAgo || r.date === dayAgo
    );

    expect(growth).toEqual([
      { date: twoDaysAgo, followers_count: 95, following_count: 52, tweet_count: 205 },
      { date: dayAgo, followers_count: 108, following_count: 56, tweet_count: 212 },
    ]);
  });

  it("upserts and retrieves a tweet", async () => {
    await twitterQ.upsertTweet({
      id: "999",
      account_id: acctId,
      full_text: "Hello test",
      created_at: "2024-01-01T00:00:00Z",
      favorite_count: 10,
      retweet_count: 5,
      reply_count: 2,
      view_count: 100,
      bookmark_count: 1,
      is_quote: 0,
      is_reply: 0,
      is_retweet: 0,
      media_urls: "[]",
      urls: "[]",
      hashtags: "[]",
      mentions: "[]",
      lang: "en",
    });

    const result = await twitterQ.getTweets(1, 10, "created_at", "desc", undefined, [acctId]);
    expect(result.data.length).toBe(1);
    expect(result.data[0].full_text).toBe("Hello test");
  });

  it("counts only non-reply non-retweet tweets in todayTweets", async () => {
    const today = new Date().toISOString();

    await twitterQ.upsertTweet({
      id: "today_tweet",
      account_id: acctId,
      full_text: "Today main tweet",
      created_at: today,
      favorite_count: 3,
      retweet_count: 2,
      reply_count: 1,
      view_count: 30,
      bookmark_count: 0,
      is_quote: 0,
      is_reply: 0,
      is_retweet: 0,
      media_urls: "[]",
      urls: "[]",
      hashtags: "[]",
      mentions: "[]",
      lang: "en",
    });

    await twitterQ.upsertTweet({
      id: "today_reply",
      account_id: acctId,
      full_text: "Today reply",
      created_at: today,
      favorite_count: 2,
      retweet_count: 1,
      reply_count: 0,
      view_count: 20,
      bookmark_count: 0,
      is_quote: 0,
      is_reply: 1,
      is_retweet: 0,
      media_urls: "[]",
      urls: "[]",
      hashtags: "[]",
      mentions: "[]",
      lang: "en",
    });

    await twitterQ.upsertTweet({
      id: "today_retweet",
      account_id: acctId,
      full_text: "Today retweet",
      created_at: today,
      favorite_count: 1,
      retweet_count: 0,
      reply_count: 0,
      view_count: 10,
      bookmark_count: 0,
      is_quote: 0,
      is_reply: 0,
      is_retweet: 1,
      media_urls: "[]",
      urls: "[]",
      hashtags: "[]",
      mentions: "[]",
      lang: "en",
    });

    const overview = await twitterQ.getOverviewStats([acctId]);
    expect(overview.todayTweets).toBe(1);
  });
});

describe("reddit queries", () => {
  let acctId: number;

  beforeAll(async () => {
    const u = await usersQ.insertUser({ username: `reddit_user_${Date.now()}`, password_hash: "pass", role: "user" });
    const pool = getTestPool();
    const { rows } = await pool.query(
      "INSERT INTO accounts (owner_id, screen_name, platform, auth_token) VALUES ($1, $2, $3, $4) RETURNING *",
      [u.id, "reddit_test", "reddit", "tok"]
    );
    acctId = rows[0].id;
  });

  it("inserts stats and gets overview", async () => {
    await redditQ.insertRedditStats({ account_id: acctId, post_karma: 500, comment_karma: 300 });
    const overview = await redditQ.getRedditOverview(acctId);
    expect(overview).toBeDefined();
  });

  it("upserts a post", async () => {
    await redditQ.upsertRedditPost({
      id: "post_1", account_id: acctId, title: "Test Post", selftext: "",
      subreddit: "test", score: 42, upvote_ratio: 0.9, num_comments: 10,
      permalink: "/r/test/123/", url: "", is_self: 1, created_utc: 1700000000,
    });
    const result = await redditQ.getRedditPosts(acctId, 1, 20);
    expect(result.data.length).toBe(1);
    expect(result.data[0].title).toBe("Test Post");
  });

  it("upserts a comment", async () => {
    await redditQ.upsertRedditComment({
      id: "comment_1", account_id: acctId, body: "Nice post!", subreddit: "test",
      score: 5, link_id: "t3_post_1", parent_id: "t3_post_1", depth: 1,
      permalink: "/r/test/123/c/", created_utc: 1700000001, is_submitter: 0,
    });
    const result = await redditQ.getRedditComments(acctId, 1, 20);
    expect(result.data.length).toBe(1);
    expect(result.data[0].body).toBe("Nice post!");
  });
});

describe("github queries", () => {
  let acctId: number;

  beforeAll(async () => {
    const u = await usersQ.insertUser({ username: `gh_user_${Date.now()}`, password_hash: "pass", role: "user" });
    const pool = getTestPool();
    const { rows } = await pool.query(
      "INSERT INTO accounts (owner_id, screen_name, platform, auth_token) VALUES ($1, $2, $3, $4) RETURNING *",
      [u.id, "gh_test", "github", "tok"]
    );
    acctId = rows[0].id;
  });

  it("inserts stats and gets overview", async () => {
    await githubQ.insertGithubStats({ account_id: acctId, public_repos: 10, public_gists: 5, followers: 20, following: 8 });
    const overview = await githubQ.getGithubOverview(acctId);
    expect(overview).toBeDefined();
  });

  it("persists split Issue and Pull Request counts", async () => {
    await githubQ.upsertGithubRepo({
      account_id: acctId, repo_id: 200, name: "split", full_name: "gh_test/split",
      description: null, language: null, stars: 3, forks: 1, open_issues: 7,
      open_issues_only: 4, open_pull_requests: 3, topics: "[]", homepage: null,
      is_fork: 0, created_at: null, updated_at: null, pushed_at: null,
    });

    const snapshotDate = new Date().toISOString().slice(0, 10);
    await githubQ.upsertGithubRepoSnapshot({
      account_id: acctId, repo_id: 200, stars: 3, forks: 1, open_issues: 8,
      snapshot_date: snapshotDate,
    });
    let snapshots = await githubQ.getGithubRepoSnapshots(acctId, 200);
    expect(snapshots[0]).toMatchObject({ open_issues: 8, open_issues_only: null, open_pull_requests: null });

    await githubQ.upsertGithubRepoSnapshot({
      account_id: acctId, repo_id: 200, stars: 3, forks: 1, open_issues: 8,
      open_issues_only: 5, open_pull_requests: 3, snapshot_date: snapshotDate,
    });
    snapshots = await githubQ.getGithubRepoSnapshots(acctId, 200);
    expect(snapshots[0]).toMatchObject({ open_issues: 8, open_issues_only: 5, open_pull_requests: 3 });

    const overview = await githubQ.getGithubOverview(acctId);
    const repo = overview.allRepos.find(item => item.repo_id === 200);
    expect(repo).toMatchObject({ open_issues: 7, open_issues_only: 4, open_pull_requests: 3 });
  });

  it("keeps one repository row when a second PAT tracks the same stable GitHub id", async () => {
    const pool = getTestPool();
    const secondUser = await usersQ.insertUser({ username: `gh_second_${Date.now()}`, password_hash: "pass", role: "user" });
    const { rows } = await pool.query(
      "INSERT INTO accounts (owner_id, screen_name, platform, auth_token) VALUES ($1, $2, $3, $4) RETURNING id",
      [secondUser.id, "gh_second", "github", "tok"],
    );
    const secondAccountId = rows[0].id as number;
    expect(await githubQ.resolveGithubRepositoryId(secondAccountId, 200)).toBeNull();
    expect(await githubQ.resolveGithubRepositoryId(acctId, 987654321)).toBeNull();

    const stableRepo = {
      github_id: 1241734389,
      node_id: "R_kgDOTransfer",
      owner_github_id: 7654321,
      owner_login: "ShiinaLabs",
      owner_type: "Organization",
      html_url: "https://github.com/ShiinaLabs/wifi-lens",
    };
    await githubQ.upsertGithubRepo({
      account_id: acctId, repo_id: 1241734389, ...stableRepo,
      name: "wifi-lens", full_name: "SHIINASAMA/wifi-lens", description: null,
      language: "TypeScript", stars: 10, forks: 2, open_issues: 1, topics: "[]",
      homepage: null, is_fork: 0, created_at: null, updated_at: null, pushed_at: null,
    });
    await githubQ.upsertGithubRepo({
      account_id: secondAccountId, repo_id: 1241734389, ...stableRepo,
      name: "wifi-lens", full_name: "ShiinaLabs/wifi-lens", description: null,
      language: "TypeScript", stars: 11, forks: 2, open_issues: 1, topics: "[]",
      homepage: null, is_fork: 0, created_at: null, updated_at: null, pushed_at: null,
    });

    const repoRows = await pool.query("SELECT id, full_name FROM github_repos WHERE github_id = $1", [1241734389]);
    const trackingRows = await pool.query("SELECT account_id, repository_id FROM github_repository_tracking WHERE repository_id = $1", [repoRows.rows[0].id]);
    expect(repoRows.rows).toHaveLength(1);
    expect(await githubQ.resolveGithubRepositoryId(acctId, 1241734389)).toBe(repoRows.rows[0].id);
    expect(repoRows.rows[0].full_name).toBe("ShiinaLabs/wifi-lens");
    expect(trackingRows.rows.map((row) => row.account_id).sort()).toEqual([acctId, secondAccountId].sort());

    await githubQ.upsertGithubRepoSnapshot({
      account_id: acctId, repo_id: 1241734389, stars: 10, forks: 2,
      open_issues: 1, snapshot_date: "2026-09-11",
    });
    await githubQ.upsertGithubRepoSnapshot({
      account_id: secondAccountId, repo_id: 1241734389, stars: 11, forks: 2,
      open_issues: 1, snapshot_date: "2026-09-11",
    });
    const snapshot = await pool.query(
      "SELECT repository_id, stars FROM github_repo_snapshots WHERE repository_id = $1 AND snapshot_date = $2",
      [repoRows.rows[0].id, "2026-09-11"],
    );
    expect(snapshot.rows).toHaveLength(1);
    expect(snapshot.rows[0]).toMatchObject({ repository_id: repoRows.rows[0].id, stars: 11 });

    await githubQ.upsertGithubRelease({
      account_id: acctId, repo_id: 1241734389, release_id: 900001,
      tag_name: "v1", name: "v1", body: null, prerelease: 0,
      published_at: "2026-09-10T00:00:00.000Z", html_url: null, total_downloads: 10,
    });
    await githubQ.upsertGithubRelease({
      account_id: secondAccountId, repo_id: 1241734389, release_id: 900001,
      tag_name: "v1", name: "v1", body: null, prerelease: 0,
      published_at: "2026-09-10T00:00:00.000Z", html_url: null, total_downloads: 12,
    });
    const releases = await githubQ.getGithubReleases(secondAccountId, 1241734389);
    expect(releases).toHaveLength(1);
    expect(releases[0].total_downloads).toBe(12);
  });

  it("rolls back the entire asset replacement when a later asset is invalid", async () => {
    const { PgReleaseWrite } = await import("../lib/infra/drizzle/PgReleaseWrite");
    const writer = new PgReleaseWrite();
    const pool = getTestPool();
    const { rows } = await pool.query(`INSERT INTO github_releases
      (account_id, repo_id, release_id, tag_name) VALUES ($1, 200, 900002, 'v2') RETURNING id`, [acctId]);
    const id = rows[0].id;
    await writer.replaceAssets(id, [{ name: "original.zip", download_count: 42 }]);
    const before = await pool.query("SELECT * FROM github_release_assets WHERE release_id = $1", [id]);
    await expect(writer.replaceAssets(id, [{ name: "new.zip" }, { name: null }])).rejects.toThrow();
    const after = await pool.query("SELECT * FROM github_release_assets WHERE release_id = $1", [id]);
    expect(after.rows).toEqual(before.rows);
  });

  it("keeps legacy history visible while repository backfill is incomplete", async () => {
    const pool = getTestPool();
    const day = new Date().toISOString().slice(0, 10);
    await pool.query(`INSERT INTO github_traffic_views (account_id, repo_id, date, count, uniques)
      VALUES ($1, 200, $2, 123, 45)`, [acctId, day]);
    const views = await githubQ.getGithubTrafficViews(acctId, 200);
    expect(views.some(row => row.count === 123 && row.repository_id === null)).toBe(true);
    expect(await githubQ.getGithubTrafficViews(acctId, 999999)).toEqual([]);
  });

  it("upserts a contribution", async () => {
    await githubQ.upsertGithubContribution({ account_id: acctId, date: "2024-01-01", count: 5, level: 2 });
    const contribs = await githubQ.getGithubContributions(acctId);
    expect(contribs.length).toBe(1);
    expect(contribs[0].count).toBe(5);
  });
});

describe("gitlab queries", () => {
  let acctId: number;

  beforeAll(async () => {
    const u = await usersQ.insertUser({ username: `gl_user_${Date.now()}`, password_hash: "pass", role: "user" });
    const pool = getTestPool();
    const { rows } = await pool.query(
      "INSERT INTO accounts (owner_id, screen_name, platform, auth_token) VALUES ($1, $2, $3, $4) RETURNING *",
      [u.id, "gl_test", "gitlab", "tok"]
    );
    acctId = rows[0].id;
  });

  it("inserts stats and gets overview", async () => {
    await gitlabQ.insertGitlabStats({ account_id: acctId, public_projects: 5, followers: 10, following: 3 });
    const overview = await gitlabQ.getGitlabOverview(acctId);
    expect(overview).toBeDefined();
  });

  it("upserts a contribution", async () => {
    await gitlabQ.upsertGitlabContribution({ account_id: acctId, date: "2024-01-01", count: 3 });
    const contribs = await gitlabQ.getGitlabContributions(acctId);
    expect(contribs.length).toBe(1);
    expect(contribs[0].count).toBe(3);
  });
});

describe("top content service queries", () => {
  let ghAcctId: number;
  let glAcctId: number;

  beforeAll(async () => {
    const u = await usersQ.insertUser({ username: `top_content_${Date.now()}`, password_hash: "pass", role: "user" });
    const pool = getTestPool();
    const [gh, gl] = await Promise.all([
      pool.query("INSERT INTO accounts (owner_id, screen_name, platform, auth_token) VALUES ($1, $2, $3, $4) RETURNING id", [u.id, "tc_gh", "github", "tok"]),
      pool.query("INSERT INTO accounts (owner_id, screen_name, platform, auth_token) VALUES ($1, $2, $3, $4) RETURNING id", [u.id, "tc_gl", "gitlab", "tok"]),
    ]);
    ghAcctId = gh.rows[0].id;
    glAcctId = gl.rows[0].id;

    const today = new Date();
    const dayStr = (offset: number) => new Date(today.getTime() - offset * 86_400_000).toISOString().slice(0, 10);

    // GitHub: baseline snapshot (10 days ago), current repo has grown.
    await pool.query(
      `INSERT INTO github_repo_snapshots (account_id, repo_id, stars, forks, snapshot_date) VALUES ($1, 100, 50, 5, $2)`,
      [ghAcctId, dayStr(10)],
    );
    const rising = await pool.query(
      `INSERT INTO github_repos (account_id, repo_id, name, full_name, stars, forks, is_fork)
       VALUES ($1, 100, 'rising', 'tc_gh/rising', 80, 8, 0) RETURNING id`,
      [ghAcctId],
    );
    // Surfacing in top content (and every other surface reading github_repos)
    // requires the repository to be watched.
    await pool.query(
      `INSERT INTO github_repository_tracking (account_id, repository_id, enabled) VALUES ($1, $2, 1)`,
      [ghAcctId, rising.rows[0].id],
    );
    // A repository the user has unselected, with identical growth, must not
    // appear even though its rows and history are still present.
    await pool.query(
      `INSERT INTO github_repo_snapshots (account_id, repo_id, stars, forks, snapshot_date) VALUES ($1, 101, 50, 5, $2)`,
      [ghAcctId, dayStr(10)],
    );
    const hidden = await pool.query(
      `INSERT INTO github_repos (account_id, repo_id, name, full_name, stars, forks, is_fork)
       VALUES ($1, 101, 'hidden', 'tc_gh/hidden', 80, 8, 0) RETURNING id`,
      [ghAcctId],
    );
    await pool.query(
      `INSERT INTO github_repository_tracking (account_id, repository_id, enabled) VALUES ($1, $2, 0)`,
      [ghAcctId, hidden.rows[0].id],
    );
    // GitHub release published inside the window.
    await pool.query(
      `INSERT INTO github_releases (account_id, repo_id, release_id, tag_name, name, published_at, html_url, total_downloads)
       VALUES ($1, 100, 9001, 'v1.0', 'First release', $2, 'https://github.com/tc_gh/rising/releases/v1.0', 250)`,
      [ghAcctId, dayStr(3)],
    );

    // GitLab: project with snapshot and a release + assets inside the window.
    await pool.query(
      `INSERT INTO gitlab_project_snapshots (account_id, project_id, stars, forks, snapshot_date) VALUES ($1, 200, 30, 3, $2)`,
      [glAcctId, dayStr(10)],
    );
    await pool.query(
      `INSERT INTO gitlab_projects (account_id, project_id, name, path_with_namespace, stars, forks, is_fork)
       VALUES ($1, 200, 'growing', 'tc_gl/growing', 45, 6, 0)`,
      [glAcctId],
    );
    const rel = await pool.query(
      `INSERT INTO gitlab_releases (account_id, project_id, release_tag, name, released_at)
       VALUES ($1, 200, 'v0.1', 'Initial release', $2) RETURNING id`,
      [glAcctId, dayStr(2)],
    );
    const releaseRowId = rel.rows[0].id;
    await pool.query(
      `INSERT INTO gitlab_release_assets (release_id, name, download_count) VALUES ($1, 'app.tar.gz', 120)`,
      [releaseRowId],
    );
  });

  it("returns github and gitlab items without SQL errors", async () => {
    const accounts = [
      { id: ghAcctId, screen_name: "tc_gh", platform: "github", is_active: 1 },
      { id: glAcctId, screen_name: "tc_gl", platform: "gitlab", is_active: 1 },
    ];
    const result = await getTopContent(accounts, 7);

    expect(result.items.length).toBeGreaterThan(0);

    const kinds = new Set(result.items.map((item) => item.kind));
    expect(kinds.has("release")).toBe(true);
    expect(kinds.has("repo_growth")).toBe(true);

    const ghRepo = result.items.find((item) => item.kind === "repo_growth" && item.platform === "github");
    expect(ghRepo).toBeDefined();
    expect(ghRepo!.metricValue).toBe(30); // 80 - 50
    expect(ghRepo!.growthRate).toBe(60); // (80 - 50) / 50

    const glRelease = result.items.find((item) => item.kind === "release" && item.platform === "gitlab");
    expect(glRelease).toBeDefined();
    expect(glRelease!.metricValue).toBe(120); // summed from gitlab_release_assets

    const ghRelease = result.items.find((item) => item.kind === "release" && item.platform === "github");
    expect(ghRelease).toBeDefined();
    expect(ghRelease!.metricValue).toBe(250);

    // The unwatched repository is absent from every surface.
    expect(result.items.some((item) => item.fullName === "tc_gh/hidden")).toBe(false);
  });
});

// ─── GitHub watchlist: selection-based monitoring ──────────────────────────
//
// These live in this file rather than their own because `resetTestDb()` drops
// and recreates every table: two files doing that in parallel collide in the
// system catalog. One file owns the DB reset.

/** Insert a repository plus its tracking relation; returns `github_repos.id`. */
async function addGithubRepoFor(accountId: number, repoId: number, fullName: string, enabled = true): Promise<number> {
  const pool = getTestPool();
  const { rows } = await pool.query(
    `INSERT INTO github_repos (account_id, repo_id, github_id, name, full_name, owner_login, owner_type)
     VALUES ($1, $2::int, $2::bigint, $3, $4, $5, 'User') RETURNING id`,
    [accountId, repoId, fullName.split("/")[1], fullName, fullName.split("/")[0]],
  );
  const githubReposId = rows[0].id as number;
  await pool.query(
    "INSERT INTO github_repository_tracking (account_id, repository_id, enabled) VALUES ($1, $2, $3)",
    [accountId, githubReposId, enabled ? 1 : 0],
  );
  return githubReposId;
}

async function createWatchAccount(suffix: string): Promise<number> {
  const user = await usersQ.insertUser({ username: `watch_${suffix}_${Date.now()}`, password_hash: "pass", role: "user" });
  const { rows } = await getTestPool().query(
    "INSERT INTO accounts (owner_id, screen_name, platform, auth_token) VALUES ($1, $2, 'github', 'tok') RETURNING id",
    [user.id, `watch_${suffix}`],
  );
  return rows[0].id as number;
}

describe("github watchlist", () => {
  let watchAccountId: number;

  beforeAll(async () => {
    watchAccountId = await createWatchAccount("main");
  });

  it("never deletes a tracking row or its history when unselecting", async () => {
    const keep = await addGithubRepoFor(watchAccountId, 900001, "alice/keep");
    const drop = await addGithubRepoFor(watchAccountId, 900002, "alice/drop");
    await getTestPool().query(
      "INSERT INTO github_repo_snapshots (account_id, repo_id, repository_id, stars, snapshot_date) VALUES ($1, 900002, $2, 5, '2026-09-01')",
      [watchAccountId, drop],
    );

    await setGithubWatchlist(watchAccountId, [keep]);
    const after = await listGithubWatchlist(watchAccountId);
    expect(after.find((r) => r.githubReposId === keep)?.enabled).toBe(true);
    expect(after.find((r) => r.githubReposId === drop)?.enabled).toBe(false);
    // The row and its history are still there — only the flag moved.
    expect(after).toHaveLength(2);
    const snapshots = await getTestPool().query(
      "SELECT count(*)::int AS n FROM github_repo_snapshots WHERE account_id = $1 AND repo_id = 900002",
      [watchAccountId],
    );
    expect(snapshots.rows[0].n).toBe(1);

    // Re-selecting resumes exactly where it left off.
    await setGithubWatchlist(watchAccountId, [keep, drop]);
    const reselected = await listGithubWatchlist(watchAccountId);
    expect(reselected.every((r) => r.enabled)).toBe(true);
  });

  it("reports which repositories are monitored, and why a failing one is failing", async () => {
    const failing = (await listGithubWatchlist(watchAccountId)).find((r) => r.githubId === 900002)!;
    await markGithubTrackingError(watchAccountId, failing.githubReposId, "GitHub repository 404");
    expect(await listGithubWatchedRepoIds([watchAccountId])).toHaveLength(2);
    const row = (await listGithubWatchlist(watchAccountId)).find((r) => r.githubId === 900002);
    expect(row?.lastError).toContain("404");
  });

  it("tells 'nothing selected' apart from 'nothing tracked yet'", async () => {
    const fresh = await createWatchAccount("fresh");
    expect(await hasGithubTrackingRelation(fresh)).toBe(false);

    // No tracking rows at all: the legacy overview fallback still applies.
    await getTestPool().query(
      "INSERT INTO github_repos (account_id, repo_id, github_id, name, full_name) VALUES ($1, 800001, 800001, 'legacy', 'alice/legacy')",
      [fresh],
    );
    expect((await getGithubOverview(fresh)).totalRepos).toBe(1);

    // With tracking rows present but none enabled, nothing is monitored and
    // nothing may be shown — the repositories must NOT come back.
    const reposId = (await getTestPool().query("SELECT id FROM github_repos WHERE account_id = $1", [fresh])).rows[0].id;
    await getTestPool().query(
      "INSERT INTO github_repository_tracking (account_id, repository_id, enabled) VALUES ($1, $2, 0)",
      [fresh, reposId],
    );
    expect(await hasGithubTrackingRelation(fresh)).toBe(true);
    const selectedNone = await getGithubOverview(fresh);
    expect(selectedNone.totalRepos).toBe(0);
    expect(selectedNone.allRepos).toEqual([]);

    // ...and the shared filter matches nothing either.
    const filter = await githubWatchedReposFilter([fresh]);
    expect(await getDb().select({ id: github_repos.id }).from(github_repos).where(filter)).toHaveLength(0);
  });

  it("filters non-GitHub surfaces down to monitored repositories only", async () => {
    const accountId = await createWatchAccount("filter");
    const pool = getTestPool();
    const watched = await pool.query(
      "INSERT INTO github_repos (account_id, repo_id, github_id, name, full_name) VALUES ($1, 700001, 700001, 'w', 'a/w') RETURNING id",
      [accountId],
    );
    const unwatched = await pool.query(
      "INSERT INTO github_repos (account_id, repo_id, github_id, name, full_name) VALUES ($1, 700002, 700002, 'u', 'a/u') RETURNING id",
      [accountId],
    );
    await pool.query("INSERT INTO github_repository_tracking (account_id, repository_id, enabled) VALUES ($1, $2, 1)", [accountId, watched.rows[0].id]);
    await pool.query("INSERT INTO github_repository_tracking (account_id, repository_id, enabled) VALUES ($1, $2, 0)", [accountId, unwatched.rows[0].id]);

    expect(await listGithubWatchedRepoIds([accountId])).toEqual([watched.rows[0].id]);
  });
});

describe("github discovery sources", () => {
  let sourceAccount: number;

  beforeAll(async () => {
    sourceAccount = await createWatchAccount("sources");
  });

  it("soft-disables a removed organization instead of deleting it, and keeps its identity", async () => {
    await upsertGithubSource({ account_id: sourceAccount, source_type: "organization", login: "ShiinaLabs", github_id: 1234, node_id: "O_1" });
    await setGithubSources(sourceAccount, ["ShiinaLabs", "libsese"]);
    expect((await listGithubSourceRows(sourceAccount)).map((r) => r.login).sort()).toEqual(["ShiinaLabs", "libsese"]);

    await setGithubSources(sourceAccount, ["ShiinaLabs"]);
    const rows = await listGithubSourceRows(sourceAccount);
    expect(rows.find((r) => r.login === "ShiinaLabs")?.enabled).toBe(true);
    expect(rows.find((r) => r.login === "libsese")?.enabled).toBe(false);

    // The row survives, and re-adding restores it without losing the captured id.
    expect(rows).toHaveLength(2);
    await setGithubSources(sourceAccount, ["ShiinaLabs", "libsese"]);
    expect((await listGithubSourceRows(sourceAccount)).find((r) => r.login === "libsese")?.enabled).toBe(true);
    const identity = await getTestPool().query(
      "SELECT github_id, node_id FROM github_sources WHERE account_id = $1 AND login = 'ShiinaLabs'",
      [sourceAccount],
    );
    expect(Number(identity.rows[0].github_id)).toBe(1234);
    expect(identity.rows[0].node_id).toBe("O_1");
  });

  it("re-enabling a source does not wipe an identity captured earlier", async () => {
    await upsertGithubSource({ account_id: sourceAccount, source_type: "organization", login: "DreamerQcl" });
    const created = await getTestPool().query(
      "SELECT github_id FROM github_sources WHERE account_id = $1 AND login = 'DreamerQcl'",
      [sourceAccount],
    );
    expect(created.rows[0].github_id).toBeNull();
    // A later upsert that supplies no identity must not null out one that exists.
    await upsertGithubSource({ account_id: sourceAccount, source_type: "organization", login: "ShiinaLabs" });
    const kept = await getTestPool().query(
      "SELECT github_id FROM github_sources WHERE account_id = $1 AND login = 'ShiinaLabs'",
      [sourceAccount],
    );
    expect(Number(kept.rows[0].github_id)).toBe(1234);
  });

  it("clears every organization when the selection is empty", async () => {
    await setGithubSources(sourceAccount, []);
    expect((await listGithubSourceRows(sourceAccount)).every((r) => !r.enabled)).toBe(true);
  });
});

// ─── GitHub L2 telemetry ───────────────────────────────────────────────────
//
// These need a database: SyncTelemetry returns early when no pool is
// initialised, so a unit test without PostgreSQL never reaches the loop.

describe("github L2 telemetry", () => {
  const telemetryRepo = (accountId: number, repoId: number, fullName: string) => ({
    type: "RepoMetaFetched" as const,
    repo: { accountId, repoId, fullName } as never,
  });

  it("keeps collecting after a repository fails, and reports it", async () => {
    const accountId = await createWatchAccount("l2");
    await addGithubRepoFor(accountId, 600001, "alice/ok");
    await addGithubRepoFor(accountId, 600002, "alice/broken");
    const account = { id: accountId, screenName: "l2", platform: "github", authToken: "tok" };

    // The failing repository comes FIRST. Previously the per-repository
    // identity lookup sat outside the guard, so one failure aborted the whole
    // loop and every repository after it silently stopped updating — a fixed
    // subset of repositories stayed stale while the rest looked healthy.
    const fetcher = {
      fetchRepoMeta: async () => [
        telemetryRepo(accountId, 600002, "alice/broken"),
        telemetryRepo(accountId, 600001, "alice/ok"),
      ],
    };
    const client = {
      fetchRepoTraffic: async (fullName: string) => {
        if (fullName === "alice/broken") throw new Error("GitHub traffic 500");
        return { clones: [{ date: "2026-09-12", count: 5, uniques: 2 }], views: [], referrers: [], paths: [], errors: [] };
      },
    };

    const result = await new SyncTelemetry({} as never, fetcher as never, client as never).execute(account as never);

    expect(result.repos).toBe(2);
    expect(result.trafficFailures).toEqual([{ fullName: "alice/broken", message: "GitHub traffic 500" }]);
    // The repository AFTER the failure was still collected.
    const written = await getTestPool().query(
      "SELECT count(*)::int AS n FROM github_traffic_clones WHERE account_id = $1 AND repo_id = 600001",
      [accountId],
    );
    expect(written.rows[0].n).toBe(1);
  });

  it("updates existing daily traffic rows and popular-item snapshots", async () => {
    const accountId = await createWatchAccount("l2refresh");
    await addGithubRepoFor(accountId, 600004, "alice/refresh");
    const account = { id: accountId, screenName: "l2refresh", platform: "github", authToken: "tok" };
    const fetcher = { fetchRepoMeta: async () => [telemetryRepo(accountId, 600004, "alice/refresh")] };
    let count = 5;
    const client = {
      fetchRepoTraffic: async () => ({
        clones: [{ date: "2026-09-12", count, uniques: count - 2 }],
        views: [{ date: "2026-09-12", count: count * 2, uniques: count }],
        referrers: [{ referrer: "example.com", count, uniques: count - 2 }],
        paths: [{ path: "/README.md", title: "README", count, uniques: count - 2 }],
        errors: [],
      }),
    };
    const sync = new SyncTelemetry({} as never, fetcher as never, client as never);

    await sync.execute(account as never);
    count = 9;
    await sync.execute(account as never);

    const pool = getTestPool();
    const clones = await pool.query(
      "SELECT count, uniques FROM github_traffic_clones WHERE account_id = $1 AND repo_id = 600004 AND date = '2026-09-12'",
      [accountId],
    );
    const referrers = await pool.query(
      "SELECT count, uniques FROM github_referrers WHERE account_id = $1 AND repo_id = 600004 AND referrer = 'example.com'",
      [accountId],
    );
    const paths = await pool.query(
      "SELECT count, uniques FROM github_paths WHERE account_id = $1 AND repo_id = 600004 AND path = '/README.md'",
      [accountId],
    );
    const views = await pool.query(
      "SELECT count, uniques FROM github_traffic_views WHERE account_id = $1 AND repo_id = 600004 AND date = '2026-09-12'",
      [accountId],
    );

    expect(clones.rows).toEqual([{ count: 9, uniques: 7 }]);
    expect(views.rows).toEqual([{ count: 18, uniques: 9 }]);
    expect(referrers.rows).toEqual([{ count: 9, uniques: 7 }]);
    expect(paths.rows).toEqual([{ count: 9, uniques: 7 }]);
  });

  it("writes the data that did come back and reports only the failing endpoints", async () => {
    const accountId = await createWatchAccount("l2partial");
    await addGithubRepoFor(accountId, 600003, "alice/partial");
    const account = { id: accountId, screenName: "l2partial", platform: "github", authToken: "tok" };
    const fetcher = { fetchRepoMeta: async () => [telemetryRepo(accountId, 600003, "alice/partial")] };
    const client = {
      fetchRepoTraffic: async () => ({
        clones: [{ date: "2026-09-12", count: 9, uniques: 4 }],
        views: [],
        referrers: [],
        paths: [],
        errors: ["paths 403 (traffic needs push access): Resource not accessible"],
      }),
    };

    const result = await new SyncTelemetry({} as never, fetcher as never, client as never).execute(account as never);

    expect(result.trafficFailures).toHaveLength(1);
    expect(result.trafficFailures[0].message).toContain("push access");
    const written = await getTestPool().query(
      "SELECT count, uniques FROM github_traffic_clones WHERE account_id = $1 AND repo_id = 600003",
      [accountId],
    );
    // Partial data is still persisted rather than discarded with the failure.
    expect(written.rows).toEqual([{ count: 9, uniques: 4 }]);
  });
});

// Share this suite's isolated database lifecycle with the other repository tests.
describe("independent App Store Connect foundation", () => {
  let viewer: { id: number; role: string };
  let otherViewer: { id: number; role: string };
  let privateKey: string;
  const input = () => ({ name: "ASC test team", issuerId: "00000000-0000-4000-8000-000000000001", keyId: "ABC1234567", privateKey, vendorNumber: null });
  const apps = [{ apple_id: "123", name: "Example", bundle_id: "example.app", sku: "example-sku" }];

  beforeAll(async () => {
    initCrypto("ab".repeat(32));
    const owner = await usersQ.insertUser({ username: "asc_owner", password_hash: "hash", role: "user" });
    const other = await usersQ.insertUser({ username: "asc_other", password_hash: "hash", role: "user" });
    viewer = { id: owner.id, role: "user" };
    otherViewer = { id: other.id, role: "user" };
    privateKey = await exportPKCS8((await generateKeyPair("ES256", { extractable: true })).privateKey);
  });

  it("guards duplicate source runs, recovers stale work and prunes only finished history", async () => {
    const connection = await appStoreRepo.createWithApps({ owner_id: viewer.id, name: "Run lifecycle", issuer_id: input().issuerId, key_id: input().keyId, private_key_encrypted: "synthetic-encrypted" }, [], new Date().toISOString());
    const first = await appStoreRepo.startRun(connection.id, "sales", "revenue");
    await expect(appStoreRepo.startRun(connection.id, "sales", "revenue")).rejects.toBeInstanceOf(appStoreRepo.AppStoreSyncBusyError);
    expect(await appStoreRepo.recoverStaleRuns(new Date(Date.now() + 1_000))).toBe(1);
    expect(await appStoreRepo.getLatestRunForSource(connection.id, "sales", "revenue")).toMatchObject({ status: "error", error_message: "stale_run_recovered", finished_at: expect.any(String) });
    const next = await appStoreRepo.startRun(connection.id, "sales", "revenue");
    await appStoreRepo.finishRun(next, "success");
    await getTestPool().query("UPDATE app_store_sync_runs SET finished_at = '2025-01-01T00:00:00.000Z' WHERE id = $1", [next.id]);
    expect(await appStoreRepo.pruneFinishedRuns(new Date("2026-01-01T00:00:00.000Z"))).toBe(1);
    expect(await appStoreRepo.getLatestRunForSource(connection.id, "sales", "revenue")).toMatchObject({ id: first.id, status: "error" });
  });

  it("validates before creation, encrypts the private key and returns only metadata", async () => {
    const spy = vi.spyOn(AppStoreConnectClient.prototype, "listApps").mockResolvedValue(apps);
    try {
      const created = await appStoreService.createConnection(viewer, { ...input(), owner_id: otherViewer.id });
      expect(created).toMatchObject({ owner_id: viewer.id, private_key_configured: true, vendor_number: null });
      expect(JSON.stringify(created)).not.toContain("PRIVATE KEY");
      expect(created).not.toHaveProperty("private_key_encrypted");
      const stored = (await appStoreRepo.getConnection(created.id))!;
      expect(stored.private_key_encrypted).toMatch(/^v1:/);
      expect(decrypt(stored.private_key_encrypted)).toBe(privateKey);
      const detail = await appStoreService.getConnectionDetail(created.id, viewer);
      expect(detail.apps).toMatchObject([{ apple_id: "123", is_enabled: false }]);
      expect(detail.recentSyncRuns).toMatchObject([{ kind: "metadata", status: "success" }]);
      expect(await appStoreService.listConnections(otherViewer)).toEqual([]);
      expect(await appStoreService.listConnections({ id: 0, role: "admin" })).toEqual(expect.arrayContaining([created]));
    } finally { spy.mockRestore(); }
  });

  it("does not create a connection when Apple rejects the credential or input is invalid", async () => {
    const before = await appStoreService.listConnections(viewer);
    const spy = vi.spyOn(AppStoreConnectClient.prototype, "listApps").mockRejectedValue(new AppStoreApiError(403, "FORBIDDEN_ERROR", "Apple API (403): missing permission"));
    try {
      await expect(appStoreService.createConnection(viewer, input())).rejects.toMatchObject({ status: 403 });
      await expect(appStoreService.createConnection(viewer, { ...input(), privateKey: "invalid" })).rejects.toMatchObject({ code: "invalid_private_key" });
      await expect(appStoreService.createConnection(viewer, { ...input(), issuerId: "" })).rejects.toMatchObject({ code: "invalid_input" });
      expect(await appStoreService.listConnections(viewer)).toEqual(before);
    } finally { spy.mockRestore(); }
  });

  it("preserves app selection across discovery, stores metadata updates and restricts ownership", async () => {
    const spy = vi.spyOn(AppStoreConnectClient.prototype, "listApps").mockResolvedValue(apps);
    try {
      const connection = await appStoreService.createConnection(viewer, input());
      const app = (await appStoreService.getConnectionDetail(connection.id, viewer)).apps[0];
      await expect(appStoreService.getConnectionDetail(connection.id, otherViewer)).rejects.toMatchObject({ code: "forbidden" });
      await expect(appStoreService.refreshApps(connection.id, otherViewer)).rejects.toMatchObject({ code: "forbidden" });
      await expect(appStoreService.updateConnection(connection.id, otherViewer, { isActive: false })).rejects.toMatchObject({ code: "forbidden" });
      await expect(appStoreService.deleteConnection(connection.id, otherViewer)).rejects.toMatchObject({ code: "forbidden" });
      await expect(appStoreService.setAppEnabled(connection.id, app.id, otherViewer, { isEnabled: true })).rejects.toMatchObject({ code: "forbidden" });
      await appStoreService.setAppEnabled(connection.id, app.id, viewer, { isEnabled: true });
      spy.mockResolvedValue([{ ...apps[0], name: "Renamed" }, { ...apps[0], apple_id: "456" }]);
      const refreshed = await appStoreService.refreshApps(connection.id, viewer);
      expect(refreshed.apps).toHaveLength(2);
      expect(refreshed.apps.find((row) => row.apple_id === "123")).toMatchObject({ id: app.id, name: "Renamed", is_enabled: true });
      expect(refreshed.apps.find((row) => row.apple_id === "456")).toMatchObject({ is_enabled: false });
      const another = await appStoreService.createConnection(viewer, input());
      await expect(appStoreService.setAppEnabled(another.id, app.id, viewer, { isEnabled: false })).rejects.toMatchObject({ code: "not_found" });
    } finally { spy.mockRestore(); }
  });

  it("keeps working data and credentials intact after a failed refresh or credential edit", async () => {
    const spy = vi.spyOn(AppStoreConnectClient.prototype, "listApps").mockResolvedValue(apps);
    try {
      const connection = await appStoreService.createConnection(viewer, input());
      const before = await appStoreRepo.getConnection(connection.id);
      spy.mockRejectedValue(new AppStoreApiError(401, "NOT_AUTHORIZED", "Apple API (401): revoked key"));
      await expect(appStoreService.refreshApps(connection.id, viewer)).rejects.toMatchObject({ status: 401 });
      await expect(appStoreService.updateConnection(connection.id, viewer, { keyId: "NEW1234567" })).rejects.toMatchObject({ status: 401 });
      expect(await appStoreRepo.getConnection(connection.id)).toEqual(before);
      const detail = await appStoreService.getConnectionDetail(connection.id, viewer);
      expect(detail.apps).toHaveLength(1);
      expect(detail.recentSyncRuns.map((run) => run.status)).toEqual(["error", "error", "success"]);
      expect(detail.recentSyncRuns[0].error_message).toContain("revoked key");
      spy.mockResolvedValue(apps);
      const edited = await appStoreService.updateConnection(connection.id, viewer, { name: "Updated team", keyId: "NEW1234567", privateKey, vendorNumber: "12345678" });
      expect(edited).toMatchObject({ name: "Updated team", key_id: "NEW1234567", vendor_number: "12345678" });
    } finally { spy.mockRestore(); }
  });

  it("supports vendor setup and disabling without decrypting a damaged credential", async () => {
    const row = await appStoreRepo.createWithApps({ owner_id: viewer.id, name: "Damaged credential", issuer_id: input().issuerId, key_id: input().keyId, private_key_encrypted: "v1:invalid" }, [], new Date().toISOString());
    await appStoreService.updateConnection(row.id, viewer, { vendorNumber: "888", isActive: false });
    expect((await appStoreService.getConnectionDetail(row.id, viewer)).connection).toMatchObject({ vendor_number: "888", is_active: false });
    await expect(appStoreService.refreshApps(row.id, viewer)).rejects.toMatchObject({ code: "connection_disabled" });
    await appStoreService.updateConnection(row.id, viewer, { isActive: true });
    await expect(appStoreService.refreshApps(row.id, viewer)).rejects.toMatchObject({ code: "credential_unavailable" });
    await appStoreService.deleteConnection(row.id, viewer);
    await expect(appStoreService.getConnectionDetail(row.id, viewer)).rejects.toMatchObject({ code: "not_found" });
  });

  it("rejects a stale metadata commit after disabling or deleting a connection", async () => {
    const row = await appStoreRepo.createWithApps({ owner_id: viewer.id, name: "Concurrent sync", issuer_id: input().issuerId, key_id: input().keyId, private_key_encrypted: "configured" }, apps, new Date().toISOString());
    await appStoreService.updateConnection(row.id, viewer, { isActive: false });
    await expect(appStoreRepo.saveConnection(row, {}, [{ ...apps[0], name: "Stale" }])).rejects.toBeInstanceOf(appStoreRepo.AppStoreConflictError);
    expect((await appStoreRepo.getApps(row.id))[0].name).toBe("Example");
    const latest = (await appStoreRepo.getConnection(row.id))!;
    await appStoreService.deleteConnection(row.id, viewer);
    await expect(appStoreRepo.saveConnection(latest, { is_active: true }, apps)).rejects.toBeInstanceOf(appStoreRepo.AppStoreConflictError);
  });

  it("rolls back connection changes if an app upsert fails", async () => {
    const row = await appStoreRepo.createWithApps({ owner_id: viewer.id, name: "Atomic sync", issuer_id: input().issuerId, key_id: input().keyId, private_key_encrypted: "configured" }, apps, new Date().toISOString());
    const run = await appStoreRepo.startRun(row.id);
    await expect(appStoreRepo.saveConnection(row, { name: "Must roll back" }, [{ ...apps[0], name: null as unknown as string }], run)).rejects.toThrow();
    expect(await appStoreRepo.getConnection(row.id)).toEqual(row);
    expect((await appStoreRepo.getApps(row.id))[0].name).toBe("Example");
    expect((await appStoreRepo.getRecentRuns(row.id))[0].status).toBe("running");
    await appStoreRepo.failRun(run, "Database import failed");
  });

  it("keeps app enable local and adopts existing requests without duplicating setup", async () => {
    const discovery = vi.spyOn(AppStoreConnectClient.prototype, "listApps").mockResolvedValue(apps);
    const snapshot = { id: "adopt-snapshot", type: "analyticsReportRequests" as const, attributes: { accessType: "ONE_TIME_SNAPSHOT" as const, stoppedDueToInactivity: false } };
    const ongoing = { id: "adopt-ongoing", type: "analyticsReportRequests" as const, attributes: { accessType: "ONGOING" as const, stoppedDueToInactivity: false } };
    const read = vi.spyOn(AppStoreConnectClient.prototype, "listAnalyticsReportRequests").mockResolvedValue([snapshot, ongoing]);
    const create = vi.spyOn(AppStoreConnectClient.prototype, "createAnalyticsReportRequest");
    try {
      const connection = await appStoreService.createConnection(viewer, input());
      const app = (await appStoreRepo.getApps(connection.id))[0];
      const metadataSuccess = await appStoreRepo.getLastSuccessfulRun(connection.id);
      await appStoreService.setAppEnabled(connection.id, app.id, viewer, { isEnabled: true });
      expect(read).not.toHaveBeenCalled();
      expect(create).not.toHaveBeenCalled();
      const status = await setupAppStoreAnalytics(connection.id, viewer);
      expect(status).toMatchObject({ state: "waiting", enabledApps: 1, snapshot: "ready", ongoing: "active", latestData: null, completeThrough: null, lastSync: { kind: "analytics", status: "success" } });
      await setupAppStoreAnalytics(connection.id, viewer);
      expect(await appStoreAnalyticsRepo.requestsForApps([app.id])).toHaveLength(2);
      expect(create).not.toHaveBeenCalled();
      expect(await appStoreRepo.getLastSuccessfulRun(connection.id)).toEqual(metadataSuccess);
      await expect(getAppStoreAnalyticsStatus(connection.id, otherViewer)).rejects.toMatchObject({ code: "forbidden" });
      await expect(setupAppStoreAnalytics(connection.id, otherViewer)).rejects.toMatchObject({ code: "forbidden" });
      expect(await listEnabledAnalyticsApps(otherViewer)).not.toEqual(expect.arrayContaining([{ id: app.id, name: app.name }]));
      await expect(getAppStoreAnalyticsDashboard(otherViewer, { appId: app.id, from: "2026-10-01", to: "2026-10-02" })).rejects.toMatchObject({ code: "forbidden" });
      expect(await getAppStoreAnalyticsDashboard(viewer, { appId: app.id, from: "2026-10-01", to: "2026-10-02" })).toMatchObject({ updatedAt: null, overview: { impressions: null, downloads: null } });
    } finally { discovery.mockRestore(); read.mockRestore(); create.mockRestore(); }
  });

  it("retains a stopped ongoing request and creates its replacement and missing snapshot", async () => {
    const discovery = vi.spyOn(AppStoreConnectClient.prototype, "listApps").mockResolvedValue(apps);
    const stopped = { id: "stopped-ongoing", type: "analyticsReportRequests" as const, attributes: { accessType: "ONGOING" as const, stoppedDueToInactivity: true } };
    const read = vi.spyOn(AppStoreConnectClient.prototype, "listAnalyticsReportRequests").mockResolvedValue([stopped]);
    const create = vi.spyOn(AppStoreConnectClient.prototype, "createAnalyticsReportRequest").mockImplementation(async (_, accessType) => ({ id: `replacement-${accessType}`, type: "analyticsReportRequests", attributes: { accessType, stoppedDueToInactivity: false } }));
    try {
      const connection = await appStoreService.createConnection(viewer, input());
      const app = (await appStoreRepo.getApps(connection.id))[0];
      await appStoreService.setAppEnabled(connection.id, app.id, viewer, { isEnabled: true });
      await setupAppStoreAnalytics(connection.id, viewer);
      expect(create.mock.calls).toEqual([[app.apple_id, "ONE_TIME_SNAPSHOT"], [app.apple_id, "ONGOING"]]);
      const requests = await appStoreAnalyticsRepo.requestsForApps([app.id]);
      expect(requests).toHaveLength(3);
      expect(requests.find((row) => row.apple_request_id === stopped.id)?.stopped_due_to_inactivity).toBe(true);
      const another = await appStoreService.createConnection(otherViewer, input());
      const otherApp = (await appStoreRepo.getApps(another.id))[0];
      await appStoreService.setAppEnabled(another.id, otherApp.id, otherViewer, { isEnabled: true });
      await expect(appStoreAnalyticsRepo.adoptRequest(otherApp.id, stopped, another.updated_at)).rejects.toBeInstanceOf(appStoreRepo.AppStoreConflictError);
      expect((await appStoreAnalyticsRepo.requestsForApps([app.id])).find((row) => row.apple_request_id === stopped.id)?.app_id).toBe(app.id);
      await appStoreService.setAppEnabled(connection.id, app.id, viewer, { isEnabled: false });
      await expect(appStoreAnalyticsRepo.adoptRequest(app.id, stopped, connection.updated_at)).rejects.toBeInstanceOf(appStoreRepo.AppStoreConflictError);
      const columns = await getTestPool().query("SELECT column_name FROM information_schema.columns WHERE table_name='app_store_report_imports'");
      expect(columns.rows.some((row) => /url/i.test(row.column_name))).toBe(false);
    } finally { discovery.mockRestore(); read.mockRestore(); create.mockRestore(); }
  });

  it("isolates Analytics permission failures and reports partial then error without disabling discovery", async () => {
    const discovery = vi.spyOn(AppStoreConnectClient.prototype, "listApps").mockResolvedValue([...apps, { ...apps[0], apple_id: "456" }]);
    const read = vi.spyOn(AppStoreConnectClient.prototype, "listAnalyticsReportRequests").mockResolvedValue([]);
    const permission = new AppStoreApiError(403, "FORBIDDEN", "Apple API (403): request creation requires Admin");
    const create = vi.spyOn(AppStoreConnectClient.prototype, "createAnalyticsReportRequest").mockImplementation(async (appleId, accessType) => {
      if (appleId === "456") throw permission;
      return { id: `partial-${accessType}`, type: "analyticsReportRequests", attributes: { accessType, stoppedDueToInactivity: false } };
    });
    try {
      const connection = await appStoreService.createConnection(viewer, input());
      for (const app of await appStoreRepo.getApps(connection.id)) await appStoreService.setAppEnabled(connection.id, app.id, viewer, { isEnabled: true });
      const partial = await setupAppStoreAnalytics(connection.id, viewer);
      expect(partial).toMatchObject({ state: "partial", lastSync: { status: "partial" }, message: expect.stringContaining("Analytics setup requires additional App Store Connect permission.") });
      expect((await appStoreRepo.getConnection(connection.id))?.is_active).toBe(true);
      create.mockRejectedValue(permission);
      expect(await setupAppStoreAnalytics(connection.id, viewer)).toMatchObject({ state: "error", lastSync: { status: "error" } });
      expect((await appStoreService.refreshApps(connection.id, viewer)).apps).toHaveLength(2);
    } finally { discovery.mockRestore(); read.mockRestore(); create.mockRestore(); }
  });
  it("atomically replaces typed partitions, skips identical checksums and rejects stale corrections", async () => {
    const discovery = vi.spyOn(AppStoreConnectClient.prototype, "listApps").mockResolvedValue(apps);
    try {
      const connection = await appStoreService.createConnection(viewer, input());
      const app = (await appStoreRepo.getApps(connection.id))[0];
      await appStoreService.setAppEnabled(connection.id, app.id, viewer, { isEnabled: true });
      const request = await appStoreAnalyticsRepo.adoptRequest(app.id, { id: "typed-partition-request", type: "analyticsReportRequests", attributes: { accessType: "ONGOING", stoppedDueToInactivity: false } }, connection.updated_at);
      const context = { appId: app.id, connectionId: connection.id, version: connection.updated_at, requestId: request.id, reportId: "report", reportName: "App Downloads Standard", reportCategory: "COMMERCE" };
      const prepared = (instanceId: string, processingDate: string, counts: string, checksum: string) => ({ instanceId, processingDate, granularity: "DAILY" as const, segments: [{ id: "segment-1", checksum }, { id: "segment-2", checksum }], table: parseAnalyticsTsv(`Date\tApp Apple Identifier\tDownload Type\tSource Type\tTerritory\tCounts\n2026-09-29\t123\tFirst-time Download\tApp Store search\tUSA\t${counts}\n2026-09-29\t123\tRedownload\tApp Store search\tUSA\t2`) });
      const commit = async (p: ReturnType<typeof prepared>) => ascFacts.commitAnalyticsInstance(context, p, mapAnalyticsReport("downloads", p.table, { appId: app.id, appleId: "123", instanceId: p.instanceId, processingDate: p.processingDate }));
      const first = prepared("first", "2026-10-01", "10", "a".repeat(32));
      expect(await commit(first)).toBe("imported");
      expect(await commit(first)).toBe("skipped");
      expect((await ascFacts.readAnalyticsFacts([app.id])).downloads).toHaveLength(2);
      await commit(prepared("corrected", "2026-10-02", "20", "b".repeat(32)));
      expect(await commit(prepared("older", "2026-09-30", "99", "c".repeat(32)))).toBe("skipped");
      expect(await commit(prepared("equal-other", "2026-10-02", "98", "d".repeat(32)))).toBe("skipped");
      let facts = await ascFacts.readAnalyticsFacts([app.id]);
      expect(facts.downloads.map((r) => Number(r.counts))).toEqual([20, 2]);
      await commit(prepared("corrected", "2026-10-02", "21", "e".repeat(32)));
      facts = await ascFacts.readAnalyticsFacts([app.id]);
      expect(facts.downloads.map((r) => Number(r.counts))).toEqual([21, 2]);
      const bad = prepared("rollback", "2026-10-03", "1", "f".repeat(32));
      const mapped = mapAnalyticsReport("downloads", bad.table, { appId: app.id, appleId: "123", instanceId: bad.instanceId, processingDate: bad.processingDate });
      mapped.rows[1].app_id = -1; // FK failure after partition deletion must roll back facts AND manifest.
      await expect(ascFacts.commitAnalyticsInstance(context, bad, mapped)).rejects.toThrow();
      expect((await ascFacts.readAnalyticsFacts([app.id])).downloads.map((r) => Number(r.counts))).toEqual([21, 2]);
      expect((await appStoreAnalyticsRepo.importsForApps([app.id])).some((r) => r.apple_instance_id === "rollback")).toBe(false);
      const dashboard = await getAppStoreAnalyticsDashboard(viewer, { appId: app.id, from: "2026-09-29", to: "2026-09-29" });
      expect(dashboard).toMatchObject({ updatedAt: "2026-09-29", completeThrough: null, overview: { firstTimeDownloads: 21, downloads: 23, impressions: null, conversion: null } });
      await appStoreService.setAppEnabled(connection.id, app.id, viewer, { isEnabled: false });
      await expect(commit(prepared("disabled", "2026-10-04", "1", "0".repeat(32)))).rejects.toBeInstanceOf(appStoreRepo.AppStoreConflictError);
    } finally { discovery.mockRestore(); }
  });

  it("leaves a failed multi-segment instance untouched while importing the next instance and skipping unchanged downloads", async () => {
    const discovery = vi.spyOn(AppStoreConnectClient.prototype, "listApps").mockResolvedValue(apps);
    const requests = vi.spyOn(AppStoreConnectClient.prototype, "listAnalyticsReportRequests").mockResolvedValue([{ id: "atomic-sync-request", type: "analyticsReportRequests", attributes: { accessType: "ONGOING", stoppedDueToInactivity: false } }]);
    const reports = vi.spyOn(AppStoreConnectClient.prototype, "listAnalyticsReports").mockResolvedValue([{ id: "atomic-report", type: "analyticsReports", attributes: { name: "App Downloads Standard", category: "COMMERCE" } }]);
    const instances = vi.spyOn(AppStoreConnectClient.prototype, "listAnalyticsReportInstances").mockResolvedValue(["bad", "good"].map((id) => ({ id, type: "analyticsReportInstances", attributes: { granularity: "DAILY", processingDate: "2026-10-02" } })));
    const bytes = gzipSync("Date\tApp Apple Identifier\tDownload Type\tSource Type\tTerritory\tCounts\n2026-09-29\t123\tFirst-time Download\tApp Store search\tUSA\t5");
    const segment = (id: string) => ({ id, type: "analyticsReportSegments" as const, attributes: { url: "https://synthetic.s3.amazonaws.com/report", checksum: createHash("md5").update(bytes).digest("hex"), sizeInBytes: bytes.length } });
    const segments = vi.spyOn(AppStoreConnectClient.prototype, "listAnalyticsReportSegments").mockImplementation(async (id) => id === "bad" ? [segment("bad-one"), segment("bad-two")] : [segment("good-one")]);
    const details = vi.spyOn(AppStoreConnectClient.prototype, "getAnalyticsReportSegment").mockImplementation(async (id) => segment(id));
    const downloads = vi.spyOn(AppStoreConnectClient.prototype, "downloadAnalyticsSegment").mockImplementation(async (s) => { if (s.id === "bad-two") throw new Error("SECRET signed URL"); return bytes; });
    try {
      const connection = await appStoreService.createConnection(viewer, input());
      const app = (await appStoreRepo.getApps(connection.id))[0];
      await appStoreService.setAppEnabled(connection.id, app.id, viewer, { isEnabled: true });
      expect(await syncAppStoreAnalytics(connection.id, viewer)).toMatchObject({ status: "partial", imported: 1, errors: [expect.stringContaining("instance bad")] });
      expect((await ascFacts.readAnalyticsFacts([app.id])).downloads).toHaveLength(1);
      expect((await appStoreAnalyticsRepo.importsForApps([app.id])).map((r) => r.apple_instance_id)).toEqual(["good"]);
      expect((await appStoreRepo.getRecentRuns(connection.id))[0].error_message).not.toContain("SECRET");
      downloads.mockClear();
      expect(await syncAppStoreAnalytics(connection.id, viewer)).toMatchObject({ skipped: 1 });
      expect(downloads.mock.calls.every(([s]) => s.id !== "good-one")).toBe(true);
      await expect(syncAppStoreAnalytics(connection.id, otherViewer)).rejects.toMatchObject({ code: "forbidden" });
    } finally { for (const spy of [discovery, requests, reports, instances, segments, details, downloads]) spy.mockRestore(); }
  });

  it("imports Revenue with separate currencies, final fiscal settlements and independent missing-vendor failures", async () => {
    const infoLog = vi.spyOn(getLogger(), "info").mockImplementation(() => undefined);
    const errorLog = vi.spyOn(getLogger(), "error").mockImplementation(() => undefined);
    const warnLog = vi.spyOn(getLogger(), "warn").mockImplementation(() => undefined);
    const discovery = vi.spyOn(AppStoreConnectClient.prototype, "listApps").mockResolvedValue(apps);
    const requests = vi.spyOn(AppStoreConnectClient.prototype, "listAnalyticsReportRequests").mockResolvedValue([]);
    const salesBytes = gzipSync("Begin Date\tEnd Date\tSKU\tApple Identifier\tParent Identifier\tProduct Type Identifier\tCountry Code\tUnits\tDeveloper Proceeds\tCurrency of Proceeds\tCustomer Price\tCustomer Currency\n09/29/2026\t09/29/2026\texample-sku\t123\t\t1\tJP\t2\t0.7\tUSD\t100\tJPY");
    const financeBytes = gzipSync("Start Date\tEnd Date\tVendor Identifier\tApple Identifier\tProduct Type Identifier\tCountry of Sale\tQuantity\tExtended Partner Share\tPartner Share Currency\n08/30/2026\t09/26/2026\texample-sku\t123\t1\tJP\t2\t1.4\tUSD\n08/30/2026\t09/26/2026\texample-sku\t123\t1\tJP\t1\t100\tJPY");
    const salesDownload = vi.spyOn(AppStoreConnectClient.prototype, "downloadSalesReport").mockResolvedValue(salesBytes);
    const financeDownload = vi.spyOn(AppStoreConnectClient.prototype, "downloadFinanceReport").mockRejectedValueOnce(new AppStoreApiError(403, "FORBIDDEN", "Insufficient report access")).mockResolvedValue(gzipSync(gunzipSync(financeBytes).toString() + "\nTotal_Rows\t2\nTotal_Amount\t101.40\nTotal_Units\t3\n"));
    try {
      const connection = await appStoreService.createConnection(viewer, { ...input(), vendorNumber: "123456" });
      const app = (await appStoreRepo.getApps(connection.id))[0];
      await appStoreService.setAppEnabled(connection.id, app.id, viewer, { isEnabled: true });
      const filters = { from: "2026-09-29", to: "2026-09-29", fiscalMonth: "2026-09", regionCode: "ZZ" };
      expect(await syncAppStoreRevenue(connection.id, viewer, filters)).toMatchObject({ status: "partial", sources: { sales: { status: "success", imported: 1 }, finance: { status: "error", errors: ["Finance; fiscal month 2026-09; region ZZ; apple_report_error status=403 code=FORBIDDEN message=Insufficient report access"] } } });
      expect(await syncAppStoreRevenue(connection.id, viewer, filters)).toMatchObject({ status: "success", sources: { sales: { skipped: 1 }, finance: { imported: 1 } } });
      const dashboard = await getAppStoreRevenueDashboard(viewer, { ...filters, appId: app.id });
      expect(dashboard.sales).toMatchObject({ units: "2", amounts: [{ currency: "JPY", proceeds: null, sales: "200" }, { currency: "USD", proceeds: "1.4", sales: null }] });
      expect(dashboard.settlements).toEqual(expect.arrayContaining([expect.objectContaining({ fiscalMonth: "2026-09", region: "ZZ", currency: "USD", earned: "1.4" }), expect.objectContaining({ currency: "JPY", earned: "100" })]));
      expect(dashboard.overview.payingUsers).toBeNull();
      expect(dashboard.subscriptions.active).toBeNull();
      salesDownload.mockRejectedValueOnce(new AppStoreApiError(404, "NOT_FOUND", "Report not available"));
      expect(await syncAppStoreRevenue(connection.id, viewer, filters)).toMatchObject({ status: "partial", sources: { sales: { status: "error", errors: ["Sales; date 2026-09-29; apple_report_error status=404 code=NOT_FOUND message=Report not available"] }, finance: { status: "success", skipped: 1 } } });
      await expect(syncAppStoreRevenue(connection.id, otherViewer, filters)).rejects.toMatchObject({ code: "forbidden" });
      await expect(getAppStoreRevenueDashboard(otherViewer, { ...filters, appId: app.id })).rejects.toMatchObject({ code: "forbidden" });
      const noVendor = await appStoreService.createConnection(viewer, input());
      const otherApp = (await appStoreRepo.getApps(noVendor.id))[0];
      await appStoreService.setAppEnabled(noVendor.id, otherApp.id, viewer, { isEnabled: true });
      expect(await syncAppStoreRevenue(noVendor.id, viewer, filters)).toMatchObject({ status: "error", sources: { analytics: { status: "waiting" }, sales: { status: "error", errors: [expect.stringContaining("vendor_required")] }, finance: { status: "error" } } });
      const clock = vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-10-02T05:50:00Z"));
      try {
        salesDownload.mockClear();
        expect(await syncAppStoreRevenue(connection.id, viewer, { ...filters, from: "2026-10-01", to: "2026-10-02" })).toMatchObject({ sources: { sales: { status: "waiting", waiting: 2, imported: 0, errors: [] } } });
        expect(salesDownload).not.toHaveBeenCalled();
      } finally { clock.mockRestore(); }
      const events = [...infoLog.mock.calls, ...errorLog.mock.calls, ...warnLog.mock.calls].map(([component, message]) => { expect(component).toBe("ASC"); return JSON.parse(message); });
      expect(events).toEqual(expect.arrayContaining([
        expect.objectContaining({ event: "sync_started", source: "finance", fiscalMonth: "2026-09" }),
        expect.objectContaining({ event: "report_failed", source: "finance", diagnostic: "Finance; fiscal month 2026-09; region ZZ; apple_report_error status=403 code=FORBIDDEN message=Insufficient report access" }),
        expect.objectContaining({ event: "report_waiting", source: "sales", date: "2026-10-01", reason: "before_daily_publication" }),
        expect.objectContaining({ event: "sync_finished", source: "finance", status: "success", imported: 1 }),
      ]));
      expect(JSON.stringify(events)).not.toContain("SECRET");
      expect(JSON.stringify(events)).not.toContain("123456");
    } finally { for (const spy of [discovery, requests, salesDownload, financeDownload, infoLog, errorLog, warnLog]) spy.mockRestore(); }
  });

  it("persists all five official fact types and replaces corrected Purchases without double counting", async () => {
    const discovery = vi.spyOn(AppStoreConnectClient.prototype, "listApps").mockResolvedValue(apps);
    try {
      const connection = await appStoreService.createConnection(viewer, input());
      const app = (await appStoreRepo.getApps(connection.id))[0];
      await appStoreService.setAppEnabled(connection.id, app.id, viewer, { isEnabled: true });
      const request = await appStoreAnalyticsRepo.adoptRequest(app.id, { id: "all-typed-request", type: "analyticsReportRequests", attributes: { accessType: "ONGOING", stoppedDueToInactivity: false } }, connection.updated_at);
      const common = { Date: "2026-09-29", "App Apple Identifier": "123", Territory: "USA" };
      const subscription = { ...common, "Subscription Name": "Synthetic Plan", "Subscription Identifier": "456", "Subscription Group": "Plans", "Subscription Group Identifier": "789", Counts: "3" };
      const rows: Record<AnalyticsReportKind, Record<string, string>> = {
        discovery: { ...common, Event: "Impression", "Page Type": "No page", "Source Type": "App Store search", Counts: "10", "Unique Counts": "8" },
        downloads: { ...common, "Download Type": "First-time Download", "Source Type": "App Store search", Counts: "2" },
        purchases: { ...common, "Purchase Type": "In-app purchase", "Content Name": "Synthetic", "Content Apple Identifier": "456", "Source Type": "App Store search", Purchases: "1", "Proceeds in USD": "0.7", "Sales in USD": "1", "Paying Users": "1" },
        subscriptionState: { ...subscription, "State Metric": "Full price", "State Metric Grouping": "Paid plans" },
        subscriptionEvent: { ...subscription, "Event Date": common.Date, "Event Sub Type": "Subscribe", "Event Grouping": "Paid Subscription Starts", "Offer Type": "" },
      };
      const commit = async (kind: AnalyticsReportKind, row: Record<string, string>, instanceId = kind, processingDate = "2026-10-02") => {
        const prepared = { instanceId, processingDate, granularity: "DAILY" as const, segments: [{ id: kind, checksum: "a".repeat(32) }], table: parseAnalyticsTsv(Object.keys(row).join("\t") + "\n" + Object.values(row).join("\t")) };
        const mapped = mapAnalyticsReport(kind, prepared.table, { appId: app.id, appleId: "123", instanceId, processingDate });
        return ascFacts.commitAnalyticsInstance({ appId: app.id, connectionId: connection.id, version: connection.updated_at, requestId: request.id, reportId: kind, reportName: analyticsReportDefinitions[kind].standardName, reportCategory: "COMMERCE" }, prepared, mapped);
      };
      for (const kind of Object.keys(rows) as AnalyticsReportKind[]) expect(await commit(kind, rows[kind])).toBe("imported");
      const analytics = await getAppStoreAnalyticsDashboard(viewer, { appId: app.id, from: common.Date, to: common.Date });
      expect(analytics).toMatchObject({ completeThrough: common.Date, overview: { impressions: 10, downloads: 2 } });
      let revenue = await getAppStoreRevenueDashboard(viewer, { appId: app.id, from: common.Date, to: common.Date });
      expect(revenue).toMatchObject({ completeThrough: common.Date, overview: { amounts: [{ currency: "USD", proceeds: "0.7", sales: "1" }] }, subscriptions: { active: "3", starts: "3" } });
      await commit("purchases", { ...rows.purchases, "Proceeds in USD": "-0.7", "Sales in USD": "-1", Purchases: "-1" }, "purchase-correction", "2026-10-03");
      revenue = await getAppStoreRevenueDashboard(viewer, { appId: app.id, from: common.Date, to: common.Date });
      expect(revenue.overview.amounts).toEqual([{ currency: "USD", proceeds: "-0.7", sales: "-1" }]);
      expect((await ascFacts.readAnalyticsFacts([app.id])).purchases).toHaveLength(1);
    } finally { discovery.mockRestore(); }
  });

});
