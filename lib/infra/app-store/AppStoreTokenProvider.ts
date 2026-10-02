import { importPKCS8, SignJWT } from "jose";

export interface AppStoreCredential {
  issuerId: string;
  keyId: string;
  privateKey: string;
}

/** Team API keys only; tokens and imported signing keys stay in this provider's memory. */
export class AppStoreTokenProvider {
  private key?: Awaited<ReturnType<typeof importPKCS8>>;
  private token?: string;
  private expiresAt = 0;
  private generating?: Promise<string>;

  constructor(private readonly credential: AppStoreCredential) {}

  async getToken(): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    if (this.token && this.expiresAt - now >= 60) return this.token;
    if (this.generating) return this.generating;
    this.generating = (async () => {
      this.key ??= await importPKCS8(this.credential.privateKey, "ES256");
      const issuedAt = Math.floor(Date.now() / 1000);
      const expiresAt = issuedAt + 5 * 60;
      const token = await new SignJWT({})
        .setProtectedHeader({ alg: "ES256", kid: this.credential.keyId, typ: "JWT" })
        .setIssuer(this.credential.issuerId)
        .setAudience("appstoreconnect-v1")
        .setIssuedAt(issuedAt)
        .setExpirationTime(expiresAt)
        .sign(this.key);
      this.token = token;
      this.expiresAt = expiresAt;
      return token;
    })();
    try { return await this.generating; }
    finally { this.generating = undefined; }
  }
}
