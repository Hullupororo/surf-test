import type { SimpleGit } from "simple-git";
import { createChildLogger } from "../lib/logger.ts";
import { GitError } from "../lib/errors.ts";

const log = createChildLogger("git:branch");

export async function prepareBranch(opts: {
  git: SimpleGit;
  strategy: "direct" | "feature-branch";
  taskId: string;
}): Promise<string> {
  const { git, strategy, taskId } = opts;

  if (strategy === "direct") {
    const status = await git.status();
    log.info(
      { branch: status.current },
      "Using direct strategy on current branch",
    );
    return status.current ?? "main";
  }

  const branchName = `task/${taskId}`;
  log.info({ branchName }, "Creating feature branch");

  try {
    await git.checkoutLocalBranch(branchName);
    return branchName;
  } catch (err) {
    throw new GitError(`Failed to create branch ${branchName}`, err);
  }
}

export async function pushBranch(opts: {
  git: SimpleGit;
  branch: string;
}): Promise<void> {
  const { git, branch } = opts;
  log.info({ branch }, "Pushing branch to remote");

  try {
    await git.push("origin", branch);
  } catch (err) {
    throw new GitError(`Failed to push branch ${branch}`, err);
  }
}
