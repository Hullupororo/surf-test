import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildProjectContext, buildSystemPrompt } from "../../src/agent/context.ts";

describe("context", () => {
  let repoPath: string;

  beforeEach(() => {
    repoPath = mkdtempSync(join(tmpdir(), "context-test-"));
  });

  afterEach(() => {
    rmSync(repoPath, { recursive: true, force: true });
  });

  it("buildProjectContext returns structure and tech stack", async () => {
    writeFileSync(
      join(repoPath, "package.json"),
      JSON.stringify({ dependencies: { react: "^18.0.0" }, devDependencies: { typescript: "^5.0.0" } }),
    );
    writeFileSync(join(repoPath, "tsconfig.json"), "{}");

    const ctx = await buildProjectContext(repoPath);
    expect(ctx.techStack).toContain("React");
    expect(ctx.techStack).toContain("TypeScript");
    expect(ctx.conventions).toContain("TypeScript");
    expect(ctx.structure).toContain("package.json");
  });

  it("buildProjectContext handles missing package.json", async () => {
    const ctx = await buildProjectContext(repoPath);
    expect(ctx.techStack).toBe("Unknown");
  });

  it("buildSystemPrompt includes project info", () => {
    const prompt = buildSystemPrompt({
      context: {
        structure: "./src/index.ts",
        conventions: "TypeScript project, ESLint",
        techStack: "React, TypeScript",
      },
    });
    expect(prompt).toContain("React, TypeScript");
    expect(prompt).toContain("TypeScript project, ESLint");
    expect(prompt).toContain("./src/index.ts");
    expect(prompt).toContain("Read files before modifying");
  });

  it("buildSystemPrompt includes additional modules", () => {
    const prompt = buildSystemPrompt({
      context: { structure: "", conventions: "", techStack: "" },
      additionalModules: ["## Frontend Expert\nUse component patterns"],
    });
    expect(prompt).toContain("Frontend Expert");
  });
});
