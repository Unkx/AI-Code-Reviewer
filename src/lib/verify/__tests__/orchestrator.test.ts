import { describe, it, expect, vi, beforeEach } from "vitest";
import type { CandidateFix } from "../types";

const applyCandidateFixToBranchMock = vi.fn();
const savePendingVerificationMock = vi.fn();

vi.mock("../apply-patch", () => ({
  applyCandidateFixToBranch: applyCandidateFixToBranchMock,
}));
vi.mock("../pending-store", () => ({
  savePendingVerification: savePendingVerificationMock,
}));

const fix: CandidateFix = {
  id: "fix-1",
  file: "src/a.ts",
  lineStart: 1,
  lineEnd: 1,
  replacement: "const x = 1;",
  explanation: "fix",
};

describe("dispatchVerification", () => {
  beforeEach(() => {
    vi.resetModules();
    applyCandidateFixToBranchMock.mockReset();
    savePendingVerificationMock.mockReset();
    applyCandidateFixToBranchMock.mockResolvedValue({ branch: "codelens/verify/7/0", commitSha: "c1" });
  });

  it("applies the fix, dispatches the workflow, and saves a pending record", async () => {
    const { dispatchVerification } = await import("../orchestrator");
    const createWorkflowDispatch = vi.fn().mockResolvedValue({});
    const octokit = { rest: { actions: { createWorkflowDispatch } } };

    await dispatchVerification(octokit as never, {
      owner: "acme",
      repo: "widgets",
      installationId: 42,
      prNumber: 7,
      headSha: "head-sha",
      fix,
      index: 0,
    });

    expect(applyCandidateFixToBranchMock).toHaveBeenCalledWith(octokit, {
      owner: "acme",
      repo: "widgets",
      baseSha: "head-sha",
      branchName: "codelens/verify/7/0",
      fix,
    });

    expect(createWorkflowDispatch).toHaveBeenCalledWith({
      owner: "acme",
      repo: "widgets",
      workflow_id: "codelens-verify.yml",
      ref: "codelens/verify/7/0",
      inputs: { ref: "codelens/verify/7/0" },
    });

    expect(savePendingVerificationMock).toHaveBeenCalledWith({
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
      createdAt: expect.any(Number),
    });
  });
});

describe("MAX_CANDIDATES_PER_PR", () => {
  it("caps candidates at 5", async () => {
    const { MAX_CANDIDATES_PER_PR } = await import("../orchestrator");
    expect(MAX_CANDIDATES_PER_PR).toBe(5);
  });
});
