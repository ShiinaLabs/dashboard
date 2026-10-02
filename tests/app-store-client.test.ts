import { describe, expect, it, vi } from "vitest";
import { exportPKCS8, generateKeyPair, jwtVerify } from "jose";
import { AppStoreTokenProvider } from "../lib/infra/app-store/AppStoreTokenProvider";
import { AppStoreConnectClient } from "../lib/infra/app-store/AppStoreConnectClient";
import { keyIdFromFilename } from "../lib/client/app-store-key";

const tokenProvider = { getToken: async () => "test-token" } as AppStoreTokenProvider;
const app = { id: "123", type: "apps", attributes: { name: "Example", bundleId: "example.app", sku: "example-sku" } };

describe("App Store team credentials", () => {
  it("signs a short-lived ES256 team JWT with the Apple audience and issuer", async () => {
    const { privateKey, publicKey } = await generateKeyPair("ES256", { extractable: true });
    const provider = new AppStoreTokenProvider({ issuerId: "team-issuer", keyId: "ABC1234567", privateKey: await exportPKCS8(privateKey) });
    const { payload, protectedHeader } = await jwtVerify(await provider.getToken(), publicKey, { issuer: "team-issuer", audience: "appstoreconnect-v1" });
    expect(protectedHeader).toMatchObject({ alg: "ES256", kid: "ABC1234567", typ: "JWT" });
    expect(payload.exp! - payload.iat!).toBe(300);
    expect(payload.sub).toBeUndefined();
  });

  it("extracts only the expected .p8 filename pattern", () => {
    expect(keyIdFromFilename("AuthKey_ABC1234567.p8")).toBe("ABC1234567");
    expect(keyIdFromFilename("AuthKey_ABC.p8")).toBeUndefined();
    expect(keyIdFromFilename("other_ABC1234567.p8")).toBeUndefined();
  });
});

describe("App Store apps discovery", () => {
  it("follows pagination and deduplicates apps", async () => {
    const request = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ data: [app], links: { next: "https://api.appstoreconnect.apple.com/v1/apps?cursor=next" } }))
      .mockResolvedValueOnce(Response.json({ data: [app, { ...app, id: "456" }], links: { next: null } }));
    const apps = await new AppStoreConnectClient(tokenProvider, request).listApps();
    expect(apps).toEqual([
      { apple_id: "123", name: "Example", bundle_id: "example.app", sku: "example-sku" },
      { apple_id: "456", name: "Example", bundle_id: "example.app", sku: "example-sku" },
    ]);
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[0][1]).toMatchObject({ headers: { Authorization: "Bearer test-token" }, redirect: "error" });
  });

  it.each(["https://attacker.example/v1/apps", "https://api.appstoreconnect.apple.com/v1/users", "https://attacker@api.appstoreconnect.apple.com/v1/apps", "http://api.appstoreconnect.apple.com/v1/apps"])("rejects an unsafe pagination URL: %s", async (next) => {
    const request = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ data: [app], links: { next } }));
    await expect(new AppStoreConnectClient(tokenProvider, request).listApps()).rejects.toMatchObject({ code: "invalid_pagination" });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("does not turn Apple permission errors into an empty app list", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ errors: [{ code: "FORBIDDEN_ERROR", title: "Forbidden", detail: "Insufficient app access" }] }, { status: 403 }));
    await expect(new AppStoreConnectClient(tokenProvider, request).listApps()).rejects.toMatchObject({ status: 403, code: "FORBIDDEN_ERROR", message: expect.stringContaining("Insufficient app access") });
  });

  it("fails the whole discovery when a later page is malformed", async () => {
    const request = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ data: [app], links: { next: "/v1/apps?cursor=next" } }))
      .mockResolvedValueOnce(Response.json({ data: [{ id: "456", attributes: null }] }));
    await expect(new AppStoreConnectClient(tokenProvider, request).listApps()).rejects.toMatchObject({ code: "invalid_response" });
  });

  it("detects cyclic pagination and network errors", async () => {
    const repeated = vi.fn<typeof fetch>().mockImplementation(async () => Response.json({ data: [], links: { next: "/v1/apps?cursor=repeat" } }));
    await expect(new AppStoreConnectClient(tokenProvider, repeated).listApps()).rejects.toMatchObject({ code: "invalid_pagination" });
    const failed = vi.fn<typeof fetch>().mockRejectedValue(new Error("contains a secret"));
    await expect(new AppStoreConnectClient(tokenProvider, failed).listApps()).rejects.toMatchObject({ code: "request_failed", message: "App Store Connect request failed or timed out" });
  });
});
