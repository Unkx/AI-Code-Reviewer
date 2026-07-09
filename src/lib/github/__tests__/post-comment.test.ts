import { describe, it, expect, vi } from "vitest";
import { postSuggestionComment, postInformationalComment } from "../post-comment";
import type { CandidateFix } from "@/lib/verify/types";

const fix: CandidateFix = {
  id: "fix-1",
  file: "src/a.ts",
  lineStart: 3,
  lineEnd: 4,
  replacement: "const x = 1;\nconst y = 2;",
  explanation: "fixes the off-by-one",
};

describe("postSuggestionComment", () => {
  it("posts a multi-line suggestion block anchored to the fix's range", async () => {
    const createReviewComment = vi.fn().mockResolvedValue({});
    const octokit = { rest: { pulls: { createReviewComment } } };

    await postSuggestionComment(octokit as never, {
      owner: "acme",
      repo: "widgets",
      prNumber: 7,
      commitSha: "sha-1",
      fix,
    });

    expect(createReviewComment).toHaveBeenCalledWith({
      owner: "acme",
      repo: "widgets",
      pull_number: 7,
      commit_id: "sha-1",
      path: "src/a.ts",
      body: "fixes the off-by-one\n\n```suggestion\nconst x = 1;\nconst y = 2;\n```",
      line: 4,
      start_line: 3,
      start_side: "RIGHT",
      side: "RIGHT",
    });
  });

  it("omits start_line for a single-line fix", async () => {
    const createReviewComment = vi.fn().mockResolvedValue({});
    const octokit = { rest: { pulls: { createReviewComment } } };
    const singleLineFix: CandidateFix = { ...fix, lineStart: 3, lineEnd: 3 };

    await postSuggestionComment(octokit as never, {
      owner: "acme",
      repo: "widgets",
      prNumber: 7,
      commitSha: "sha-1",
      fix: singleLineFix,
    });

    const call = createReviewComment.mock.calls[0][0];
    expect(call.start_line).toBeUndefined();
    expect(call.line).toBe(3);
  });
});

describe("postInformationalComment", () => {
  it("posts a single labeled comment listing every fix", async () => {
    const createComment = vi.fn().mockResolvedValue({});
    const octokit = { rest: { issues: { createComment } } };

    await postInformationalComment(octokit as never, {
      owner: "acme",
      repo: "widgets",
      prNumber: 7,
      fixes: [fix],
    });

    expect(createComment).toHaveBeenCalledWith({
      owner: "acme",
      repo: "widgets",
      issue_number: 7,
      body: expect.stringContaining("unverified"),
    });
    const body = createComment.mock.calls[0][0].body;
    expect(body).toContain("src/a.ts:3-4");
    expect(body).toContain("fixes the off-by-one");
  });

  it("does nothing when there are no fixes", async () => {
    const createComment = vi.fn();
    const octokit = { rest: { issues: { createComment } } };

    await postInformationalComment(octokit as never, {
      owner: "acme",
      repo: "widgets",
      prNumber: 7,
      fixes: [],
    });

    expect(createComment).not.toHaveBeenCalled();
  });
});
