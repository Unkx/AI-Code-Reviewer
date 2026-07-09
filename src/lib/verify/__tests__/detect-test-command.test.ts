import { describe, it, expect } from "vitest";
import { detectTestCommand } from "../detect-test-command";

describe("detectTestCommand", () => {
  it("returns npm test when a real test script is defined", () => {
    const pkg = JSON.stringify({ scripts: { test: "vitest run" } });
    expect(detectTestCommand(pkg)).toBe("npm test");
  });

  it("returns null for the npm-init placeholder test script", () => {
    const pkg = JSON.stringify({
      scripts: { test: 'echo "Error: no test specified" && exit 1' },
    });
    expect(detectTestCommand(pkg)).toBeNull();
  });

  it("returns null when scripts.test is missing", () => {
    expect(detectTestCommand(JSON.stringify({ scripts: { build: "tsc" } }))).toBeNull();
  });

  it("returns null when scripts is missing", () => {
    expect(detectTestCommand(JSON.stringify({ name: "pkg" }))).toBeNull();
  });

  it("returns null for invalid JSON", () => {
    expect(detectTestCommand("{ not json")).toBeNull();
  });

  it("returns null for an empty test script", () => {
    expect(detectTestCommand(JSON.stringify({ scripts: { test: "   " } }))).toBeNull();
  });
});
