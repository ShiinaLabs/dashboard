import { describe, expect, it } from "vitest";
import { getRouteMeasurement } from "../scripts/query-plane-route-contract.mjs";

describe("query plane route measurement contract", () => {
  it("measures Overview readiness without expecting a browser application request", () => {
    expect(getRouteMeasurement("/overview")).toEqual({
      expectedApplicationRequests: 0,
      usefulContentSelector: '[data-overview-ready="true"]',
    });
  });

  it.each(["/analytics", "/accounts", "/github/2", "/admin"])("keeps the GraphQL budget for %s", (path) => {
    expect(getRouteMeasurement(path)).toEqual({
      expectedApplicationRequests: 1,
      usefulContentSelector: null,
    });
  });
});
