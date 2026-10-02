import { z } from "zod";
import { encrypt, decrypt } from "../crypto";
import { isMockMode } from "../config";
import * as repo from "../repositories/app-store";
import { AppStoreTokenProvider, type AppStoreCredential } from "../infra/app-store/AppStoreTokenProvider";
import { AppStoreApiError, AppStoreConnectClient } from "../infra/app-store/AppStoreConnectClient";
import type { AppStoreConnection } from "@/shared/app-store";

type Viewer = { id: number; role: string };

export class AppStoreError extends Error {
  constructor(public readonly code: string, public readonly status: number, message: string) { super(message); }
}

const inputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  issuerId: z.string().trim().uuid(),
  keyId: z.string().trim().regex(/^[A-Z0-9]{10}$/),
  privateKey: z.string().trim().min(1).max(16_384),
  vendorNumber: z.string().trim().regex(/^\d{1,30}$/).nullable().optional(),
});
const updateSchema = inputSchema.partial().extend({ isActive: z.boolean().optional() });

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new AppStoreError("invalid_input", 400, `Invalid connection fields: ${[...new Set(result.error.issues.map((issue) => issue.path.join(".")))].join(", ")}`);
  return result.data;
}

function publicConnection(row: repo.ConnectionRow): AppStoreConnection {
  const { private_key_encrypted, deleted_at: _deletedAt, ...metadata } = row;
  return { ...metadata, private_key_configured: Boolean(private_key_encrypted) };
}

async function authorizedConnection(id: number, viewer: Viewer) {
  const row = await repo.getConnection(id);
  if (!row) throw new AppStoreError("not_found", 404, "Connection not found");
  if (row.owner_id !== viewer.id && viewer.role !== "admin") throw new AppStoreError("forbidden", 403, "Forbidden");
  return row;
}

function rejectMockCredential() {
  if (isMockMode()) throw new AppStoreError("mock_mode", 503, "Credential setup requires a database-backed deployment; mock mode cannot store private keys");
}

function storedCredential(row: repo.ConnectionRow): AppStoreCredential {
  try { return { issuerId: row.issuer_id, keyId: row.key_id, privateKey: decrypt(row.private_key_encrypted) }; }
  catch { throw new AppStoreError("credential_unavailable", 503, "Stored private key cannot be decrypted; check the deployment encryption key or replace the credential"); }
}

async function discover(credential: AppStoreCredential) {
  const tokens = new AppStoreTokenProvider(credential);
  try { await tokens.getToken(); }
  catch { throw new AppStoreError("invalid_private_key", 400, "Private Key must be a valid App Store Connect .p8 key (ES256)"); }
  return new AppStoreConnectClient(tokens).listApps();
}

function encryptedKey(key: string) {
  try { return encrypt(key); }
  catch { throw new AppStoreError("encryption_unavailable", 503, "Encryption unavailable; private key was not saved"); }
}

function syncErrorMessage(error: unknown) {
  if (error instanceof AppStoreError || error instanceof AppStoreApiError || error instanceof repo.AppStoreConflictError) return error.message;
  return "App metadata could not be saved; try again";
}

export async function listConnections(viewer: Viewer) {
  return (await repo.listConnections(viewer.role === "admin" ? undefined : viewer.id)).map(publicConnection);
}

export async function getConnectionDetail(id: number, viewer: Viewer) {
  const row = await authorizedConnection(id, viewer);
  const [apps, recentSyncRuns, lastSuccessfulSync] = await Promise.all([repo.getApps(id), repo.getRecentRuns(id), repo.getLastSuccessfulRun(id)]);
  return { connection: publicConnection(row), apps, recentSyncRuns, lastSuccessfulSync };
}

export async function createConnection(viewer: Viewer, input: unknown) {
  rejectMockCredential();
  const data = parse(inputSchema, input);
  const startedAt = new Date().toISOString();
  // Validation and complete discovery must succeed before any active connection is saved.
  const apps = await discover(data);
  const row = await repo.createWithApps({ owner_id: viewer.id, name: data.name, issuer_id: data.issuerId, key_id: data.keyId, private_key_encrypted: encryptedKey(data.privateKey), vendor_number: data.vendorNumber ?? null }, apps, startedAt);
  return publicConnection(row);
}

export async function updateConnection(id: number, viewer: Viewer, input: unknown) {
  const row = await authorizedConnection(id, viewer);
  const data = parse(updateSchema, input);
  const credentialChanged = data.issuerId !== undefined || data.keyId !== undefined || data.privateKey !== undefined;
  const updates: Partial<repo.ConnectionRow> = {};
  if (data.name !== undefined) updates.name = data.name;
  if (data.vendorNumber !== undefined) updates.vendor_number = data.vendorNumber;
  if (data.isActive !== undefined) updates.is_active = data.isActive;
  if (!credentialChanged) return publicConnection(await repo.saveConnection(row, updates));
  rejectMockCredential();
  const credential = data.privateKey === undefined ? storedCredential(row) : { issuerId: row.issuer_id, keyId: row.key_id, privateKey: data.privateKey };
  if (data.issuerId !== undefined) credential.issuerId = data.issuerId;
  if (data.keyId !== undefined) credential.keyId = data.keyId;
  const run = await repo.startRun(id);
  try {
    const apps = await discover(credential);
    updates.issuer_id = credential.issuerId;
    updates.key_id = credential.keyId;
    updates.private_key_encrypted = encryptedKey(credential.privateKey);
    return publicConnection(await repo.saveConnection(row, updates, apps, run));
  } catch (error) {
    await repo.failRun(run, syncErrorMessage(error));
    throw error;
  }
}

export async function refreshApps(id: number, viewer: Viewer) {
  const row = await authorizedConnection(id, viewer);
  if (!row.is_active) throw new AppStoreError("connection_disabled", 409, "Enable this connection before refreshing apps");
  const run = await repo.startRun(id);
  try {
    const apps = isMockMode() ? undefined : await discover(storedCredential(row));
    await repo.saveConnection(row, {}, apps, run);
  } catch (error) {
    await repo.failRun(run, syncErrorMessage(error));
    throw error;
  }
  return getConnectionDetail(id, viewer);
}

export async function setAppEnabled(id: number, appId: number, viewer: Viewer, input: unknown) {
  await authorizedConnection(id, viewer);
  const { isEnabled } = parse(z.object({ isEnabled: z.boolean() }), input);
  const app = await repo.setAppEnabled(id, appId, isEnabled);
  if (!app) throw new AppStoreError("not_found", 404, "App not found in this connection");
  return app;
}

export async function deleteConnection(id: number, viewer: Viewer) {
  const row = await authorizedConnection(id, viewer);
  await repo.saveConnection(row, { deleted_at: new Date().toISOString(), is_active: false });
}
