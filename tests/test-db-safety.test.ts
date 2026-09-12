import { describe, expect, it } from "vitest";
import { getTestDatabaseConfig, isSafeTestDatabaseName } from "./setup";
import { getSchemaTableNames } from "../lib/setup";

describe("test database safety", () => {
  it("only accepts database names explicitly marked for tests", () => {
    expect(isSafeTestDatabaseName("dashboard_test")).toBe(true);
    expect(isSafeTestDatabaseName("dashboard_ci_test")).toBe(true);
    expect(isSafeTestDatabaseName("dashboard")).toBe(false);
    expect(isSafeTestDatabaseName("production_test_data")).toBe(false);
  });

  it("rejects DATABASE_URL so the application pool cannot bypass the test database", () => {
    const original = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "postgres://dashboard:dashboard@localhost:5432/dashboard";

    try {
      expect(() => getTestDatabaseConfig()).toThrow(/DATABASE_URL/);
    } finally {
      if (original === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = original;
    }
  });

  it("uses the runtime schema table list", () => {
    const tables = getSchemaTableNames();

    expect(tables).toContain("fetch_policy");
    expect(tables).toContain("account_fetch_state");
    expect(tables).toContain("ai_quota");
  });
});
