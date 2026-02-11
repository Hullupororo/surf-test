import { describe, it, expect } from "vitest";

describe("scaffold", () => {
  it("loads config schema", async () => {
    const { configSchema } = await import("../src/config/schema.ts");
    expect(configSchema).toBeDefined();
  });
});
