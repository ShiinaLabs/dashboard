import { describe, expect, it } from "vitest";
import { parseAnalyticsTsv } from "../lib/infra/app-store/analytics-tsv";

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

});
