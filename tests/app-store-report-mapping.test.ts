import { describe, expect, it } from "vitest";
import { mapAnalyticsReport, mapSalesReport, mapFinanceReport, decimal, sumDecimals, multiplyDecimals, salesAmount } from "../lib/infra/app-store/report-mapping";
import { parseAnalyticsTsv } from "../lib/infra/app-store/analytics-tsv";
import { currencyAmounts, reliablePayingUsers, activeSubscriptionSnapshot } from "../lib/services/app-store-revenue";
import { analyticsCompleteThrough } from "../lib/services/app-store-analytics-reporting";
import { reportDiagnostic } from "../lib/services/app-store-sync";
import { latestSalesReportDate } from "../shared/app-store-revenue";
const ctx = { appId: 1, appleId: "123", instanceId: "instance", processingDate: "2026-10-02" };
function tsv(row: Record<string, string>) { return parseAnalyticsTsv(Object.keys(row).join("\t") + "\n" + Object.values(row).join("\t")); }
const common = { Date: "2026-09-29", "App Apple Identifier": "123", Territory: "USA" };
describe("Sales daily publication date", () => {
  it.each([
    ["2026-10-02T05:50:00Z", "2026-09-30"],
    ["2026-10-02T14:59:59Z", "2026-09-30"],
    ["2026-10-02T15:00:00Z", "2026-10-01"],
    ["2026-01-02T15:59:59Z", "2025-12-31"],
    ["2026-01-02T16:00:00Z", "2026-01-01"],
    ["2026-03-08T15:00:00Z", "2026-03-07"],
    ["2026-11-01T16:00:00Z", "2026-10-31"],
  ])("uses the 08:00 Pacific boundary, including DST (%s)", (now, expected) => {
    expect(latestSalesReportDate(new Date(now))).toBe(expected);
  });
});
describe("official Standard Analytics adapters (synthetic data)", () => {
  it("maps Discovery and Downloads without inventing campaigns or unique downloads", () => {
    const discovery = mapAnalyticsReport("discovery", tsv({ ...common, Event: "Impression", "Page Type": "No page", "Source Type": "App Store search", Counts: "10", "Unique Counts": "8", "Future Column": "extra" }), ctx);
    expect(discovery.rows[0]).toMatchObject({ app_id: 1, event: "Impression", counts: "10", unique_counts: "8", processing_date: ctx.processingDate });
    const download = mapAnalyticsReport("downloads", tsv({ ...common, "Download Type": "Future type", "Source Type": "Future source", Counts: "" }), ctx);
    expect(download.rows[0]).toMatchObject({ download_type: "Future type", source_type: "Future source", counts: null });
    expect(download.rows[0]).not.toHaveProperty("campaign");
  });
  it("preserves Apple-provided USD, refunds and nullable purchase fields", () => {
    const mapped = mapAnalyticsReport("purchases", tsv({ ...common, "Purchase Type": "In-app purchase", "Content Name": "Synthetic", "Content Apple Identifier": "456", "Source Type": "App Store search", Purchases: "-1", "Proceeds in USD": "-0.70", "Sales in USD": "-1.00", "Paying Users": "" }), ctx);
    expect(mapped.rows[0]).toMatchObject({ purchases: "-1", proceeds: "-0.7", sales: "-1", paying_users: null, currency: "USD" });
  });
  it("preserves unknown future subscription states and events; empty reports are valid", () => {
    const subscription = { ...common, "Subscription Name": "Synthetic plan", "Subscription Identifier": "456", "Subscription Group": "Plans", "Subscription Group Identifier": "789", Counts: "3" };
    expect(mapAnalyticsReport("subscriptionState", tsv({ ...subscription, "State Metric": "Future state", "State Metric Grouping": "Future grouping" }), ctx).rows[0]).toMatchObject({ state_metric: "Future state", counts: "3" });
    const event = tsv({ ...subscription, "Event Date": common.Date, "Event Sub Type": "Future event", "Event Grouping": "Future grouping", "Offer Type": "" });
    expect(mapAnalyticsReport("subscriptionEvent", event, ctx).rows[0]).toMatchObject({ event_sub_type: "Future event", offer_type: null });
    expect(mapAnalyticsReport("subscriptionEvent", { ...event, rows: [] }, ctx).rows).toEqual([]);
  });
  it("requires current mapped headers and diagnoses row structure without leaking business values", () => {
    expect(() => mapAnalyticsReport("downloads", tsv(common), ctx)).toThrow("Missing headers: Download Type");
    try { mapAnalyticsReport("downloads", tsv({ ...common, "Download Type": "SECRET", "Source Type": "SECRET", Counts: "SECRET" }), ctx); }
    catch (error) { expect(String(error)).toContain("row 2"); expect(String(error)).not.toContain("SECRET"); }
    expect(reportDiagnostic(new Error("SQL SECRET signed-url private-key"))).toBe("report_import_failed");
    expect(() => mapAnalyticsReport("downloads", tsv({ ...common, "App Apple Identifier": "999", "Download Type": "First-time Download", "Source Type": "App Store search", Counts: "10" }), ctx)).toThrow("app_identity_mismatch");
  });
});
describe("Sales and Finance (synthetic official schemas)", () => {
  it("keeps Sales unit prices and original customer/proceeds currencies", () => {
    const rows = mapSalesReport(tsv({ "Begin Date": "09/29/2026", "End Date": "09/29/2026", SKU: "synthetic", "Apple Identifier": "123", "Parent Identifier": "", "Product Type Identifier": "1", "Country Code": "JP", Units: "2.5", "Developer Proceeds": "0.70", "Currency of Proceeds": "USD", "Customer Price": "100", "Customer Currency": "JPY" }), 1, "2026-09-29", "hash");
    expect(rows[0]).toMatchObject({ units: "2.5", developer_proceeds: "0.7", proceeds_currency: "USD", customer_currency: "JPY" });
    expect(multiplyDecimals(rows[0].units!, rows[0].developer_proceeds!)).toBe("1.75");
  });
  it("keeps fiscal Finance at vendor scope with signed final earnings", () => {
    const rows = mapFinanceReport(tsv({ "Start Date": "08/30/2026", "End Date": "09/26/2026", "Vendor Identifier": "synthetic.product", "Apple Identifier": "456", "Product Type Identifier": "IAP", "Country of Sale": "JP", Quantity: "-2", "Extended Partner Share": "-1.40", "Partner Share Currency": "USD" }), 1, "2026-09", "ZZ", "hash");
    expect(rows[0]).toMatchObject({ fiscal_month: "2026-09", region_code: "ZZ", start_date: "2026-08-30", units: "-2", earned_amount: "-1.4", currency: "USD" });
    expect(rows[0]).not.toHaveProperty("app_id");
  });
  it("calculates exact decimals, keeps null and separates currencies", () => {
    expect(sumDecimals(["0.1", "0.2"])).toBe("0.3");
    expect(decimal("-0.000000000001")).toBe("-0.000000000001");
    expect(sumDecimals(["0", null])).toBeNull();
    expect(currencyAmounts([{ currency: "USD", proceeds: "0.1", sales: "1" }, { currency: "JPY", proceeds: "100", sales: "200" }, { currency: "USD", proceeds: "0.2", sales: null }])).toEqual([{ currency: "JPY", proceeds: "100", sales: "200" }, { currency: "USD", proceeds: "0.3", sales: null }]);
    expect(reliablePayingUsers([{ paying_users: "5" }, { paying_users: "5" }])).toBeNull();
    expect(reliablePayingUsers([{ paying_users: "0" }])).toBe("0");
  });
  it("handles Apple's signed refund prices and zero-unit partial refunds without false positive sales", () => {
    expect(decimal(".70")).toBe("0.7");
    expect(decimal("-.99")).toBe("-0.99");
    expect(salesAmount("-50", ".7")).toBe("-35");
    expect(salesAmount("-50", "-.99", true)).toBe("-49.5");
    expect(salesAmount("0", "-1.67", true)).toBeNull();
    expect(salesAmount("0", "0", true)).toBe("0");
  });
  it("uses the latest subscription snapshot per app, preserving unknown and missing states", () => {
    const rows = [
      { app_id: 1, date: "2026-09-28", state_grouping: "Paid plans", counts: "10" },
      { app_id: 1, date: "2026-09-29", state_grouping: "Paid plans", counts: "12" },
      { app_id: 1, date: "2026-09-29", state_grouping: "Churned", counts: "3" },
      { app_id: 2, date: "2026-09-28", state_grouping: "Subscription offers", counts: "2" },
    ];
    expect(activeSubscriptionSnapshot(rows, [1, 2])).toBe("14");
    expect(activeSubscriptionSnapshot(rows, [1, 3])).toBeNull();
    expect(activeSubscriptionSnapshot([{ ...rows[1], state_grouping: "Future state" }], [1])).toBeNull();
    expect(activeSubscriptionSnapshot([{ ...rows[1], counts: null }], [1])).toBeNull();
  });
  it("derives completeness from contiguous imported coverage and documented processing lag", () => {
    const partitions = ["discovery", "downloads"].flatMap((report_kind) => ["2026-09-28", "2026-09-29"].map((date) => ({ app_id: 1, report_kind, date, processing_date: "2026-10-01" })));
    expect(analyticsCompleteThrough(partitions, [1], ["discovery", "downloads"], "2026-09-28", "2026-09-30")).toBe("2026-09-28");
    expect(analyticsCompleteThrough(partitions, [1, 2], ["discovery", "downloads"], "2026-09-28", "2026-09-30")).toBeNull();
  });
});
