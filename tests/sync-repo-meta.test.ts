import { describe, it, expect } from "vitest";
import { SyncRepoMeta } from "../lib/application/usecases/SyncRepoMeta";
import { SyncActivity } from "../lib/application/usecases/SyncActivity";
import type { RepoRepository } from "../lib/domain/ports";
import { Stars, Forks } from "../lib/domain/repo";

class InMemoryRepoRepo implements RepoRepository {
  store = new Map<string, any>();
  constructor(initial: any[] = []) {
    for (const r of initial) this.store.set(`${r.accountId}:${r.repoId}`, r);
  }
  async findAllByAccountIds(ids: number[]) {
    return Array.from(this.store.values()).filter(r => ids.includes(r.accountId));
  }
  async findSnapshotsBefore(){ return new Map(); }
  async findSnapshotsInWindow(){ return new Map(); }
  async upsertRepos(repos:any[]){
    for (const r of repos) {
      const key = `${r.accountId}:${r.repoId}`;
      const existing = this.store.get(key) || {};
      this.store.set(key, { ...existing, ...r });
    }
  }
  async upsertSnapshots(){}
}

class FakeFetcher {
  constructor(private raws:any[]){}
  async fetchRepoMeta(_account:any){
    return this.raws.map(r=>({type:"RepoMetaFetched" as const, repo: r}));
  }
}

describe("SyncRepoMeta", () => {
  it("upserts detached fork (is_fork 1 -> 0)", async () => {
    const repoRepo = new InMemoryRepoRepo([{accountId:1, repoId:1, isFork:1, stars: new Stars(80), forks: new Forks(10)}]);
    const newRepo = {accountId:1, repoId:1, githubId:1, nodeId:"R_1", ownerLogin:"ShiinaLabs", ownerType:"Organization", isFork:0, stars: new Stars(100), forks: new Forks(20), name:"r", fullName:"ShiinaLabs/r", language:null, description:null, homepage:null, topics:"[]"};
    const fetcher = new FakeFetcher([newRepo]);
    const uc = new SyncRepoMeta(repoRepo as any, fetcher as any);
    await uc.execute({id:1, screenName:"alice", platform:"github", ownerId:1, instanceUrl:null, isActive:1} as any);
    const after = (await repoRepo.findAllByAccountIds([1]))[0];
    expect(after.isFork).toBe(0);
    expect(after.githubId).toBe(1);
    expect(after.ownerLogin).toBe("ShiinaLabs");
    // L0 static does not overwrite stars (now L1 timely)
    expect(after.stars.value).toBe(80);
  });
  it("does not write snapshots (L0 static only, stars are L1)", async () => {
    const repoRepo = new InMemoryRepoRepo([]);
    let snapWritten: any[] = [];
    repoRepo.upsertSnapshots = async (s:any[]) => { snapWritten = s; };
    const newRepo = {accountId:1, repoId:2, isFork:0, stars: new Stars(50), forks: new Forks(5), name:"r2", fullName:"a/r2", language:null, description:null, homepage:null, topics:"[]"};
    const fetcher = new FakeFetcher([newRepo]);
    const uc = new SyncRepoMeta(repoRepo as any, fetcher as any);
    await uc.execute({id:1, screenName:"alice", platform:"github", ownerId:1, instanceUrl:null, isActive:1} as any);
    expect(snapWritten.length).toBe(0);
  });
});

describe("SyncActivity L1 timely", () => {
  it("writes stars snapshots", async () => {
    const repoRepo = new InMemoryRepoRepo([]);
    let snapWritten: any[] = [];
    repoRepo.upsertSnapshots = async (s:any[]) => { snapWritten = s; };
    const newRepo = {accountId:1, repoId:2, isFork:0, stars: new Stars(50), forks: new Forks(5), name:"r2", fullName:"a/r2", language:null, description:null, homepage:null, topics:"[]"};
    const fetcher = new FakeFetcher([newRepo]);
    const uc = new SyncActivity(repoRepo as any, fetcher as any);
    await uc.execute({id:1, screenName:"alice", platform:"github", ownerId:1, instanceUrl:null, isActive:1} as any);
    expect(snapWritten.length).toBe(1);
    expect(snapWritten[0].stars).toBe(50);
  });
});
