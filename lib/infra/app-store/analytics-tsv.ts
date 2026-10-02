import { AppStoreReportError } from "./analytics-segment";

export interface AnalyticsTsv {
  headers: string[];
  rows: Record<string, string | null>[];
}

/** Preserve empty fields as null and unknown columns/enums verbatim. */
export function parseAnalyticsTsv(input: string, requiredHeaders: readonly string[] = []): AnalyticsTsv {
  return parseReportTsv(input, requiredHeaders, false);
}

/** FINANCIAL reports may end with Total_Rows/Total_Amount/Total_Units. */
export function parseFinanceTsv(input: string): AnalyticsTsv {
  return parseReportTsv(input, [], true);
}

function parseReportTsv(input: string, requiredHeaders: readonly string[], finance: boolean): AnalyticsTsv {
  const text = input.replace(/^\uFEFF/, "");
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;
  let closedQuote = false;
  const endField = () => { record.push(field); field = ""; closedQuote = false; };
  const endRow = () => { endField(); records.push(record); record = []; };
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else { quoted = false; closedQuote = true; }
      } else field += char;
    } else if (char === "\t") endField();
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      endRow();
    } else if (char === '"' && field === "" && !closedQuote) quoted = true;
    else {
      if (closedQuote || char === '"') throw new AppStoreReportError("malformed_tsv", "Malformed quoted report field");
      field += char;
    }
  }
  if (quoted) throw new AppStoreReportError("malformed_tsv", "Unclosed quoted report field");
  if (field !== "" || record.length || closedQuote) endRow();
  const headers = records.shift() ?? [];
  if (!headers.length || headers.some((name) => !name) || new Set(headers).size !== headers.length) throw new AppStoreReportError("invalid_headers", "Report headers are empty or duplicated");
  const missing = requiredHeaders.filter((name) => !headers.includes(name));
  if (missing.length) throw new AppStoreReportError("missing_headers", `Missing required report headers: ${missing.join(", ")}`);
  if (finance) {
    const trailerIndex = records.findIndex((row) => row.length === 2 && row[0] === "Total_Rows");
    if (trailerIndex !== -1) {
      const trailer = records.slice(trailerIndex).filter((row) => !(row.length === 1 && row[0] === ""));
      const labels = ["Total_Rows", "Total_Amount", "Total_Units"];
      if (trailer.length !== labels.length || trailer.some((row, index) => row.length !== 2 || row[0] !== labels[index] || !/^-?(?:\d+(?:\.\d+)?|\.\d+)$/.test(row[1])) || !/^\d+$/.test(trailer[0][1])) {
        throw new AppStoreReportError("invalid_finance_trailer", "Finance trailer is incomplete or malformed");
      }
      const detailCount = records.slice(0, trailerIndex).filter((row) => !(row.length === 1 && row[0] === "")).length;
      const declaredCount = Number(trailer[0][1]);
      if (!Number.isSafeInteger(declaredCount) || declaredCount !== detailCount) throw new AppStoreReportError("finance_row_count_mismatch", "Finance trailer row count does not match detail rows");
      records.length = trailerIndex;
    }
  }
  const rows: AnalyticsTsv["rows"] = [];
  for (const [index, values] of records.entries()) {
    if (values.length === 1 && values[0] === "") continue;
    if (values.length !== headers.length) {
      const final = records.slice(index + 1).every((row) => row.length === 1 && row[0] === "");
      throw new AppStoreReportError("malformed_row", `Report row ${index + 2} has an unexpected number of fields (expected ${headers.length}, received ${values.length}, non-empty ${values.filter((value) => value !== "").length}, ${final ? "final row" : "more rows follow"})`);
    }
    rows.push(Object.fromEntries(headers.map((name, i) => [name, values[i] === "" ? null : values[i]])));
  }
  return { headers, rows };
}
