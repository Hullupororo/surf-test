import type { SimpleGit } from "simple-git";
import { createChildLogger } from "../lib/logger.ts";
import { GitError } from "../lib/errors.ts";

const log = createChildLogger("git:rollback");

export async function rollbackLastCommit(git: SimpleGit): Promise<string> {
  log.info("Rolling back last commit");

  try {
    const logResult = await git.log({ maxCount: 1 });
    const lastHash = logResult.latest?.hash;

    if (!lastHash) {
      throw new GitError("No commits to rollback");
    }

    await git.revert(lastHash, { "--no-edit": null });

    const newLog = await git.log({ maxCount: 1 });
    const revertHash = newLog.latest?.hash ?? "";

    log.info(
      { reverted: lastHash, newCommit: revertHash },
      "Rollback complete",
    );
    return revertHash;
  } catch (err) {
    if (err instanceof GitError) throw err;
    throw new GitError("Failed to rollback last commit", err);
  }
}

export async function cleanUncommitted(git: SimpleGit): Promise<void> {
  log.info("Cleaning uncommitted changes");

  try {
    await git.checkout(["--", "."]);
    await git.clean("f", ["-d"]);
  } catch (err) {
    throw new GitError("Failed to clean uncommitted changes", err);
  }
}
