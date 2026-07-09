import type { Octokit } from "@octokit/rest";

export const VERIFY_WORKFLOW_PATH = ".github/workflows/codelens-verify.yml";
const SETUP_BRANCH = "codelens/setup-verify-workflow";

export const VERIFY_WORKFLOW_CONTENT = `on:
  workflow_dispatch:
    inputs:
      ref:
        required: true
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          ref: \${{ inputs.ref }}
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npm test
`;

function isNotFound(err: unknown): boolean {
  return typeof err === "object" && err !== null && "status" in err && (err as { status: unknown }).status === 404;
}

export async function ensureVerifyWorkflow(
  octokit: Octokit,
  owner: string,
  repo: string,
): Promise<"exists" | "pr-opened"> {
  try {
    await octokit.rest.repos.getContent({ owner, repo, path: VERIFY_WORKFLOW_PATH });
    return "exists";
  } catch (err) {
    if (!isNotFound(err)) {
      throw err;
    }
  }

  const { data: repoData } = await octokit.rest.repos.get({ owner, repo });
  const defaultBranch = repoData.default_branch;

  const { data: refData } = await octokit.rest.git.getRef({ owner, repo, ref: `heads/${defaultBranch}` });
  const baseSha = refData.object.sha;

  await octokit.rest.git.createRef({ owner, repo, ref: `refs/heads/${SETUP_BRANCH}`, sha: baseSha });

  await octokit.rest.repos.createOrUpdateFileContents({
    owner,
    repo,
    path: VERIFY_WORKFLOW_PATH,
    message: "chore: add CodeLens verify workflow",
    content: Buffer.from(VERIFY_WORKFLOW_CONTENT, "utf-8").toString("base64"),
    branch: SETUP_BRANCH,
  });

  await octokit.rest.pulls.create({
    owner,
    repo,
    title: "Add CodeLens verify workflow",
    head: SETUP_BRANCH,
    base: defaultBranch,
    body: "CodeLens needs this workflow to run your test suite against candidate fixes before suggesting them. Merge to enable verified fix suggestions on future pull requests.",
  });

  return "pr-opened";
}
