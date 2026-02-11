import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { createChildLogger } from "../../lib/logger.ts";
import type { AppConfig } from "../../config/schema.ts";

const log = createChildLogger("mcp");

export interface BrowserMcpClient {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  callTool(name: string, args: Record<string, unknown>): Promise<string>;
  isConnected(): boolean;
}

export function createBrowserMcpClient(
  config: AppConfig["playwright"],
): BrowserMcpClient {
  let client: Client | null = null;
  let transport: StdioClientTransport | null = null;
  let connected = false;

  return {
    async connect() {
      if (connected) return;

      log.info("Connecting to Playwright MCP server");

      const [width, height] = config.viewport.split("x").map(Number);

      transport = new StdioClientTransport({
        command: "npx",
        args: [
          "@playwright/mcp@latest",
          ...(config.headless ? ["--headless"] : []),
          `--viewport-size=${width},${height}`,
        ],
      });

      client = new Client({
        name: "telegram-bot-developer",
        version: "1.0.0",
      });

      await client.connect(transport);
      connected = true;
      log.info("Connected to Playwright MCP server");
    },

    async disconnect() {
      if (!connected || !client) return;

      log.info("Disconnecting from Playwright MCP server");
      await client.close();
      client = null;
      transport = null;
      connected = false;
      log.info("Disconnected from Playwright MCP server");
    },

    async callTool(
      name: string,
      args: Record<string, unknown>,
    ): Promise<string> {
      if (!client || !connected) {
        throw new Error("MCP client not connected. Call connect() first.");
      }

      log.info({ tool: name, args }, "Calling MCP tool");

      const result = await client.callTool({ name, arguments: args });

      const textContent = result.content as Array<{
        type: string;
        text?: string;
      }>;
      const text = textContent
        .filter((c) => c.type === "text")
        .map((c) => c.text ?? "")
        .join("\n");

      log.info({ tool: name, resultLength: text.length }, "MCP tool result");
      return text;
    },

    isConnected() {
      return connected;
    },
  };
}

export const BROWSER_TOOLS = [
  {
    name: "browser_navigate",
    description: "Navigate the browser to a URL",
    params: { url: "string" },
  },
  {
    name: "browser_snapshot",
    description: "Get an accessibility snapshot of the current page",
    params: {},
  },
  {
    name: "browser_take_screenshot",
    description: "Take a screenshot of the current page",
    params: {},
  },
  {
    name: "browser_click",
    description: "Click an element on the page",
    params: { element: "string", ref: "string" },
  },
  {
    name: "browser_type",
    description: "Type text into an input element",
    params: { element: "string", ref: "string", text: "string" },
  },
  {
    name: "browser_console_messages",
    description: "Get console messages from the browser",
    params: {},
  },
  {
    name: "browser_network_requests",
    description: "Get network requests from the browser",
    params: {},
  },
] as const;

export type BrowserToolName = (typeof BROWSER_TOOLS)[number]["name"];

export function isBrowserTool(name: string): name is BrowserToolName {
  return BROWSER_TOOLS.some((t) => t.name === name);
}
