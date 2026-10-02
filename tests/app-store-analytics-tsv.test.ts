import { describe, expect, it } from "vitest";
import { parseAnalyticsTsv, parseFinanceTsv } from "../lib/infra/app-store/analytics-tsv";

// Synthetic TSV strings exercise format handling only, not an Apple report schema.
describe("report TSV format", () => {
  it("preserves empty fields, literal NULL, unknown enums and extra columns", () => {
    const table = parseAnalyticsTsv("\uFEFFDate\tCount\tEvent\tNew Column\r\n2026-10-01\t\tFuture Event\tNULL\r\n2026-10-02\t0\tKnown\t\r\n", ["Date", "Count"]);
    expect(table.headers).toEqual(["Date", "Count", "Event", "New Column"]);
    expect(table.rows).toEqual([
      { Date: "2026-10-01", Count: null, Event: "Future Event", "New Column": "NULL" },
      { Date: "2026-10-02", Count: "0", Event: "Known", "New Column": null },
    ]);
  });

  it("supports quoted tabs, newlines, doubled quotes, and trailing empty fields", () => {
    expect(parseAnalyticsTsv('A\tB\tC\n"one\ttwo\nthree ""quoted"""\tvalue\t').rows).toEqual([{ A: 'one\ttwo\nthree "quoted"', B: "value", C: null }]);
  });

  it.each(["A\tB\nonlyone", 'A\n"unterminated', 'A\n"value"extra', 'A\ninvalid"quote'])("rejects malformed TSV without leaking its cell contents", (text) => {
    expect(() => parseAnalyticsTsv(text)).toThrow(/Malformed|Unclosed|unexpected/);
  });

  it("rejects duplicate/empty headers and missing required fields", () => {
    for (const text of ["", "A\tA", "A\t"]) expect(() => parseAnalyticsTsv(text)).toThrow("headers");
    expect(() => parseAnalyticsTsv("A\nvalue", ["Date"])).toThrow("Missing required report headers: Date");
  });

  it("identifies a malformed third row using structure only", () => {
    expect(() => parseAnalyticsTsv("A\tB\tC\n1\t2\t3\nSECRET\t"))
      .toThrow("Report row 3 has an unexpected number of fields (expected 3, received 2, non-empty 1, final row)");
  });

});

describe("Finance report trailer (synthetic)", () => {
  const headers = ["Start Date", "End Date", "Quantity", ...Array.from({ length: 19 }, (_, index) => `Extra ${index}`)];
  const body = headers.join("\t") + "\n" + ["08/30/2026", "09/26/2026", "2", ...Array(19).fill("")].join("\t") + "\n";
  const footer = "Total_Rows\t1\nTotal_Amount\t1.40\nTotal_Units\t2\n";
  it("accepts the exact three-line trailer without importing it as facts", () => {
    expect(parseFinanceTsv(body + footer).rows).toHaveLength(1);
    expect(parseFinanceTsv(body + footer).rows[0]).toMatchObject({ "Start Date": "08/30/2026", "End Date": "09/26/2026", Quantity: "2" });
    expect(() => parseAnalyticsTsv(body + footer)).toThrow("Report row 3 has an unexpected number of fields (expected 22, received 2, non-empty 2, more rows follow)");
  });
  it.each([
    footer.replace("Total_Rows\t1", "Total_Rows\t2"),
    footer.replace("Total_Units", "Unknown"),
    footer.replace("1.40", "SECRET"),
    footer + "08/30/2026\t09/26/2026\t1\n",
    "Total_Rows\t1\nTotal_Amount\t1.40\n",
  ])("rejects incorrect counts, unknown or incomplete trailers, and data after the trailer", (tail) => {
    expect(() => parseFinanceTsv(body + tail)).toThrow(/Finance trailer/);
  });
  it("still rejects a malformed detail row and accepts reports without trailers", () => {
    expect(() => parseFinanceTsv(body + "SECRET\tVALUE\n")).toThrow("unexpected number of fields");
    expect(parseFinanceTsv(body).rows).toHaveLength(1);
  });
});
