export function detectTestCommand(packageJsonContent: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(packageJsonContent);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object") {
    return null;
  }

  const scripts = (parsed as Record<string, unknown>).scripts;
  if (!scripts || typeof scripts !== "object") {
    return null;
  }

  const testScript = (scripts as Record<string, unknown>).test;
  if (typeof testScript !== "string" || !testScript.trim()) {
    return null;
  }

  if (testScript.includes("Error: no test specified")) {
    return null;
  }

  return "npm test";
}
