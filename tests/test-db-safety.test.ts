import { describe, expect, it } from "vitest";
import { isSafeTestDatabaseName } from "./setup";
import { getSchemaTableNames } from "../lib/setup";

describe("test database safety", () => {
  it("only accepts database names explicitly marked for tests", () => {
    expect(isSafeTestDatabaseName("dashboard_test")).toBe(true);
    expect(isSafeTestDatabaseName("dashboard_ci_test")).toBe(true);
    expect(isSafeTestDatabaseName("dashboard")).toBe(false);
    expect(isSafeTestDatabaseName("production_test_data")).toBe(false);
  });

  it("uses the runtime schema table list", () => {
    const tables = getSchemaTableNames();

    expect(tables).toContain("fetch_policy");
    expect(tables).toContain("account_fetch_state");
    expect(tables).toContain("ai_quota");
  });
});
