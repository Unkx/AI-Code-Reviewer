import { describe, it, expect, vi } from "vitest";
import type Groq from "groq-sdk";
import { validateCandidateFixes, reviewPullRequest } from "../engine";

describe("validateCandidateFixes", () => {
  it("passes through a fully valid array", () => {
    const raw = [
      { file: "a.ts", lineStart: 1, lineEnd: 2, replacement: "const x = 1;", explanation: "fix" },
    ];
    expect(validateCandidateFixes(raw)).toEqual(raw);
  });

  it("returns empty array for non-array input", () => {
    expect(validateCandidateFixes({})).toEqual([]);
    expect(validateCandidateFixes(null)).toEqual([]);
  });

  it("drops entries missing a file", () => {
    expect(validateCandidateFixes([{ lineStart: 1, lineEnd: 1, replacement: "x", explanation: "e" }])).toEqual([]);
  });

  it("drops entries with lineEnd before lineStart", () => {
    const raw = [{ file: "a.ts", lineStart: 5, lineEnd: 2, replacement: "x", explanation: "e" }];
    expect(validateCandidateFixes(raw)).toEqual([]);
  });

  it("drops entries with non-integer line numbers", () => {
    const raw = [{ file: "a.ts", lineStart: 1.5, lineEnd: 2, replacement: "x", explanation: "e" }];
    expect(validateCandidateFixes(raw)).toEqual([]);
  });

  it("drops entries with an empty explanation", () => {
    const raw = [{ file: "a.ts", lineStart: 1, lineEnd: 1, replacement: "x", explanation: "" }];
    expect(validateCandidateFixes(raw)).toEqual([]);
  });

  it("keeps valid entries and drops invalid ones from the same array", () => {
    const raw = [
      { file: "a.ts", lineStart: 1, lineEnd: 1, replacement: "x", explanation: "ok" },
      { file: "b.ts", lineStart: 0, lineEnd: 1, replacement: "y", explanation: "bad start" },
    ];
    expect(validateCandidateFixes(raw)).toEqual([raw[0]]);
  });
});

describe("reviewPullRequest", () => {
  function fakeGroq(content: string | null) {
    return {
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({ choices: [{ message: { content } }] }),
        },
      },
    } as unknown as Groq;
  }

  it("returns [] when there are no files", async () => {
    const groq = fakeGroq(null);
    expect(await reviewPullRequest(groq, [])).toEqual([]);
  });

  it("returns [] when Groq responds with empty content", async () => {
    const groq = fakeGroq(null);
    expect(await reviewPullRequest(groq, [{ file: "a.ts", content: "x", patch: "" }])).toEqual([]);
  });

  it("returns [] when Groq responds with invalid JSON", async () => {
    const groq = fakeGroq("not json");
    expect(await reviewPullRequest(groq, [{ file: "a.ts", content: "x", patch: "" }])).toEqual([]);
  });

  it("returns validated candidate fixes with generated ids", async () => {
    const raw = [{ file: "a.ts", lineStart: 1, lineEnd: 1, replacement: "const x = 1;", explanation: "fix" }];
    const groq = fakeGroq(JSON.stringify(raw));
    const result = await reviewPullRequest(groq, [{ file: "a.ts", content: "const x = 2;", patch: "@@" }]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject(raw[0]);
    expect(typeof result[0].id).toBe("string");
    expect(result[0].id.length).toBeGreaterThan(0);
  });

  it("sends file content and diff to Groq", async () => {
    const groq = fakeGroq("[]");
    await reviewPullRequest(groq, [{ file: "a.ts", content: "FILE_CONTENT", patch: "DIFF_PATCH" }]);
    const call = (groq.chat.completions.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.messages[1].content).toContain("FILE_CONTENT");
    expect(call.messages[1].content).toContain("DIFF_PATCH");
  });
});
