import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { sanitizeLanguage, validateResult } from "../route";

// ---------------------------------------------------------------------------
// sanitizeLanguage
// ---------------------------------------------------------------------------
describe("sanitizeLanguage", () => {
  const VALID = ["JavaScript", "TypeScript", "Python", "Java", "C#", "C++", "Go", "Rust", "Other"];

  it.each(VALID)("passes through valid language %s", (lang) => {
    expect(sanitizeLanguage(lang)).toBe(lang);
  });

  it("falls back to Other for unknown string", () => {
    expect(sanitizeLanguage("Haskell")).toBe("Other");
    expect(sanitizeLanguage("")).toBe("Other");
    expect(sanitizeLanguage("javascript")).toBe("Other"); // case-sensitive
  });

  it("falls back to Other for non-strings", () => {
    expect(sanitizeLanguage(null)).toBe("Other");
    expect(sanitizeLanguage(undefined)).toBe("Other");
    expect(sanitizeLanguage(42)).toBe("Other");
    expect(sanitizeLanguage(["TypeScript"])).toBe("Other");
  });
});

// ---------------------------------------------------------------------------
// validateResult
// ---------------------------------------------------------------------------
describe("validateResult", () => {
  it("passes through a fully-valid result", () => {
    const raw = {
      languageMismatch: false,
      detectedLanguage: "TypeScript",
      bugs: ["bug1", "bug2"],
      quality: ["q1"],
      security: ["s1"],
      suggestions: ["sug1"],
      fixedCode: "const x = 1;",
    };
    expect(validateResult(raw)).toEqual(raw);
  });

  it("uses safe defaults for missing fields", () => {
    expect(validateResult({})).toEqual({
      languageMismatch: false,
      detectedLanguage: "Unknown",
      bugs: [],
      quality: [],
      security: [],
      suggestions: [],
      fixedCode: null,
    });
  });

  it("coerces wrong-typed languageMismatch to false", () => {
    expect(validateResult({ languageMismatch: "yes" }).languageMismatch).toBe(false);
    expect(validateResult({ languageMismatch: 1 }).languageMismatch).toBe(false);
  });

  it("coerces wrong-typed detectedLanguage to Unknown", () => {
    expect(validateResult({ detectedLanguage: 42 }).detectedLanguage).toBe("Unknown");
    expect(validateResult({ detectedLanguage: null }).detectedLanguage).toBe("Unknown");
  });

  it("filters non-string items from array fields", () => {
    const raw = {
      bugs: ["real bug", 42, null, true, "another bug"],
      quality: [undefined, "good"],
      security: [],
      suggestions: [{ obj: true }],
    };
    const result = validateResult(raw);
    expect(result.bugs).toEqual(["real bug", "another bug"]);
    expect(result.quality).toEqual(["good"]);
    expect(result.suggestions).toEqual([]);
  });

  it("coerces non-array array fields to empty arrays", () => {
    const raw = { bugs: "not an array", quality: 99, security: null, suggestions: {} };
    const result = validateResult(raw);
    expect(result.bugs).toEqual([]);
    expect(result.quality).toEqual([]);
    expect(result.security).toEqual([]);
    expect(result.suggestions).toEqual([]);
  });

  it("accepts null fixedCode", () => {
    expect(validateResult({ fixedCode: null }).fixedCode).toBeNull();
  });

  it("coerces non-string fixedCode to null", () => {
    expect(validateResult({ fixedCode: 42 }).fixedCode).toBeNull();
    expect(validateResult({ fixedCode: true }).fixedCode).toBeNull();
  });

  it("handles languageMismatch: true with empty arrays", () => {
    const raw = {
      languageMismatch: true,
      detectedLanguage: "Python",
      bugs: [],
      quality: [],
      security: [],
      suggestions: [],
      fixedCode: null,
    };
    expect(validateResult(raw)).toEqual(raw);
  });
});

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------
function makeRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/review", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

const mockCreate = vi.fn();

vi.mock("groq-sdk", () => ({
  default: vi.fn(() => ({
    chat: { completions: { create: mockCreate } },
  })),
}));

describe("POST /api/review", () => {
  let POST: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    vi.resetModules();
    mockCreate.mockReset();
    // Re-import so the Groq factory re-runs with fresh env each test
    const mod = await import("../route");
    POST = mod.POST as unknown as (req: Request) => Promise<Response>;
  });

  afterEach(() => {
    delete process.env.GROQ_API_KEY;
  });

  it("returns 503 when GROQ_API_KEY is absent", async () => {
    delete process.env.GROQ_API_KEY;
    const res = await POST(makeRequest({ code: "x", language: "TypeScript" }));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toMatch(/not configured/i);
  });

  it("returns 400 on invalid JSON body", async () => {
    process.env.GROQ_API_KEY = "test-key";
    const req = new Request("http://localhost/api/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{ bad json }",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/invalid request body/i);
  });

  it("returns 400 when code is missing", async () => {
    process.env.GROQ_API_KEY = "test-key";
    const res = await POST(makeRequest({ language: "TypeScript" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/no code/i);
  });

  it("returns 400 when code is empty string", async () => {
    process.env.GROQ_API_KEY = "test-key";
    const res = await POST(makeRequest({ code: "", language: "TypeScript" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when code is whitespace only", async () => {
    process.env.GROQ_API_KEY = "test-key";
    const res = await POST(makeRequest({ code: "   \n\t  ", language: "TypeScript" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when code is not a string", async () => {
    process.env.GROQ_API_KEY = "test-key";
    const res = await POST(makeRequest({ code: 42, language: "TypeScript" }));
    expect(res.status).toBe(400);
  });

  it("returns 413 when code exceeds 50,000 chars", async () => {
    process.env.GROQ_API_KEY = "test-key";
    const res = await POST(makeRequest({ code: "x".repeat(50_001), language: "TypeScript" }));
    expect(res.status).toBe(413);
    expect((await res.json()).error).toMatch(/50[,.]000/);
  });

  it("accepts code at exactly 50,000 chars (no 413)", async () => {
    process.env.GROQ_API_KEY = "test-key";
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({
        languageMismatch: false, detectedLanguage: "TypeScript",
        bugs: [], quality: [], security: [], suggestions: [], fixedCode: null,
      }) } }],
    });
    const res = await POST(makeRequest({ code: "x".repeat(50_000), language: "TypeScript" }));
    expect(res.status).toBe(200);
  });

  it("returns 502 when Groq returns no choices", async () => {
    process.env.GROQ_API_KEY = "test-key";
    mockCreate.mockResolvedValue({ choices: [] });
    const res = await POST(makeRequest({ code: "const x = 1", language: "TypeScript" }));
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/empty response/i);
  });

  it("returns 502 when Groq message content is null", async () => {
    process.env.GROQ_API_KEY = "test-key";
    mockCreate.mockResolvedValue({ choices: [{ message: { content: null } }] });
    const res = await POST(makeRequest({ code: "const x = 1", language: "TypeScript" }));
    expect(res.status).toBe(502);
  });

  it("returns 502 when Groq returns invalid JSON", async () => {
    process.env.GROQ_API_KEY = "test-key";
    mockCreate.mockResolvedValue({ choices: [{ message: { content: "not json at all" } }] });
    const res = await POST(makeRequest({ code: "const x = 1", language: "TypeScript" }));
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/parse/i);
  });

  it("returns 502 when Groq SDK throws", async () => {
    process.env.GROQ_API_KEY = "test-key";
    mockCreate.mockRejectedValue(new Error("Network error"));
    const res = await POST(makeRequest({ code: "const x = 1", language: "TypeScript" }));
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/unavailable/i);
  });

  it("returns 200 with validated result on happy path", async () => {
    process.env.GROQ_API_KEY = "test-key";
    const expected = {
      languageMismatch: false,
      detectedLanguage: "TypeScript",
      bugs: ["Missing null check"],
      quality: ["Function too long"],
      security: ["Potential XSS"],
      suggestions: ["Add types"],
      fixedCode: "const x: number = 1;",
    };
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(expected) } }],
    });
    const res = await POST(makeRequest({ code: "const x = 1", language: "TypeScript" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(expected);
  });

  it("returns 200 with languageMismatch: true when AI detects wrong language", async () => {
    process.env.GROQ_API_KEY = "test-key";
    const aiResponse = {
      languageMismatch: true,
      detectedLanguage: "Python",
      bugs: [], quality: [], security: [], suggestions: [], fixedCode: null,
    };
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(aiResponse) } }],
    });
    const res = await POST(makeRequest({ code: "print('hello')", language: "TypeScript" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.languageMismatch).toBe(true);
    expect(body.detectedLanguage).toBe("Python");
  });

  it("sanitizes unknown language to Other before calling Groq", async () => {
    process.env.GROQ_API_KEY = "test-key";
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({
        languageMismatch: false, detectedLanguage: "Other",
        bugs: [], quality: [], security: [], suggestions: [], fixedCode: null,
      }) } }],
    });
    const res = await POST(makeRequest({ code: "some code", language: "Brainfuck" }));
    expect(res.status).toBe(200);
    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.messages[0].content).toContain("Other");
  });

  it("strips extra fields from AI response", async () => {
    process.env.GROQ_API_KEY = "test-key";
    const aiResponse = {
      languageMismatch: false,
      detectedLanguage: "Go",
      bugs: ["b1"],
      quality: [],
      security: [],
      suggestions: [],
      fixedCode: null,
      extraField: "should be stripped",
      anotherRogue: 42,
    };
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(aiResponse) } }],
    });
    const res = await POST(makeRequest({ code: "package main", language: "Go" }));
    const body = await res.json();
    expect(body).not.toHaveProperty("extraField");
    expect(body).not.toHaveProperty("anotherRogue");
  });

  it("handles AI response with non-string items in arrays", async () => {
    process.env.GROQ_API_KEY = "test-key";
    const aiResponse = {
      languageMismatch: false,
      detectedLanguage: "Python",
      bugs: ["real bug", null, 42],
      quality: [],
      security: [],
      suggestions: [],
      fixedCode: null,
    };
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(aiResponse) } }],
    });
    const res = await POST(makeRequest({ code: "x = 1", language: "Python" }));
    const body = await res.json();
    expect(body.bugs).toEqual(["real bug"]);
  });
});
