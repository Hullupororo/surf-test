import { readFile, writeFile, access } from "node:fs/promises";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { join, resolve } from "node:path";
import { globSync } from "node:fs";
import type { SimpleGit } from "simple-git";
import type { ProgressCallback } from "../lib/types.ts";
import { createChildLogger } from "../lib/logger.ts";
import { AgentError } from "../lib/errors.ts";

const execAsync = promisify(exec);
const log = createChildLogger("agent:tools");

export interface ToolHandlerDeps {
  repoPath: string;
  git: SimpleGit;
  onProgress: ProgressCallback;
}

export type ToolResult = { content: string; isError?: boolean };

export async function handleToolCall(opts: {
  name: string;
  input: Record<string, unknown>;
  deps: ToolHandlerDeps;
}): Promise<ToolResult> {
  const { name, input, deps } = opts;

  try {
    switch (name) {
      case "read_file":
        return await handleReadFile(input, deps);
      case "write_file":
        return await handleWriteFile(input, deps);
      case "edit_file":
        return await handleEditFile(input, deps);
      case "run_bash":
        return await handleRunBash(input, deps);
      case "search_files":
        return await handleSearchFiles(input, deps);
      case "glob_files":
        return await handleGlobFiles(input, deps);
      case "git_diff":
        return await handleGitDiff(deps);
      case "git_commit":
        return await handleGitCommit(input, deps);
      case "project_map":
        return await handleProjectMap(deps);
      case "detect_conventions":
        return await handleDetectConventions(deps);
      case "report_progress":
        return await handleReportProgress(input, deps);
      default:
        return { content: `Unknown tool: ${name}`, isError: true };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error({ tool: name, err }, "Tool execution failed");
    return { content: `Error: ${message}`, isError: true };
  }
}

function resolvePath(repoPath: string, filePath: string): string {
  const resolved = resolve(repoPath, filePath);
  if (!resolved.startsWith(resolve(repoPath))) {
    throw new AgentError("Path traversal attempt blocked");
  }
  return resolved;
}

async function handleReadFile(
  input: Record<string, unknown>,
  deps: ToolHandlerDeps,
): Promise<ToolResult> {
  const path = resolvePath(deps.repoPath, input["path"] as string);
  const content = await readFile(path, "utf-8");
  return { content };
}

async function handleWriteFile(
  input: Record<string, unknown>,
  deps: ToolHandlerDeps,
): Promise<ToolResult> {
  const path = resolvePath(deps.repoPath, input["path"] as string);
  await writeFile(path, input["content"] as string, "utf-8");
  return { content: `Written to ${input["path"]}` };
}

async function handleEditFile(
  input: Record<string, unknown>,
  deps: ToolHandlerDeps,
): Promise<ToolResult> {
  const path = resolvePath(deps.repoPath, input["path"] as string);
  const oldStr = input["old_string"] as string;
  const newStr = input["new_string"] as string;

  const content = await readFile(path, "utf-8");
  const count = content.split(oldStr).length - 1;

  if (count === 0) {
    return { content: "old_string not found in file", isError: true };
  }
  if (count > 1) {
    return {
      content: `old_string found ${count} times, must be unique`,
      isError: true,
    };
  }

  await writeFile(path, content.replace(oldStr, newStr), "utf-8");
  return { content: `Edited ${input["path"]}` };
}

async function handleRunBash(
  input: Record<string, unknown>,
  deps: ToolHandlerDeps,
): Promise<ToolResult> {
  const command = input["command"] as string;
  const timeout = (input["timeout"] as number) ?? 30_000;

  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd: deps.repoPath,
      timeout,
      maxBuffer: 1024 * 1024,
    });
    const output = [stdout, stderr].filter(Boolean).join("\n---stderr---\n");
    return { content: output || "(no output)" };
  } catch (err: any) {
    const output = [err.stdout, err.stderr]
      .filter(Boolean)
      .join("\n---stderr---\n");
    return {
      content: `Exit code ${err.code ?? "unknown"}\n${output}`,
      isError: true,
    };
  }
}

async function handleSearchFiles(
  input: Record<string, unknown>,
  deps: ToolHandlerDeps,
): Promise<ToolResult> {
  const pattern = input["pattern"] as string;
  const glob = (input["glob"] as string) ?? "";
  const globArg = glob ? `--include='${glob}'` : "";

  try {
    const { stdout } = await execAsync(
      `grep -rn ${globArg} -E '${pattern.replace(/'/g, "\\'")}' . --include='*' || true`,
      { cwd: deps.repoPath, maxBuffer: 1024 * 1024 },
    );
    return { content: stdout || "No matches found" };
  } catch {
    return { content: "No matches found" };
  }
}

async function handleGlobFiles(
  input: Record<string, unknown>,
  deps: ToolHandlerDeps,
): Promise<ToolResult> {
  const pattern = input["pattern"] as string;

  try {
    const { stdout } = await execAsync(
      `find . -path './node_modules' -prune -o -path './.git' -prune -o -name '${pattern}' -print`,
      { cwd: deps.repoPath, maxBuffer: 1024 * 1024 },
    );
    return { content: stdout || "No files found" };
  } catch {
    return { content: "No files found" };
  }
}

async function handleGitDiff(deps: ToolHandlerDeps): Promise<ToolResult> {
  const diff = await deps.git.diff();
  return { content: diff || "No changes" };
}

async function handleGitCommit(
  input: Record<string, unknown>,
  deps: ToolHandlerDeps,
): Promise<ToolResult> {
  const message = input["message"] as string;
  await deps.git.add(".");
  const result = await deps.git.commit(message);
  return { content: `Committed: ${result.commit || "no changes"}` };
}

async function handleProjectMap(deps: ToolHandlerDeps): Promise<ToolResult> {
  try {
    const { stdout } = await execAsync(
      "find . -path './node_modules' -prune -o -path './.git' -prune -o -type f -print | sort | head -200",
      { cwd: deps.repoPath },
    );
    return { content: stdout };
  } catch {
    return { content: "Failed to generate project map", isError: true };
  }
}

async function handleDetectConventions(
  deps: ToolHandlerDeps,
): Promise<ToolResult> {
  const configs = [
    "package.json",
    "tsconfig.json",
    ".eslintrc.json",
    ".prettierrc",
    ".eslintrc.js",
    "eslint.config.js",
  ];
  const results: string[] = [];

  for (const file of configs) {
    const path = join(deps.repoPath, file);
    try {
      await access(path);
      const content = await readFile(path, "utf-8");
      results.push(`--- ${file} ---\n${content.slice(0, 2000)}`);
    } catch {
      // File doesn't exist, skip
    }
  }

  return {
    content:
      results.length > 0 ? results.join("\n\n") : "No config files found",
  };
}

async function handleReportProgress(
  input: Record<string, unknown>,
  deps: ToolHandlerDeps,
): Promise<ToolResult> {
  const message = input["message"] as string;
  await deps.onProgress(message);
  return { content: "Progress reported" };
}
