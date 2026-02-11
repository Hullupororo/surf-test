import { describe, it, expect } from "vitest";
import { isBrowserTool, BROWSER_TOOLS } from "../../src/agent/mcp/index.ts";

describe("BROWSER_TOOLS", () => {
  it("defines all 7 browser tools", () => {
    expect(BROWSER_TOOLS).toHaveLength(7);
    const names = BROWSER_TOOLS.map((t) => t.name);
    expect(names).toContain("browser_navigate");
    expect(names).toContain("browser_snapshot");
    expect(names).toContain("browser_take_screenshot");
    expect(names).toContain("browser_click");
    expect(names).toContain("browser_type");
    expect(names).toContain("browser_console_messages");
    expect(names).toContain("browser_network_requests");
  });
});

describe("isBrowserTool", () => {
  it("returns true for browser tools", () => {
    expect(isBrowserTool("browser_navigate")).toBe(true);
    expect(isBrowserTool("browser_snapshot")).toBe(true);
    expect(isBrowserTool("browser_take_screenshot")).toBe(true);
  });

  it("returns false for non-browser tools", () => {
    expect(isBrowserTool("read_file")).toBe(false);
    expect(isBrowserTool("write_file")).toBe(false);
    expect(isBrowserTool("unknown")).toBe(false);
  });
});
