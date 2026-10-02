import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createConnection, getConnectionDetail, updateConnection } from "../lib/services/app-store";

beforeAll(() => vi.stubEnv("MOCK_DATA", "1"));
afterAll(() => vi.unstubAllEnvs());

describe("ASC mock credential boundary", () => {
  const viewer = { id: 1, role: "admin" };

  it("provides metadata without a private key and blocks secret storage", async () => {
    const before = await getConnectionDetail(1, viewer);
    expect(before.connection.private_key_configured).toBe(true);
    expect(before.connection).not.toHaveProperty("private_key_encrypted");
    await expect(createConnection(viewer, { privateKey: "sensitive" })).rejects.toMatchObject({ code: "mock_mode" });
    await expect(updateConnection(1, viewer, { privateKey: "sensitive" })).rejects.toMatchObject({ code: "mock_mode" });
    expect(await getConnectionDetail(1, viewer)).toEqual(before);
  });
});
