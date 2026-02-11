import type { TaskResult } from "../lib/types.ts";

export function formatAcknowledge(): string {
  return "Got it, working on it...";
}

export function formatProgress(message: string): string {
  return `⏳ ${message}`;
}

export function formatTaskResult(result: TaskResult): string {
  if (!result.success) {
    return ["❌ Task failed", "", result.error ?? "Unknown error"].join("\n");
  }

  const lines = ["✅ Changes applied", "", result.summary];

  if (result.filesChanged.length > 0) {
    lines.push("", "Files changed:");
    for (const file of result.filesChanged) {
      lines.push(`  • ${file}`);
    }
  }

  if (result.commitHash) {
    lines.push("", `Commit: ${result.commitHash.slice(0, 8)}`);
  }

  return lines.join("\n");
}

export function formatError(error: unknown): string {
  if (error instanceof Error) {
    return `❌ Error: ${error.message}`;
  }
  return "❌ An unexpected error occurred.";
}

export function formatHistory(results: TaskResult[]): string {
  if (results.length === 0) {
    return "No changes yet.";
  }

  const lines = ["Recent changes:", ""];
  for (const r of results) {
    const status = r.success ? "✅" : "❌";
    const hash = r.commitHash ? ` (${r.commitHash.slice(0, 8)})` : "";
    lines.push(`${status} ${r.summary}${hash}`);
  }

  return lines.join("\n");
}

export function formatStatus(opts: {
  running: boolean;
  message?: string;
}): string {
  if (!opts.running) {
    return "No task currently running.";
  }
  return `🔄 Task in progress${opts.message ? `: ${opts.message}` : ""}`;
}
