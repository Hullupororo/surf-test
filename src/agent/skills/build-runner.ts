import { execSync } from "node:child_process";
import { createChildLogger } from "../../lib/logger.ts";

const log = createChildLogger("skill:build");

export interface BuildResult {
  success: boolean;
  output: string;
  exitCode: number;
}

export function runBuild(opts: {
  command: string;
  cwd: string;
  timeout?: number;
}): BuildResult {
  const { command, cwd, timeout = 60_000 } = opts;

  log.info({ command, cwd }, "Running build");

  try {
    const output = execSync(command, {
      cwd,
      timeout,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, CI: "true" },
    });

    log.info("Build succeeded");
    return { success: true, output, exitCode: 0 };
  } catch (err) {
    const execErr = err as {
      stdout?: string;
      stderr?: string;
      status?: number;
    };
    const output = [execErr.stdout ?? "", execErr.stderr ?? ""]
      .filter(Boolean)
      .join("\n");

    log.error({ exitCode: execErr.status }, "Build failed");
    return {
      success: false,
      output,
      exitCode: execErr.status ?? 1,
    };
  }
}
