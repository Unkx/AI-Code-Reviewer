import { describe, it, expect, vi } from "vitest";
import { ensureVerifyWorkflow, VERIFY_WORKFLOW_PATH } from "../setup-workflow";

function fakeOctokit() {
  return {
    rest: {
      repos: {
        getContent: vi.fn(),
        get: vi.fn().mockResolvedValue({ data: { default_branch: "main" } }),
        createOrUpdateFileContents: vi.fn().mockResolvedValue({}),
      },
      git: {
        getRef: vi.fn().mockResolvedValue({ data: { object: { sha: "main-sha" } } }),
        createRef: vi.fn().mockResolvedValue({}),
      },
      pulls: {
        create: vi.fn().mockResolvedValue({}),
      },
    },
  };
}

describe("ensureVerifyWorkflow", () => {
  it("returns 'exists' and does nothing when the workflow file is already present", async () => {
    const octokit = fakeOctokit();
    octokit.rest.repos.getContent.mockResolvedValue({ data: { type: "file", sha: "x" } });

    const result = await ensureVerifyWorkflow(octokit as never, "acme", "widgets");

    expect(result).toBe("exists");
    expect(octokit.rest.pulls.create).not.toHaveBeenCalled();
  });

  it("opens a setup PR when the workflow file is missing", async () => {
    const octokit = fakeOctokit();
    octokit.rest.repos.getContent.mockRejectedValue({ status: 404 });

    const result = await ensureVerifyWorkflow(octokit as never, "acme", "widgets");

    expect(result).toBe("pr-opened");
    expect(octokit.rest.git.createRef).toHaveBeenCalledWith({
      owner: "acme",
      repo: "widgets",
      ref: "refs/heads/codelens/setup-verify-workflow",
      sha: "main-sha",
    });
    expect(octokit.rest.repos.createOrUpdateFileContents).toHaveBeenCalledWith(
      expect.objectContaining({ path: VERIFY_WORKFLOW_PATH, branch: "codelens/setup-verify-workflow" }),
    );
    expect(octokit.rest.pulls.create).toHaveBeenCalledWith(
      expect.objectContaining({ owner: "acme", repo: "widgets", head: "codelens/setup-verify-workflow", base: "main" }),
    );
  });

  it("rethrows non-404 errors from getContent", async () => {
    const octokit = fakeOctokit();
    octokit.rest.repos.getContent.mockRejectedValue({ status: 500 });

    await expect(ensureVerifyWorkflow(octokit as never, "acme", "widgets")).rejects.toEqual({ status: 500 });
  });
});
