import { describe, it, expect } from "vitest";
import {
  classifyTask,
  getModuleByName,
  getAllModules,
} from "../../src/agent/prompt-modules/classifier.ts";

describe("classifyTask", () => {
  it("classifies frontend task", () => {
    const modules = classifyTask("Change the button color to blue");
    const names = modules.map((m) => m.name);
    expect(names).toContain("frontend-expert");
  });

  it("classifies API task", () => {
    const modules = classifyTask("Add a new REST API endpoint for users");
    const names = modules.map((m) => m.name);
    expect(names).toContain("api-expert");
  });

  it("classifies config task", () => {
    const modules = classifyTask("Update the tsconfig to enable strict mode");
    const names = modules.map((m) => m.name);
    expect(names).toContain("config-expert");
  });

  it("classifies copy task", () => {
    const modules = classifyTask("Fix the typo in the documentation");
    const names = modules.map((m) => m.name);
    expect(names).toContain("copy-editor");
  });

  it("classifies database task", () => {
    const modules = classifyTask("Add a migration to create users table");
    const names = modules.map((m) => m.name);
    expect(names).toContain("database-expert");
  });

  it("classifies testing task", () => {
    const modules = classifyTask("Write unit tests for the auth module");
    const names = modules.map((m) => m.name);
    expect(names).toContain("testing-expert");
  });

  it("returns multiple modules for complex tasks", () => {
    const modules = classifyTask(
      "Add a form component with API endpoint and write tests",
    );
    const names = modules.map((m) => m.name);
    expect(names).toContain("frontend-expert");
    expect(names).toContain("api-expert");
    expect(names).toContain("testing-expert");
  });

  it("defaults to frontend for ambiguous tasks", () => {
    const modules = classifyTask("Make it look better");
    const names = modules.map((m) => m.name);
    expect(names).toContain("frontend-expert");
    expect(names).toHaveLength(1);
  });

  it("is case-insensitive", () => {
    const modules = classifyTask("ADD A REST API ENDPOINT");
    const names = modules.map((m) => m.name);
    expect(names).toContain("api-expert");
  });
});

describe("getModuleByName", () => {
  it("returns module by name", () => {
    const mod = getModuleByName("frontend-expert");
    expect(mod).toBeDefined();
    expect(mod!.name).toBe("frontend-expert");
    expect(mod!.prompt).toContain("Frontend Expert");
  });

  it("returns undefined for unknown name", () => {
    expect(getModuleByName("unknown")).toBeUndefined();
  });
});

describe("getAllModules", () => {
  it("returns all 6 modules", () => {
    const modules = getAllModules();
    expect(modules).toHaveLength(6);
    const names = modules.map((m) => m.name);
    expect(names).toContain("frontend-expert");
    expect(names).toContain("api-expert");
    expect(names).toContain("config-expert");
    expect(names).toContain("copy-editor");
    expect(names).toContain("database-expert");
    expect(names).toContain("testing-expert");
  });
});
