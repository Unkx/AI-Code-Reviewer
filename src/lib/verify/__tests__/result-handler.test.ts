import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PendingVerification } from "../types";

const getPendingVerificationMock = vi.fn();
const deletePendingVerificationMock = vi.fn();
const postSuggestionCommentMock = vi.fn();

vi.mock("../pending-store", () => ({
  getPendingVerification: getPendingVerificationMock,
  deletePendingVerification: deletePendingVerificationMock,
}));
vi.mock("@/lib/github/post-comment", () => ({
  postSuggestionComment: postSuggestionCommentMock,
}));

const record: PendingVerification = {
  branch: "codelens/verify/7/0",
  owner: "acme",
  repo: "widgets",
  installationId: 42,
  prNumber: 7,
  file: "src/a.ts",
  lineStart: 1,
  lineEnd: 1,
  replacement: "const x = 1;",
  explanation: "fix",
  headShaAtDispatch: "head-sha",
  createdAt: 1000,
};

function fakeOctokit(prHeadSha: string) {
  return {
    rest: {
      pulls: { get: vi.fn().mockResolvedValue({ data: { head: { sha: prHeadSha } } }) },
      git: { deleteRef: vi.fn().mockResolvedValue({}) },
    },
  };
}

describe("handleWorkflowRunCompleted", () => {
  beforeEach(() => {
    vi.resetModules();
    getPendingVerificationMock.mockReset();
    deletePendingVerificationMock.mockReset();
    postSuggestionCommentMock.mockReset();
  });

  it("returns 'not-found' and does nothing when there is no pending record", async () => {
    getPendingVerificationMock.mockResolvedValue(null);
    const { handleWorkflowRunCompleted } = await import("../result-handler");
    const octokit = fakeOctokit("head-sha");

    const result = await handleWorkflowRunCompleted(octokit as never, {
      owner: "acme",
      repo: "widgets",
      branchName: "codelens/verify/7/0",
      conclusion: "success",
    });

    expect(result).toBe("not-found");
    expect(postSuggestionCommentMock).not.toHaveBeenCalled();
  });

  it("returns 'stale' and cleans up when the PR head has moved on", async () => {
    getPendingVerificationMock.mockResolvedValue(record);
    const { handleWorkflowRunCompleted } = await import("../result-handler");
    const octokit = fakeOctokit("newer-sha");

    const result = await handleWorkflowRunCompleted(octokit as never, {
      owner: "acme",
      repo: "widgets",
      branchName: "codelens/verify/7/0",
      conclusion: "success",
    });

    expect(result).toBe("stale");
    expect(postSuggestionCommentMock).not.toHaveBeenCalled();
    expect(deletePendingVerificationMock).toHaveBeenCalledWith("codelens/verify/7/0");
  });

  it("returns 'dropped' and cleans up on a failing test run", async () => {
    getPendingVerificationMock.mockResolvedValue(record);
    const { handleWorkflowRunCompleted } = await import("../result-handler");
    const octokit = fakeOctokit("head-sha");

    const result = await handleWorkflowRunCompleted(octokit as never, {
      owner: "acme",
      repo: "widgets",
      branchName: "codelens/verify/7/0",
      conclusion: "failure",
    });

    expect(result).toBe("dropped");
    expect(postSuggestionCommentMock).not.toHaveBeenCalled();
    expect(deletePendingVerificationMock).toHaveBeenCalledWith("codelens/verify/7/0");
  });

  it("posts a suggestion and cleans up on a passing test run", async () => {
    getPendingVerificationMock.mockResolvedValue(record);
    const { handleWorkflowRunCompleted } = await import("../result-handler");
    const octokit = fakeOctokit("head-sha");

    const result = await handleWorkflowRunCompleted(octokit as never, {
      owner: "acme",
      repo: "widgets",
      branchName: "codelens/verify/7/0",
      conclusion: "success",
    });

    expect(result).toBe("posted");
    expect(postSuggestionCommentMock).toHaveBeenCalledWith(octokit, {
      owner: "acme",
      repo: "widgets",
      prNumber: 7,
      commitSha: "head-sha",
      fix: {
        id: "codelens/verify/7/0",
        file: "src/a.ts",
        lineStart: 1,
        lineEnd: 1,
        replacement: "const x = 1;",
        explanation: "fix",
      },
    });
    expect(deletePendingVerificationMock).toHaveBeenCalledWith("codelens/verify/7/0");
  });

  it("deletes the temp branch after every resolved outcome", async () => {
    getPendingVerificationMock.mockResolvedValue(record);
    const { handleWorkflowRunCompleted } = await import("../result-handler");
    const octokit = fakeOctokit("head-sha");

    await handleWorkflowRunCompleted(octokit as never, {
      owner: "acme",
      repo: "widgets",
      branchName: "codelens/verify/7/0",
      conclusion: "failure",
    });

    expect(octokit.rest.git.deleteRef).toHaveBeenCalledWith({
      owner: "acme",
      repo: "widgets",
      ref: "heads/codelens/verify/7/0",
    });
  });
});
