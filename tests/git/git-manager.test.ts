import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { simpleGit } from "simple-git";
import { createGitManager } from "../../src/git/index.ts";

function createTempDir() {
  return mkdtempSync(join(tmpdir(), "git-test-"));
}

describe("GitManager", () => {
  let remoteDir: string;
  let localDir: string;

  beforeEach(async () => {
    // Create a bare "remote" repo
    remoteDir = createTempDir();
    await simpleGit(remoteDir).init(true);

    // Create a working clone so the remote has at least one commit
    const seedDir = createTempDir();
    await simpleGit().clone(remoteDir, seedDir);
    const seedGit = simpleGit(seedDir);
    await seedGit.addConfig("user.email", "test@test.com");
    await seedGit.addConfig("user.name", "Test");
    writeFileSync(join(seedDir, "README.md"), "# Test\n");
    await seedGit.add(".");
    await seedGit.commit("initial commit");
    await seedGit.push("origin", "main");
    rmSync(seedDir, { recursive: true, force: true });

    // Local path for the manager to clone into
    localDir = join(createTempDir(), "repo");
  });

  afterEach(() => {
    rmSync(remoteDir, { recursive: true, force: true });
    rmSync(localDir, { recursive: true, force: true });
  });

  it("init clones the remote repo", async () => {
    const manager = createGitManager({
      repoUrl: remoteDir,
      localPath: localDir,
      branchStrategy: "direct",
    });

    await manager.init();
    const git = manager.getGit();
    const log = await git.log();
    expect(log.total).toBe(1);
    expect(log.latest?.message).toBe("initial commit");
  });

  it("init opens existing repo on second call", async () => {
    const manager = createGitManager({
      repoUrl: remoteDir,
      localPath: localDir,
      branchStrategy: "direct",
    });

    await manager.init();
    // Second init should not throw
    await manager.init();

    const git = manager.getGit();
    const log = await git.log();
    expect(log.total).toBe(1);
  });

  it("commitAll stages and commits all changes", async () => {
    const manager = createGitManager({
      repoUrl: remoteDir,
      localPath: localDir,
      branchStrategy: "direct",
    });
    await manager.init();
    const git = manager.getGit();
    await git.addConfig("user.email", "test@test.com");
    await git.addConfig("user.name", "Test");

    writeFileSync(join(localDir, "new-file.txt"), "hello");
    const hash = await manager.commitAll("add new file");

    expect(hash).toBeTruthy();
    const log = await git.log();
    expect(log.latest?.message).toBe("add new file");
  });

  it("diff shows uncommitted changes", async () => {
    const manager = createGitManager({
      repoUrl: remoteDir,
      localPath: localDir,
      branchStrategy: "direct",
    });
    await manager.init();

    writeFileSync(join(localDir, "README.md"), "# Changed\n");

    const diffOutput = await manager.diff();
    expect(diffOutput).toContain("Changed");
  });

  it("clean removes uncommitted changes", async () => {
    const manager = createGitManager({
      repoUrl: remoteDir,
      localPath: localDir,
      branchStrategy: "direct",
    });
    await manager.init();

    writeFileSync(join(localDir, "junk.txt"), "remove me");
    await manager.clean();

    const git = manager.getGit();
    const status = await git.status();
    expect(status.isClean()).toBe(true);
  });

  it("prepareBranch with direct strategy stays on current branch", async () => {
    const manager = createGitManager({
      repoUrl: remoteDir,
      localPath: localDir,
      branchStrategy: "direct",
    });
    await manager.init();

    const branch = await manager.prepareBranch("task-123");
    expect(branch).toBe("main");
  });

  it("prepareBranch with feature-branch creates new branch", async () => {
    const manager = createGitManager({
      repoUrl: remoteDir,
      localPath: localDir,
      branchStrategy: "feature-branch",
    });
    await manager.init();

    const branch = await manager.prepareBranch("task-456");
    expect(branch).toBe("task/task-456");

    const git = manager.getGit();
    const status = await git.status();
    expect(status.current).toBe("task/task-456");
  });

  it("push sends commits to remote", async () => {
    const manager = createGitManager({
      repoUrl: remoteDir,
      localPath: localDir,
      branchStrategy: "direct",
    });
    await manager.init();
    const git = manager.getGit();
    await git.addConfig("user.email", "test@test.com");
    await git.addConfig("user.name", "Test");

    writeFileSync(join(localDir, "pushed.txt"), "data");
    await manager.commitAll("push test");
    await manager.push("main");

    // Verify via a fresh clone
    const verifyDir = createTempDir();
    await simpleGit().clone(remoteDir, verifyDir);
    const verifyLog = await simpleGit(verifyDir).log();
    expect(verifyLog.latest?.message).toBe("push test");
    rmSync(verifyDir, { recursive: true, force: true });
  });

  it("rollback reverts the last commit", async () => {
    const manager = createGitManager({
      repoUrl: remoteDir,
      localPath: localDir,
      branchStrategy: "direct",
    });
    await manager.init();
    const git = manager.getGit();
    await git.addConfig("user.email", "test@test.com");
    await git.addConfig("user.name", "Test");

    writeFileSync(join(localDir, "revert-me.txt"), "bad change");
    await manager.commitAll("bad commit");

    const revertHash = await manager.rollback();
    expect(revertHash).toBeTruthy();

    const log = await git.log();
    expect(log.latest?.message).toContain("Revert");
  });
});
