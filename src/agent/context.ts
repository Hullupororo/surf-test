import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createChildLogger } from "../lib/logger.ts";

const log = createChildLogger("agent:context");

export interface ProjectContext {
  structure: string;
  conventions: string;
  techStack: string;
}

export async function buildProjectContext(
  repoPath: string,
): Promise<ProjectContext> {
  log.info({ repoPath }, "Building project context");

  const [structure, packageJson] = await Promise.all([
    getStructure(repoPath),
    readFileSafe(join(repoPath, "package.json")),
  ]);

  const techStack = packageJson ? parseTechStack(packageJson) : "Unknown";
  const conventions = await detectConventions(repoPath);

  return { structure, conventions, techStack };
}

async function getStructure(repoPath: string): Promise<string> {
  const { exec } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execAsync = promisify(exec);

  try {
    const { stdout } = await execAsync(
      "find . -path './node_modules' -prune -o -path './.git' -prune -o -type f -print | sort | head -100",
      { cwd: repoPath },
    );
    return stdout;
  } catch {
    return "Unable to read project structure";
  }
}

async function detectConventions(repoPath: string): Promise<string> {
  const parts: string[] = [];

  const tsconfig = await readFileSafe(join(repoPath, "tsconfig.json"));
  if (tsconfig) parts.push("TypeScript project");

  const eslint =
    (await readFileSafe(join(repoPath, "eslint.config.js"))) ??
    (await readFileSafe(join(repoPath, ".eslintrc.json")));
  if (eslint) parts.push("ESLint configured");

  const prettier = await readFileSafe(join(repoPath, ".prettierrc"));
  if (prettier) parts.push("Prettier configured");

  return parts.length > 0
    ? parts.join(", ")
    : "No specific conventions detected";
}

function parseTechStack(packageJsonStr: string): string {
  try {
    const pkg = JSON.parse(packageJsonStr);
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    const frameworks: string[] = [];

    if (deps["react"]) frameworks.push("React");
    if (deps["vue"]) frameworks.push("Vue");
    if (deps["svelte"]) frameworks.push("Svelte");
    if (deps["next"]) frameworks.push("Next.js");
    if (deps["nuxt"]) frameworks.push("Nuxt");
    if (deps["express"]) frameworks.push("Express");
    if (deps["hono"]) frameworks.push("Hono");
    if (deps["fastify"]) frameworks.push("Fastify");
    if (deps["typescript"]) frameworks.push("TypeScript");

    return frameworks.length > 0 ? frameworks.join(", ") : "Node.js";
  } catch {
    return "Unknown";
  }
}

async function readFileSafe(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf-8");
  } catch {
    return null;
  }
}

export function buildSystemPrompt(opts: {
  context: ProjectContext;
  additionalModules?: string[];
}): string {
  const { context, additionalModules } = opts;

  const lines = [
    "You are a code agent that modifies a project based on user requests.",
    "You have access to tools for reading, writing, and editing files, running commands, and searching code.",
    "",
    "## Project Info",
    `Tech stack: ${context.techStack}`,
    `Conventions: ${context.conventions}`,
    "",
    "## Project Structure",
    context.structure,
    "",
    "## Rules",
    "- Read files before modifying them",
    "- Make minimal, focused changes",
    "- Run build/lint after changes to validate correctness",
    "- Use report_progress to send status updates",
    "- Use git_commit when changes are ready",
  ];

  if (additionalModules) {
    for (const mod of additionalModules) {
      lines.push("", mod);
    }
  }

  return lines.join("\n");
}
