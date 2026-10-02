export interface RevenueAmounts { currency: string; proceeds: string | null; sales: string | null }
export interface RevenueDashboard {
  updatedAt: string | null;
  completeThrough: string | null;
  overview: { amounts: RevenueAmounts[]; units: string | null; payingUsers: string | null };
  trend: ({ date: string } & RevenueAmounts)[];
  byApp: ({ app: string } & RevenueAmounts)[];
  byTerritory: ({ territory: string } & RevenueAmounts)[];
  sales: { rows: { date: string; app: string; item: string | null; sku: string | null; productType: string | null; units: string | null; unitProceeds: string | null; unitPrice: string | null; proceeds: string | null; proceedsCurrency: string | null; sales: string | null; salesCurrency: string | null; territory: string | null }[]; amounts: RevenueAmounts[]; units: string | null; trend: ({ date: string } & RevenueAmounts)[]; byApp: ({ app: string } & RevenueAmounts)[]; byTerritory: ({ territory: string } & RevenueAmounts)[] };
  subscriptions: { active: string | null; starts: string | null; conversions: string | null; renewals: string | null; voluntaryChurn: string | null; involuntaryChurn: string | null; trend: { date: string; starts: string | null; renewals: string | null; churn: string | null }[]; bySubscription: { subscription: string; starts: string | null; renewals: string | null; churn: string | null }[] };
  settlements: { fiscalMonth: string; region: string; currency: string; startDate: string; endDate: string; earned: string | null; units: string | null }[];
  territories: string[];
}
/** Apple publishes daily Sales reports the following day, generally by 08:00 PT. */
export function latestSalesReportDate(now = new Date(Date.now())): string {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(now).map((part) => [part.type, part.value]));
  const day = Date.parse(`${parts.year}-${parts.month}-${parts.day}T00:00:00Z`);
  return new Date(day - (Number(parts.hour) >= 8 ? 1 : 2) * 86400000).toISOString().slice(0, 10);
}
