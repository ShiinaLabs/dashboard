import type { AnalyticsTsv } from "./analytics-tsv";

const SAFE_FIELDS = new Set(["Date", "Event", "Page Type", "Source Type", "Territory", "Download Type", "Device", "Platform", "Platform Version", "Counts", "Count", "Unique Count", "Unique Counts", "Unique Devices"]);

/** A fixture keeps Apple headers/enums/nulls, with business identifiers replaced. */
export function sanitizeAnalyticsFixture(table: AnalyticsTsv): string {
  const substitutions = new Map<string, Map<string, string>>();
  const escape = (field: string) => /[\t\r\n"]/.test(field) ? `"${field.replaceAll('"', '""')}"` : field;
  const lines = [table.headers.map(escape).join("\t")];
  for (const row of table.rows) {
    const fields = table.headers.map((header) => {
      const value = row[header];
      if (value === null || value === undefined) return "";
      if (value === "NULL") return value;
      if (SAFE_FIELDS.has(header)) return escape(value);
      if (header === "App Apple Identifier") return "1234567890";
      if (header === "App Name") return "Sample App";
      if (/bundle/i.test(header)) return "example.sample.app";
      let values = substitutions.get(header);
      if (!values) { values = new Map(); substitutions.set(header, values); }
      if (!values.has(value)) values.set(value, `Sample ${header} ${values.size + 1}`);
      return escape(values.get(value)!);
    });
    lines.push(fields.join("\t"));
  }
  return lines.join("\n") + "\n";
}
