// @vitest-environment node
//
// This route calls `new Groq(...)` for real (reviewPullRequest itself is mocked, but
// the client construction in route.ts is not). The Groq SDK refuses to construct in a
// "browser-like" environment, and the project's global Vitest environment is
// `happy-dom` (needed for the React component tests elsewhere). This route has no DOM
// dependency, so it's scoped to `node` here rather than weakening the SDK's safety
// check or touching production code.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHmac } from "node:crypto";

const SECRET = "webhook-secret";

const ensureVerifyWorkflowMock = vi.fn();
const reviewPullRequestMock = vi.fn();
const dispatchVerificationMock = vi.fn();
const postInformationalCommentMock = vi.fn();
const handleWorkflowRunCompletedMock = vi.fn();

vi.mock("@/lib/github/app-client", () => ({
  createInstallationOctokit: vi.fn(() => fakeOctokit),
}));
vi.mock("@/lib/github/setup-workflow", () => ({
  ensureVerifyWorkflow: ensureVerifyWorkflowMock,
  VERIFY_WORKFLOW_PATH: ".github/workflows/codelens-verify.yml",
}));
vi.mock("@/lib/review/engine", () => ({
  reviewPullRequest: reviewPullRequestMock,
}));
vi.mock("@/lib/verify/orchestrator", () => ({
  dispatchVerification: dispatchVerificationMock,
  MAX_CANDIDATES_PER_PR: 5,
}));
vi.mock("@/lib/github/post-comment", () => ({
  postInformationalComment: postInformationalCommentMock,
  postSuggestionComment: vi.fn(),
}));
vi.mock("@/lib/verify/result-handler", () => ({
  handleWorkflowRunCompleted: handleWorkflowRunCompletedMock,
}));

const fakeOctokit = {
  rest: {
    pulls: { listFiles: vi.fn() },
    repos: { getContent: vi.fn() },
  },
};

function sign(payload: string) {
  return `sha256=${createHmac("sha256", SECRET).update(payload).digest("hex")}`;
}

function makeRequest(event: string, payload: unknown) {
  const body = JSON.stringify(payload);
  return new Request("http://localhost/api/webhook/github", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-github-event": event,
      "x-hub-signature-256": sign(body),
    },
    body,
  });
}

describe("POST /api/webhook/github", () => {
  let POST: (req: Request) => Promise<Response>;

  beforeEach(async () => {
    vi.resetModules();
    process.env.GITHUB_WEBHOOK_SECRET = SECRET;
    process.env.GROQ_API_KEY = "groq-key";
    ensureVerifyWorkflowMock.mockReset().mockResolvedValue("exists");
    reviewPullRequestMock.mockReset().mockResolvedValue([]);
    dispatchVerificationMock.mockReset().mockResolvedValue(undefined);
    postInformationalCommentMock.mockReset().mockResolvedValue(undefined);
    handleWorkflowRunCompletedMock.mockReset().mockResolvedValue("posted");
    fakeOctokit.rest.pulls.listFiles.mockReset().mockResolvedValue({ data: [] });
    fakeOctokit.rest.repos.getContent.mockReset().mockResolvedValue({
      data: { type: "file", content: Buffer.from(JSON.stringify({ scripts: { test: "vitest run" } })).toString("base64") },
    });
    const mod = await import("../route");
    POST = mod.POST as unknown as (req: Request) => Promise<Response>;
  });

  afterEach(() => {
    delete process.env.GITHUB_WEBHOOK_SECRET;
    delete process.env.GROQ_API_KEY;
  });

  it("returns 401 for an invalid signature", async () => {
    const body = JSON.stringify({ action: "created" });
    const req = new Request("http://localhost/api/webhook/github", {
      method: "POST",
      headers: { "content-type": "application/json", "x-github-event": "installation", "x-hub-signature-256": "sha256=bad" },
      body,
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("installs the verify workflow into every repo on install", async () => {
    const req = makeRequest("installation", {
      action: "created",
      installation: { id: 1 },
      repositories: [{ full_name: "acme/widgets" }],
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(ensureVerifyWorkflowMock).toHaveBeenCalledWith(fakeOctokit, "acme", "widgets");
  });

  it("dispatches verification for each candidate fix on pull_request opened", async () => {
    reviewPullRequestMock.mockResolvedValue([
      { id: "f1", file: "a.ts", lineStart: 1, lineEnd: 1, replacement: "x", explanation: "e" },
    ]);
    const req = makeRequest("pull_request", {
      action: "opened",
      installation: { id: 1 },
      repository: { name: "widgets", owner: { login: "acme" } },
      pull_request: { number: 7, head: { sha: "head-sha" } },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(dispatchVerificationMock).toHaveBeenCalledTimes(1);
    expect(postInformationalCommentMock).not.toHaveBeenCalled();
  });

  it("isolates a failing dispatchVerification call and still attempts/succeeds the rest", async () => {
    reviewPullRequestMock.mockResolvedValue([
      { id: "f1", file: "a.ts", lineStart: 1, lineEnd: 1, replacement: "x", explanation: "e" },
      { id: "f2", file: "b.ts", lineStart: 1, lineEnd: 1, replacement: "y", explanation: "e2" },
    ]);
    dispatchVerificationMock
      .mockRejectedValueOnce(new Error("422 branch already exists"))
      .mockResolvedValueOnce(undefined);
    const req = makeRequest("pull_request", {
      action: "opened",
      installation: { id: 1 },
      repository: { name: "widgets", owner: { login: "acme" } },
      pull_request: { number: 7, head: { sha: "head-sha" } },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(dispatchVerificationMock).toHaveBeenCalledTimes(2);
    const json = await res.json();
    expect(json.dispatched).toBe(1);
  });

  it("posts an informational comment instead of dispatching when no test command is detected", async () => {
    fakeOctokit.rest.repos.getContent.mockResolvedValue({
      data: { type: "file", content: Buffer.from(JSON.stringify({ scripts: {} })).toString("base64") },
    });
    reviewPullRequestMock.mockResolvedValue([
      { id: "f1", file: "a.ts", lineStart: 1, lineEnd: 1, replacement: "x", explanation: "e" },
    ]);
    const req = makeRequest("pull_request", {
      action: "opened",
      installation: { id: 1 },
      repository: { name: "widgets", owner: { login: "acme" } },
      pull_request: { number: 7, head: { sha: "head-sha" } },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(dispatchVerificationMock).not.toHaveBeenCalled();
    expect(postInformationalCommentMock).toHaveBeenCalledTimes(1);
  });

  it("resolves workflow_run completed events for the codelens verify workflow", async () => {
    const req = makeRequest("workflow_run", {
      action: "completed",
      installation: { id: 1 },
      repository: { name: "widgets", owner: { login: "acme" } },
      workflow_run: {
        head_branch: "codelens/verify/7/0",
        conclusion: "success",
        path: ".github/workflows/codelens-verify.yml",
      },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(handleWorkflowRunCompletedMock).toHaveBeenCalledWith(fakeOctokit, {
      owner: "acme",
      repo: "widgets",
      branchName: "codelens/verify/7/0",
      conclusion: "success",
    });
  });

  it("ignores workflow_run completed events from a workflow other than codelens-verify", async () => {
    const req = makeRequest("workflow_run", {
      action: "completed",
      installation: { id: 1 },
      repository: { name: "widgets", owner: { login: "acme" } },
      workflow_run: {
        head_branch: "codelens/verify/7/0",
        conclusion: "success",
        path: ".github/workflows/some-other-ci.yml",
      },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(handleWorkflowRunCompletedMock).not.toHaveBeenCalled();
  });

  it("returns 200 and ignores unhandled event types", async () => {
    const req = makeRequest("issues", { action: "opened" });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });
});
