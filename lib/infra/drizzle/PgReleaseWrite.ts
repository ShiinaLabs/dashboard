import { getDb } from "../../db/connection";
import { github_release_assets, github_releases } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import type { ReleaseWrite } from "../../application/usecases/SyncActivity";

export class PgReleaseWrite implements ReleaseWrite {
  async upsertRelease(r: Parameters<ReleaseWrite["upsertRelease"]>[0]): Promise<void> {
    const { upsertGithubRelease } = await import("../../repositories/github");
    await upsertGithubRelease(r);
  }

  async findReleaseDbId(accountId: number, repoId: number, releaseId: number): Promise<number | null> {
    const { resolveGithubRepositoryId } = await import("../../repositories/github");
    const repositoryId = await resolveGithubRepositoryId(accountId, repoId);
    const identity = repositoryId
      ? eq(github_releases.repository_id, repositoryId)
      : and(eq(github_releases.account_id, accountId), eq(github_releases.repo_id, repoId));
    const [row] = await getDb().select({ id: github_releases.id })
      .from(github_releases)
      .where(and(identity, eq(github_releases.release_id, releaseId)));
    return row?.id ?? null;
  }

  async replaceAssets(releaseDbId: number, assets: Array<Record<string, unknown>>): Promise<void> {
    await getDb().transaction(async (tx) => {
      // Serialize replacement for the same release and retain the old set on failure.
      await tx.select({ id: github_releases.id }).from(github_releases)
        .where(eq(github_releases.id, releaseDbId)).for("update");
      await tx.delete(github_release_assets).where(eq(github_release_assets.release_id, releaseDbId));
      for (const asset of assets) {
        await tx.insert(github_release_assets).values({
        release_id: releaseDbId,
        name: asset.name as string,
        download_count: (asset.download_count as number) || 0,
        size: (asset.size as number) || 0,
        content_type: (asset.content_type as string) || null,
        browser_download_url: (asset.browser_download_url as string) || null,
        });
      }
    });
  }

  async insertAssetSnapshot(s: Parameters<ReleaseWrite["insertAssetSnapshot"]>[0]): Promise<void> {
    const { upsertGithubReleaseAssetSnapshot } = await import("../../repositories/github");
    await upsertGithubReleaseAssetSnapshot(s);
  }
}
