import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { createChildLogger } from "../../lib/logger.ts";

const log = createChildLogger("skill:dev-server");

export interface DevServer {
  start(): Promise<void>;
  stop(): Promise<void>;
  isRunning(): boolean;
  getUrl(): string;
}

export function createDevServer(opts: {
  command: string;
  port: number;
  cwd: string;
}): DevServer {
  const { command, port, cwd } = opts;
  let process: ChildProcess | null = null;
  let running = false;

  return {
    async start() {
      if (running) return;

      log.info({ command, port, cwd }, "Starting dev server");

      const [cmd, ...args] = command.split(" ");
      process = spawn(cmd!, args, {
        cwd,
        stdio: "pipe",
        env: { ...globalThis.process.env, PORT: String(port) },
      });

      process.on("error", (err) => {
        log.error({ err: err.message }, "Dev server process error");
        running = false;
      });

      process.on("exit", (code) => {
        log.info({ code }, "Dev server exited");
        running = false;
      });

      // Wait for server to be ready by polling
      await waitForServer(port);
      running = true;
      log.info({ port }, "Dev server started");
    },

    async stop() {
      if (!process || !running) return;

      log.info("Stopping dev server");
      process.kill("SIGTERM");

      // Give it 3 seconds to gracefully shut down
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          if (process && !process.killed) {
            process.kill("SIGKILL");
          }
          resolve();
        }, 3000);

        process!.on("exit", () => {
          clearTimeout(timer);
          resolve();
        });
      });

      process = null;
      running = false;
      log.info("Dev server stopped");
    },

    isRunning() {
      return running;
    },

    getUrl() {
      return `http://localhost:${port}`;
    },
  };
}

async function waitForServer(port: number, maxWaitMs = 15000): Promise<void> {
  const start = Date.now();
  const interval = 250;

  while (Date.now() - start < maxWaitMs) {
    try {
      const response = await fetch(`http://localhost:${port}`, {
        signal: AbortSignal.timeout(1000),
      });
      if (response.ok || response.status < 500) return;
    } catch {
      // Server not ready yet
    }
    await new Promise((r) => setTimeout(r, interval));
  }

  throw new Error(
    `Dev server did not start within ${maxWaitMs}ms on port ${port}`,
  );
}
