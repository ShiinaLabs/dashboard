function dateParts(epoch: number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(epoch);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function dashboardDateRange(now: number, timeZone: string, days: number) {
  const to = dateParts(now, timeZone);
  const [year, month, day] = to.split("-").map(Number);
  const fromEpoch = Date.UTC(year, month - 1, day - Math.max(1, days) + 1);
  return { from: dateParts(fromEpoch, "UTC"), to };
}
