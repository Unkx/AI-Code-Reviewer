import { describe, it, expect, vi } from "vitest";
import { applyCandidateFixToBranch } from "../apply-patch";
import type { CandidateFix } from "../types";

function fakeOctokit(fileContentLines: string[]) {
  const original = fileContentLines.join("\n");
  return {
    rest: {
      git: {
        createRef: vi.fn().mockResolvedValue({}),
      },
      repos: {
        getContent: vi.fn().mockResolvedValue({
          data: {
            type: "file",
            sha: "blob-sha-1",
            content: Buffer.from(original, "utf-8").toString("base64"),
          },
        }),
        createOrUpdateFileContents: vi.fn().mockResolvedValue({
          data: { commit: { sha: "commit-sha-1" } },
        }),
      },
    },
  };
}

const fix: CandidateFix = {
  id: "fix-1",
  file: "src/a.ts",
  lineStart: 2,
  lineEnd: 2,
  replacement: "const x = 2;\nconst y = 3;",
  explanation: "fix off-by-one",
};

describe("applyCandidateFixToBranch", () => {
  it("creates a branch off the base sha", async () => {
    const octokit = fakeOctokit(["line1", "line2", "line3"]);
    await applyCandidateFixToBranch(octokit as never, {
      owner: "acme",
      repo: "widgets",
      baseSha: "base-sha",
      branchName: "codelens/verify/1/0",
      fix,
    });
    expect(octokit.rest.git.createRef).toHaveBeenCalledWith({
      owner: "acme",
      repo: "widgets",
      ref: "refs/heads/codelens/verify/1/0",
      sha: "base-sha",
    });
  });

  it("replaces the given line range with the replacement text", async () => {
    const octokit = fakeOctokit(["line1", "line2", "line3"]);
    await applyCandidateFixToBranch(octokit as never, {
      owner: "acme",
      repo: "widgets",
      baseSha: "base-sha",
      branchName: "codelens/verify/1/0",
      fix,
    });
    const call = octokit.rest.repos.createOrUpdateFileContents.mock.calls[0][0];
    const written = Buffer.from(call.content, "base64").toString("utf-8");
    expect(written).toBe("line1\nconst x = 2;\nconst y = 3;\nline3");
    expect(call.sha).toBe("blob-sha-1");
    expect(call.branch).toBe("codelens/verify/1/0");
    expect(call.path).toBe("src/a.ts");
  });

  it("returns the branch name and new commit sha", async () => {
    const octokit = fakeOctokit(["line1", "line2", "line3"]);
    const result = await applyCandidateFixToBranch(octokit as never, {
      owner: "acme",
      repo: "widgets",
      baseSha: "base-sha",
      branchName: "codelens/verify/1/0",
      fix,
    });
    expect(result).toEqual({ branch: "codelens/verify/1/0", commitSha: "commit-sha-1" });
  });

  it("throws if the path is a directory, not a file", async () => {
    const octokit = fakeOctokit(["line1"]);
    octokit.rest.repos.getContent.mockResolvedValue({ data: [] });
    await expect(
      applyCandidateFixToBranch(octokit as never, {
        owner: "acme",
        repo: "widgets",
        baseSha: "base-sha",
        branchName: "codelens/verify/1/0",
        fix,
      }),
    ).rejects.toThrow(/not a file/);
  });
});
