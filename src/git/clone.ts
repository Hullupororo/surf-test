import { simpleGit } from "simple-git";
import type { SimpleGit } from "simple-git";
import { existsSync } from "node:fs";
import { createChildLogger } from "../lib/logger.ts";
import { GitError } from "../lib/errors.ts";

const log = createChildLogger("git:clone");

export async function ensureRepo(opts: {
  repoUrl: string;
  localPath: string;
}): Promise<SimpleGit> {
  const { repoUrl, localPath } = opts;

  if (existsSync(localPath)) {
    log.info({ localPath }, "Repo already exists, opening");
    return simpleGit(localPath);
  }

  log.info({ repoUrl, localPath }, "Cloning repo");
  try {
    await simpleGit().clone(repoUrl, localPath);
    return simpleGit(localPath);
  } catch (err) {
    throw new GitError(`Failed to clone ${repoUrl}`, err);
  }
}

export async function pullLatest(git: SimpleGit): Promise<void> {
  log.info("Pulling latest changes");
  try {
    await git.pull();
  } catch (err) {
    throw new GitError("Failed to pull latest changes", err);
  }
}
