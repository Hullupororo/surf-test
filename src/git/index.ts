import type { SimpleGit } from "simple-git";
import type { AppConfig } from "../config/schema.ts";
import { ensureRepo, pullLatest } from "./clone.ts";
import { prepareBranch, pushBranch } from "./branch.ts";
import { rollbackLastCommit, cleanUncommitted } from "./rollback.ts";
import { createChildLogger } from "../lib/logger.ts";
import { GitError } from "../lib/errors.ts";

const log = createChildLogger("git");

export interface GitManager {
  init(): Promise<void>;
  pull(): Promise<void>;
  prepareBranch(taskId: string): Promise<string>;
  commitAll(message: string): Promise<string>;
  push(branch: string): Promise<void>;
  rollback(): Promise<string>;
  clean(): Promise<void>;
  diff(): Promise<string>;
  getGit(): SimpleGit;
}

export function createGitManager(config: AppConfig["git"]): GitManager {
  let git: SimpleGit | null = null;

  function getGit(): SimpleGit {
    if (!git) throw new GitError("Git not initialized. Call init() first.");
    return git;
  }

  return {
    async init() {
      git = await ensureRepo({
        repoUrl: config.repoUrl,
        localPath: config.localPath,
      });
      log.info("Git manager initialized");
    },

    async pull() {
      await pullLatest(getGit());
    },

    async prepareBranch(taskId: string) {
      return prepareBranch({
        git: getGit(),
        strategy: config.branchStrategy,
        taskId,
      });
    },

    async commitAll(message: string) {
      const g = getGit();
      await g.add(".");
      const result = await g.commit(message);
      const hash = result.commit || "";
      log.info({ hash, message }, "Committed changes");
      return hash;
    },

    async push(branch: string) {
      await pushBranch({ git: getGit(), branch });
    },

    async rollback() {
      return rollbackLastCommit(getGit());
    },

    async clean() {
      await cleanUncommitted(getGit());
    },

    async diff() {
      return getGit().diff();
    },

    getGit() {
      return getGit();
    },
  };
}
