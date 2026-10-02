import { importPKCS8, SignJWT } from "jose";

export interface AppStoreCredential {
  issuerId: string;
  keyId: string;
  privateKey: string;
}

/** Team API keys only; tokens live in memory for the duration of a request. */
export class AppStoreTokenProvider {
  constructor(private readonly credential: AppStoreCredential) {}

  async getToken(): Promise<string> {
    const key = await importPKCS8(this.credential.privateKey, "ES256");
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({})
      .setProtectedHeader({ alg: "ES256", kid: this.credential.keyId, typ: "JWT" })
      .setIssuer(this.credential.issuerId)
      .setAudience("appstoreconnect-v1")
      .setIssuedAt(now)
      .setExpirationTime(now + 5 * 60)
      .sign(key);
  }
}
